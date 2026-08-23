// 成就引擎:定义 + 评估解锁 + 起飞值(循证:即时奖励对抗延迟折扣;无羞耻原则——庆祝开始与回来)
import { prisma } from "./db";
import { getProfile, suggestGranularity } from "./profile";

export interface AchievementDef {
  key: string;
  title: string;
  desc: string;
  icon: string;
  goal: number; // 目标值(用于进度)
  value: (s: Stats) => number; // 当前值
}

export interface Stats {
  checkins: number;
  notes: number;
  sessions: number;
  parks: number;
  streak: number;
  granSuggest: number;
  freshStarts: number;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: "first_start", title: "初次点火", desc: "完成第一次打卡 — 万事开头的那一下最贵", icon: "🚀", goal: 1, value: (s) => s.checkins },
  { key: "micro_10", title: "微步大师", desc: "累计 10 次启动 — 小步骤的复利正在发生", icon: "👟", goal: 10, value: (s) => s.checkins },
  { key: "streak_3", title: "三日之约", desc: "连续 3 天都开始了", icon: "🔥", goal: 3, value: (s) => s.streak },
  { key: "streak_7", title: "七日火焰", desc: "连续 7 天 — 习惯的第一块基石", icon: "🏆", goal: 7, value: (s) => s.streak },
  { key: "streak_21", title: "廿一日习惯", desc: "连续 21 天 — 行为科学里的习惯雏形期", icon: "🌱", goal: 21, value: (s) => s.streak },
  { key: "gran_5", title: "粒度升级", desc: "画像显示你已能稳定驾驭 5 分钟粒度 — 你在长大", icon: "📈", goal: 5, value: (s) => s.granSuggest },
  { key: "park_5", title: "停车场老板", desc: "杂念停车场累计停了 5 辆 — 大脑越来越清爽", icon: "🅿️", goal: 5, value: (s) => s.parks },
  { key: "focus_3", title: "同桌常客", desc: "3 次陪伴冲刺 — 有人陪的坚持更轻松", icon: "🪑", goal: 3, value: (s) => s.sessions },
  { key: "comeback", title: "王者归来", desc: "断签后选择重新开始 — 回来比不断更重要", icon: "💫", goal: 1, value: (s) => s.freshStarts },
  { key: "review_1", title: "复盘之镜", desc: "完成了第一次周复盘 — 看见自己是改变的起点", icon: "🪞", goal: 1, value: () => 0 /* 由 review 路由直接解锁 */ },
];

async function collectStats(userId: string): Promise<Stats> {
  const [checkins, notes, sessions, parks, profile] = await Promise.all([
    prisma.checkIn.count(),
    prisma.checkIn.count({ where: { note: { not: "" } } }),
    prisma.focusSession.count({ where: { userId } }),
    prisma.parkedThought.count({ where: { userId } }),
    prisma.profile.findFirst({ where: { userId } }),
  ]);
  // streak:与 today 路由同源逻辑(按日期连续)
  const rows = await prisma.checkIn.findMany({ orderBy: { startedAt: "desc" }, take: 120, select: { startedAt: true } });
  const days = new Set(rows.map((r) => `${r.startedAt.getFullYear()}-${String(r.startedAt.getMonth() + 1).padStart(2, "0")}-${String(r.startedAt.getDate()).padStart(2, "0")}`));
  const d0 = new Date();
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let streak = 0;
  let cur = new Date(d0);
  if (!days.has(key(cur))) cur = new Date(cur.getTime() - 86400000);
  while (days.has(key(cur))) { streak += 1; cur = new Date(cur.getTime() - 86400000); }
  let granSuggest = 2;
  let freshStarts = 0;
  try {
    const dual = await getProfile(userId);
    granSuggest = suggestGranularity(dual.procrastination);
  } catch { /* 默认 */ }
  try {
    const st = JSON.parse(profile?.settings || "{}");
    freshStarts = st.lastFreshStart ? 1 : 0;
  } catch { /* ignore */ }
  return { checkins, notes, sessions, parks, streak, granSuggest, freshStarts };
}

export interface AchievementView {
  key: string; title: string; desc: string; icon: string;
}
export interface AchievementOutcome {
  points: number;
  unlocked: (AchievementView & { unlockedAt: Date })[];
  newly: AchievementView[];
  next: (AchievementView & { progress: number; goal: number })[];
}

/** 评估并落库新解锁;幂等 */
export async function evaluateAchievements(userId: string): Promise<AchievementOutcome> {
  const stats = await collectStats(userId);
  const existing = await prisma.achievementUnlock.findMany({ where: { userId } });
  const have = new Set(existing.map((e) => e.key));
  const newly: AchievementView[] = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (have.has(def.key)) continue;
    if (def.key === "review_1") continue; // 由 review 路由解锁
    if (def.value(stats) >= def.goal) {
      await prisma.achievementUnlock.upsert({
        where: { userId_key: { userId, key: def.key } },
        update: {},
        create: { userId, key: def.key },
      });
      newly.push({ key: def.key, title: def.title, desc: def.desc, icon: def.icon });
    }
  }
  const unlockedRows = await prisma.achievementUnlock.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
  });
  const defMap = new Map(ACHIEVEMENT_DEFS.map((d) => [d.key, d]));
  const unlocked = unlockedRows
    .map((r) => {
      const d = defMap.get(r.key);
      return d ? { key: r.key, title: d.title, desc: d.desc, icon: d.icon, unlockedAt: r.unlockedAt } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const locked = ACHIEVEMENT_DEFS
    .filter((d) => !have.has(d.key) && d.key !== "review_1")
    .map((d) => ({ ...d, ratio: d.value(stats) / d.goal }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .map((d) => ({ key: d.key, title: d.title, desc: d.desc, icon: d.icon, progress: Math.min(d.value(stats), d.goal), goal: d.goal }));
  const points = stats.checkins * 10 + stats.sessions * 15 + stats.parks * 2 + stats.notes * 5;
  return { points, unlocked, newly, next: locked };
}

/** review 路由专用:直接解锁复盘之镜 */
export async function unlockReview(userId: string): Promise<void> {
  await prisma.achievementUnlock.upsert({
    where: { userId_key: { userId, key: "review_1" } },
    update: {},
    create: { userId, key: "review_1" },
  });
}
