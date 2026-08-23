// Pace 节奏伴侣:纯模板、确定性(按标题哈希选模板),不联网
// P0-3 语气自适应:按拖延画像选择督促人格(完美主义→温和接纳 / 动力型→目标联结 / 默认→平稳)
import { hashString } from "../llm";
import type { ProcrastinationProfile, StartCard } from "../types";

export type PaceTone = "gentle" | "connect" | "drill";

export function detectTone(p?: ProcrastinationProfile | null): PaceTone {
  if (!p?.blockerDist) return "drill";
  const entries = Object.entries(p.blockerDist) as [string, number | undefined][];
  const top = entries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0];
  if (top === "完美主义型" || top === "畏难型") return "gentle";
  if (top === "动力型") return "connect";
  return "drill";
}

const TONE_LABEL: Record<PaceTone, string> = {
  gentle: "温和接纳",
  connect: "目标联结",
  drill: "平稳督促",
};

const CELEBRATION_TEMPLATES: readonly ((task: string) => string)[] = [
  (t) => `启动成功!「${t}」完成——今天的你,赢过了昨天的犹豫。`,
  (t) => `打卡 ✔「${t}」不需要完美,「开始过」就已经算数。`,
  (t) => `又进一步!「${t}」完成,现在可以心安理得地休息。`,
  (t) => `好样的!「${t}」从「想做」变成了「做过」。`,
  (t) => `小胜利 +1:「${t}」✔ 连续的小成功正在降低你的启动成本。`,
  (t) => `完成即奖励:「${t}」——明天也只要求「开始 2 分钟」。`,
];

/** 即时奖励文案(打卡成功后立刻给,对抗延迟折扣) */
export function celebrate(taskTitle: string): string {
  const t = taskTitle.trim() || "今日任务";
  const idx = hashString(`celebrate:${t}`) % CELEBRATION_TEMPLATES.length;
  return CELEBRATION_TEMPLATES[idx](t);
}

/** 执行意图式提醒:所有提醒统一为「如果-那么」句式(本方案最大单一杠杆) */
export function reminder(startCard: StartCard): string {
  const bank: readonly string[] = [
    `⏰ 到点启动:${startCard.intent}(只需 ${startCard.minutes} 分钟:${startCard.firstStep})`,
    `别想太多,直接执行:${startCard.intent}。做完第一步随时可以停,不做了也已经赢。`,
    `两分钟规则:${startCard.intent}——完成标准:${startCard.doneCriteria}`,
  ];
  return bank[hashString(`reminder:${startCard.intent}`) % bank.length];
}


/** 会话结束语(陪伴冲刺收尾,按语气生成) */
export function sessionClosing(goalText: string, completed: boolean, tone: PaceTone): string {
  const g = goalText.trim().slice(0, 16) || "这轮冲刺";
  if (completed) {
    const bank: Record<PaceTone, string> = {
      gentle: `🟢 收工!「${g}」做到这里就够了 —— 不追求完美,你今天已经赢过犹豫。`,
      connect: `🟢 收工!「${g}」离你想成为的人又近了一格,看见这个进步。`,
      drill: `🟢 收工!「${g}」完成,记录已入画像 —— 下一次启动会更容易。`,
    };
    return bank[tone];
  }
  const bank: Record<PaceTone, string> = {
    gentle: `🟢 停在这里也可以。「${g}」只做了一部分,但「开始了」本身就是数据点,不算失败。`,
    connect: `🟢 没做完没关系,「${g}」的每一步都算数 —— 下次从刚才卡住的那步继续。`,
    drill: `🟢 提前收尾,已如实记录。找到卡点了吗?下次拆得更小再来。`,
  };
  return bank[tone];
}

export function toneLabel(tone: PaceTone): string {
  return TONE_LABEL[tone];
}
