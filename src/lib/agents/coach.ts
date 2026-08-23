// Coach 规划教练:以技能包周模板为骨架生成周-日-任务三级计划;首周「最低可持续」压载
import { z } from "zod";
import { fmtDate } from "../datetime";
import { chatJSONWithFallback } from "../llm";
import { getProfile } from "../profile";
import { clampInt, llmCoachPlanSchema, toGranularity } from "../schemas";
import { buildCoachPlanFromSkillPack, loadSkillPack, type SkillPack } from "../skillpack";
import type { CoachPlan, DayPlan, Granularity, TaskItem, WeekPlan } from "../types";

export interface CoachGoalInput {
  userId: string;
  goalId: string; // 任务 id 前缀:{goalId}-w{week}-d{day}-t{n}
  title: string;
  weeks: number;
  minutesPerDay: number;
  motivation: string;
  skillPackId: string;
  /** 可选:直接传入已匹配的技能包(目标→技能包智能匹配);缺省按 skillPackId 加载 */
  skillPack?: SkillPack;
}

const COACH_SYSTEM = [
  "你是 Kickoff 的 Coach 规划教练,为拖延倾向学习者生成「周-日-任务」三级学习计划。",
  "原则:",
  "1) 循证依据:首周按「最低可持续」压载(微习惯/两分钟规则),先建立连续启动记录,再逐步加量。",
  "2) 若画像显示某粒度启动成功率 <0.5,优先下调粒度;低谷日(周几)任务减半。",
  "3) 任务标题具体可执行、≤20 字;每天任务 1-3 个。",
  "4) 不需要输出任务 id 和日期(系统会规范化生成),只需 focus/days.tasks(title,minutes,granularity)。",
  "5) notes 给用户 2-4 条中文说明(必须包含首周压载原则)。",
].join("\n");

const COACH_SCHEMA_HINT =
  'CoachPlan JSON:{"weeks":[{"focus":"本周主题","days":[{"tasks":[{"title":"...","minutes":10,"granularity":5}]}]}],"notes":["..."]}(weeks 数=总周数,每周恰好 7 个 days)';

/**
 * 主流程:模板兜底计划 → 注入画像请求 LLM → zod 校验失败/异常则回退模板;
 * 无论来源如何,id/日期/首周压载约束都在本地规范化,保证契约字段绝对正确。
 */
export async function generatePlan(goal: CoachGoalInput): Promise<CoachPlan> {
  const pack = goal.skillPack ?? loadSkillPack(goal.skillPackId);
  const startDate = new Date();
  const fallback = buildCoachPlanFromSkillPack(pack, {
    planId: goal.goalId,
    weeks: goal.weeks,
    minutesPerDay: goal.minutesPerDay,
    startDate,
  });

  let profileBlock = "(暂无画像:按新手默认,六型卡点均匀先验)";
  try {
    const dual = await getProfile(goal.userId);
    profileBlock = JSON.stringify({
      卡点分布: dual.procrastination.blockerDist,
      各粒度启动成功率: dual.procrastination.successByGran,
      平均启动延迟分钟: dual.procrastination.avgStartDelayMin,
      活跃时段: dual.procrastination.activeHours,
      低谷日: dual.procrastination.lowDays,
      历史完成率: dual.learner.historyCompletion,
    });
  } catch {
    // 画像读取失败不阻塞规划
  }

  const outline = pack.weeks
    .map((w) => `第${w.week}周|${w.focus}|${w.tasks.map((t) => t.title).join(" / ")}`)
    .join("\n");
  const user = [
    `学习目标:${goal.title}`,
    `动机:${goal.motivation || "(未填写)"}`,
    `总周数:${goal.weeks}`,
    `每天可用时间:${goal.minutesPerDay} 分钟`,
    `开始日期:${fmtDate(startDate)}`,
    `weeks=${goal.weeks}`,
    "",
    "技能包周大纲(以此为骨架,可改写表述但保持主题顺序):",
    outline,
    "",
    `用户拖延画像(JSON):${profileBlock}`,
    "",
    "硬性要求:",
    "1) 恰好输出 weeks.length=总周数,每周 days.length=7。",
    "2) 第 1 周「最低可持续」:每天 1-2 个任务,granularity 只允许 2 或 5,任务 minutes ≤15。",
    "3) 第 2 周起按每天可用时间装载,每天任务 ≤3,granularity 10 或 15。",
  ].join("\n");

  try {
    const raw = await chatJSONWithFallback<unknown>(COACH_SYSTEM, user, COACH_SCHEMA_HINT);
    const parsed = llmCoachPlanSchema.safeParse(raw);
    if (!parsed.success) return fallback;
    return normalizeLLMPlan(parsed.data, goal, fallback);
  } catch {
    return fallback;
  }
}

function normalizeLLMPlan(
  data: z.infer<typeof llmCoachPlanSchema>,
  goal: CoachGoalInput,
  fallback: CoachPlan
): CoachPlan {
  const weeks: WeekPlan[] = [];
  for (let w = 1; w <= goal.weeks; w++) {
    const fbWeek = fallback.weeks[w - 1];
    const llmWeek = data.weeks[w - 1];
    const isWeek1 = w === 1;
    const focus = llmWeek?.focus?.trim() || fbWeek.focus;
    const days: DayPlan[] = [];
    for (let d = 0; d < 7; d++) {
      // 日期一律采用模板生成的确定性日期(从今天起 7×week 天)
      const date = fbWeek.days[d].date;
      // 首周:直接采用技能包模板任务(已压载,且可能携带用户资源链接),不经 LLM 重写
      if (isWeek1) {
        days.push({ date, tasks: fbWeek.days[d].tasks.map((t) => ({ ...t })) });
        continue;
      }
      const source = llmWeek?.days?.[d]?.tasks ?? [];
      const cap = 3;
      const tasks: TaskItem[] = [];
      for (let i = 0; i < Math.min(source.length, cap); i++) {
        const t = source[i];
        const fbGran = fbWeek.days[d].tasks[i]?.granularity ?? 10;
        const gran = t.granularity !== undefined ? toGranularity(t.granularity) : fbGran;
        const fbLink = fbWeek.days[d].tasks[i];
        tasks.push({
          id: `${goal.goalId}-w${w}-d${d + 1}-t${tasks.length + 1}`,
          title: t.title.slice(0, 80),
          minutes: clampInt(t.minutes ?? gran, 1, 60),
          granularity: gran,
          done: false,
          ...(fbLink?.link ? { link: fbLink.link, linkTitle: fbLink.linkTitle } : {}),
        });
      }
      if (tasks.length === 0) tasks.push(...fbWeek.days[d].tasks);
      days.push({ date, tasks });
    }
    weeks.push({ week: w, focus, days });
  }
  const notes: string[] = [fallback.notes[0]];
  for (const n of data.notes ?? []) {
    const s = n.trim();
    if (s && !notes.includes(s) && notes.length < 5) notes.push(s);
  }
  return { weeks, notes };
}
