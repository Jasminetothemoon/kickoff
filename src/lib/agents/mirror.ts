// Mirror 复盘明镜:汇总打卡(延迟/完成率/卡点)→ 复盘报告 + 画像增量 + 计划调整建议
// 数字与结论全部本地确定性计算(可审计);LLM 仅用于摘要措辞润色,失败即用本地摘要
import { chatJSONWithFallback } from "../llm";
import { detectLowDays } from "../profile";
import { llmSummarySchema } from "../schemas";
import type { ProcrastinationProfile, ReviewResult } from "../types";

export interface MirrorCheckIn {
  taskId: string;
  taskTitle: string;
  granularity: number;
  mood: string;
  delaySeconds: number;
  startedAt: string; // ISO
  completed: boolean;
}

interface MirrorStats {
  total: number;
  completed: number;
  avgDelayMin: number;
  startRatePct: number;
  errorTypes: ReviewResult["errorTypes"];
  profileDelta: Partial<ProcrastinationProfile>;
  planAdjustments: ReviewResult["planAdjustments"];
}

const WEEKDAY_CN = "日一二三四五六";

function computeStats(checkIns: MirrorCheckIn[]): MirrorStats {
  const total = checkIns.length;
  const completed = checkIns.filter((c) => c.completed).length;
  const avgDelayMin =
    total === 0
      ? 0
      : Math.round((checkIns.reduce((s, c) => s + c.delaySeconds, 0) / total / 60) * 10) / 10;
  // 启动成功 = 提醒后 10 分钟内开始(与 profile.updateOnCheckIn 口径一致)
  const fast = checkIns.filter((c) => c.delaySeconds <= 600).length;
  const startRatePct = total === 0 ? 0 : Math.round((fast / total) * 100);
  const lowDays = detectLowDays(
    checkIns.map((c) => ({ startedAt: c.startedAt, completedAt: c.completed ? c.startedAt : null }))
  );

  const errorTypes: ReviewResult["errorTypes"] = [];
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const c of checkIns) {
    if (seen.has(c.taskId)) dups.add(c.taskId);
    seen.add(c.taskId);
  }
  if (dups.size > 0) {
    errorTypes.push({
      kind: "知识",
      note: `${dups.size} 个任务出现重复打卡,可能存在理解卡点,建议回看相关知识点`,
    });
  }
  if (total > 0 && (avgDelayMin > 10 || startRatePct < 50)) {
    errorTypes.push({
      kind: "习惯",
      note: `平均启动延迟 ${avgDelayMin} 分钟、启动成功率 ${startRatePct}%,启动阻力明显`,
    });
  }
  const moodHits = checkIns.filter((c) => /焦虑|烦躁|累|疲惫|丧|emo|压力|不想/i.test(c.mood));
  if (moodHits.length > 0) {
    errorTypes.push({
      kind: "情绪",
      note: `打卡时出现 ${moodHits.length} 次负面情绪词(如「${moodHits[0].mood || "—"}」),先接纳再行动`,
    });
  }

  const planAdjustments: ReviewResult["planAdjustments"] = [];
  if (lowDays.length > 0) {
    planAdjustments.push({
      kind: "reduce",
      note: `周${lowDays.map((w) => WEEKDAY_CN[w]).join("、")} 完成率低于 40%,已标记为低谷日,该日任务自动减半`,
    });
  }
  if (total > 0 && startRatePct < 50) {
    planAdjustments.push({
      kind: "granularity",
      note: `当前启动成功率 ${startRatePct}% <50%,建议把任务粒度降至 2 分钟`,
    });
  }
  if (avgDelayMin > 15) {
    planAdjustments.push({
      kind: "reschedule",
      note: `平均启动延迟 ${avgDelayMin} 分钟偏长,建议提醒提前 15 分钟并绑定活跃时段`,
    });
  }

  const profileDelta: Partial<ProcrastinationProfile> =
    total > 0
      ? { avgStartDelayMin: avgDelayMin, ...(lowDays.length > 0 ? { lowDays } : {}) }
      : {};
  return { total, completed, avgDelayMin, startRatePct, errorTypes, profileDelta, planAdjustments };
}

function defaultSummary(scope: "day" | "week", s: MirrorStats): string[] {
  if (s.total === 0) {
    return [
      `本${scope === "day" ? "日" : "周"}还没有打卡记录。`,
      "先完成一次 2 分钟的最小启动,数据就会开始积累。",
      "没有数据也是一种信号:计划的门槛可能定得太高了。",
    ];
  }
  return [
    `本${scope === "day" ? "日" : "周"}共打卡 ${s.total} 次,完成 ${s.completed} 次,平均启动延迟 ${s.avgDelayMin} 分钟。`,
    s.startRatePct >= 50
      ? `启动成功率 ${s.startRatePct}%,启动状态稳定,可维持当前任务粒度。`
      : `启动成功率 ${s.startRatePct}%,启动阻力偏大,建议把任务粒度降到 2 分钟。`,
    s.planAdjustments.some((a) => a.kind === "reduce")
      ? "检测到低谷日:相应 weekday 的任务会自动减载,不必靠意志力硬扛。"
      : "未发现明显低谷日,当前节奏可以维持,继续守住「每天都开始」。",
  ];
}

export async function review(
  scope: "day" | "week",
  checkIns: MirrorCheckIn[]
): Promise<ReviewResult> {
  const stats = computeStats(checkIns);
  let summary = defaultSummary(scope, stats);
  try {
    const user = [
      `周期:${scope === "day" ? "今日" : "最近 7 天"}`,
      `共打卡 ${stats.total} 次,完成 ${stats.completed} 次,平均启动延迟 ${stats.avgDelayMin} 分钟,启动成功率 ${stats.startRatePct}%。`,
      `任务示例:${checkIns.slice(0, 3).map((c) => c.taskTitle || "未命名任务").join(" / ") || "(无)"}`,
    ].join("\n");
    const raw = await chatJSONWithFallback<unknown>(
      "你是 Kickoff 的 Mirror 复盘明镜。只输出 JSON;summary 恰好 3 条,每条一句话,必须引用给定数字,语气克制、不评判、不制造羞耻感。",
      user,
      'ReviewResult 摘要 JSON:{"summary":["...","...","..."]}(恰好 3 条中文)'
    );
    const parsed = llmSummarySchema.safeParse(raw);
    if (parsed.success) summary = parsed.data.summary;
  } catch {
    // 摘要润色失败 → 用本地统计摘要
  }
  return {
    summary,
    errorTypes: stats.errorTypes,
    profileDelta: stats.profileDelta,
    planAdjustments: stats.planAdjustments,
  };
}
