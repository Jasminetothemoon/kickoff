// Spark 点火引擎:卡点判定 + 接纳型共情 + 微步骤拆解 + 启动卡(执行意图)
import { z } from "zod";
import { chatJSONWithFallback, Rng, hashString } from "../llm";
import { BLOCKER_TYPES, clampInt, llmDecomposeSchema } from "../schemas";
import type { BlockerType, DecomposeResult, Granularity, StartCard } from "../types";

const SPARK_SYSTEM = [
  "你是 Kickoff 的 Spark 点火引擎,专门帮被拖延困住的学习者完成「从 0 到启动」。",
  "工作准则:",
  "1) 先判定卡点类型,六选一:模糊型/畏难型/完美主义型/动力型/环境型/疲劳型。",
  "2) empathy 必须是接纳型回应:先命名并接纳当下情绪(不评判、不说教、不施压),再自然引出行动。",
  "3) 把任务拆成 3-6 个微步骤,第一步必须 ≤2 分钟,且具体到可见动作。",
  "4) startCard.intent 必须是执行意图句式:「如果到了X时间在X地点,我就…」,不得使用其他句式。",
  "5) 全部中文,语气温暖克制;标题简短(≤20 字)。",
].join("\n");

const SPARK_SCHEMA_HINT =
  'DecomposeResult JSON:{"blocker":"模糊型|畏难型|完美主义型|动力型|环境型|疲劳型","empathy":"接纳型回应(1-2句)","steps":[{"title":"微步骤","minutes":2}](3-6 个,第一个 ≤2 分钟),"startCard":{"firstStep":"≤2分钟的第一步","minutes":2,"doneCriteria":"可观察的完成标准","intent":"如果到了X时间在X地点,我就…"}}';

// 启动卡内存缓存(近期 decompose 结果供 /api/today 复用;MVP 单实例够用)
const startCardCache = new Map<string, { startCard: StartCard; createdAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function cacheStartCard(taskId: string, startCard: StartCard): void {
  startCardCache.set(taskId, { startCard, createdAt: Date.now() });
  if (startCardCache.size > 200) {
    const oldest = startCardCache.keys().next().value;
    if (typeof oldest === "string") startCardCache.delete(oldest);
  }
}

export function getCachedStartCard(taskId: string): StartCard | null {
  const hit = startCardCache.get(taskId);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    startCardCache.delete(taskId);
    return null;
  }
  return hit.startCard;
}

const EMPATHY_BANK: Record<BlockerType, string> = {
  模糊型: "这件事还没被拆开,大脑把它当成「一大团」来抗拒很正常——不是懒,是任务还不够具体。我们把它切小。",
  畏难型: "觉得难,说明你在乎结果。现在不要求做好,只要求开始 2 分钟,难度会随着接触自动下降。",
  完美主义型: "先允许一个 60 分的烂开始:草稿可以很糟,有糟的版本才有得改。",
  动力型: "动力不是等来的,是开始之后才出现的。先让身体动起来,情绪会跟上。",
  环境型: "环境不给力确实很消耗人。我们用一个固定的「如果-那么」场景,把干扰隔离出去。",
  疲劳型: "现在精力不足,那就别硬扛。把任务缩到今天能承受的最小份,做完就休息。",
};

/** 确定性兜底:LLM 不可用/输出不合法时,按输入哈希稳定生成 */
function fallbackDecompose(
  rawTask: string,
  mood?: string,
  granularityHint?: Granularity
): DecomposeResult {
  const rng = new Rng(hashString(`spark:${rawTask}|${mood ?? ""}|${granularityHint ?? ""}`));
  const short = rawTask.length > 20 ? `${rawTask.slice(0, 20)}…` : rawTask;
  const blocker = rng.pick(BLOCKER_TYPES);
  const base: { title: string; minutes: number }[] = [
    { title: `只打开工具,把「${short}」写在今天清单第一行`, minutes: 2 },
    { title: `花 2 分钟只看「${short}」的要求或目录,不动手`, minutes: 2 },
    { title: `做第一个最小动作:写下「${short}」的第一行`, minutes: 5 },
    { title: `顺着做 5 分钟,做到哪算哪,允许烂开始`, minutes: 5 },
    { title: `收尾 1 分钟:记下停在哪,明天从哪一步开始`, minutes: 2 },
  ];
  const steps = base.slice(0, rng.int(3, 5));
  if (granularityHint && granularityHint >= 10 && steps.length < 6) {
    steps.push({ title: `进入 ${granularityHint} 分钟冲刺:只做「${short}」这一件事`, minutes: granularityHint });
  }
  const empathyPrefix = mood
    ? `我注意到你现在的状态是「${mood}」——先看见它,不必急着赶走它。`
    : "";
  const startCard: StartCard = {
    firstStep: steps[0].title,
    minutes: 2,
    doneCriteria: `能在清单或便签上看到「${short}」写在第一行`,
    intent: `如果到了今晚 20:00 在书桌前,我就花 2 分钟完成「${steps[0].title}」`,
  };
  return { blocker, empathy: `${empathyPrefix}${EMPATHY_BANK[blocker]}`, steps, startCard };
}

/** 规范化 LLM 输出:步骤数 3-6、第一步 ≤2 分钟、intent 句式兜底重写 */
function normalizeDecompose(
  data: z.infer<typeof llmDecomposeSchema>,
  fb: DecomposeResult
): DecomposeResult {
  const steps = data.steps
    .slice(0, 6)
    .map((s) => ({ title: s.title.slice(0, 120), minutes: clampInt(s.minutes, 1, 30) }));
  while (steps.length < 3 && steps.length < fb.steps.length) {
    steps.push(fb.steps[steps.length]);
  }
  steps[0] = { ...steps[0], minutes: Math.min(steps[0].minutes, 2) };
  const sc = data.startCard;
  const firstStep = sc.firstStep.trim().slice(0, 120) || steps[0].title;
  let intent = sc.intent.trim();
  if (!/如果.+就/.test(intent)) {
    intent = `如果到了今晚 20:00 在书桌前,我就开始「${firstStep}」`;
  }
  return {
    blocker: data.blocker,
    empathy: data.empathy.trim() || fb.empathy,
    steps,
    startCard: {
      firstStep,
      minutes: clampInt(sc.minutes ?? steps[0].minutes, 1, 2),
      doneCriteria: sc.doneCriteria.trim() || fb.startCard.doneCriteria,
      intent,
    },
  };
}

export async function decompose(
  rawTask: string,
  mood?: string,
  granularityHint?: Granularity
): Promise<DecomposeResult> {
  const fb = fallbackDecompose(rawTask, mood, granularityHint);
  const user = [
    `任务:${rawTask}`,
    `当前情绪:${mood || "(未提供)"}`,
    granularityHint
      ? `当前适配粒度:${granularityHint} 分钟(第一步仍必须 ≤2 分钟)`
      : "当前适配粒度:默认 2 分钟起步",
  ].join("\n");
  try {
    const raw = await chatJSONWithFallback<unknown>(SPARK_SYSTEM, user, SPARK_SCHEMA_HINT);
    const parsed = llmDecomposeSchema.safeParse(raw);
    if (!parsed.success) return fb;
    return normalizeDecompose(parsed.data, fb);
  } catch {
    return fb;
  }
}
