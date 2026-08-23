import { NextResponse } from "next/server";
import { apiError, errorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";
import { diffDays, todayStr } from "@/lib/datetime";
import { loadPlansForGoal } from "@/lib/planStore";
import { getCachedStartCard } from "@/lib/agents/spark";
import { prisma as _prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TodayStats {
  streak: number;
  startedToday: boolean;
  streakFrozen?: boolean;      // 昨日断签但已自动宽恕(连续保留)
  invite?: { title: string; body: string } | null; // 活跃时段主动邀约
  freshStartAvailable?: boolean;
}

/** 连续启动天数 + 无羞耻机制(PRD P0-2):每滚动 7 天自动宽恕 1 次断签 */
async function startStats(userId: string): Promise<TodayStats> {
  const rows = await _prisma.checkIn.findMany({
    orderBy: { startedAt: "desc" },
    take: 120,
    select: { startedAt: true },
  });
  // 多用户说明:CheckIn 暂无 userId 列,本 MVP 以单库单租户运行;迁移多租户时补列即可
  const days = new Set(rows.map((r) => `${r.startedAt.getFullYear()}-${String(r.startedAt.getMonth() + 1).padStart(2, "0")}-${String(r.startedAt.getDate()).padStart(2, "0")}`));
  const d0 = new Date();
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startedToday = days.has(key(d0));
  let streak = 0;
  let cur = new Date(d0);
  if (!startedToday) cur = new Date(cur.getTime() - 86400000);
  while (days.has(key(cur))) {
    streak += 1;
    cur = new Date(cur.getTime() - 86400000);
  }
  const stats: TodayStats = { streak, startedToday };

  // 无羞恕宽恕:昨日断签 && 前日仍有 ≥3 连续 && 7 天内未用过宽恕 → 连续保留并标记
  if (!startedToday && streak === 0) {
    const y = new Date(d0.getTime() - 86400000);
    const yKey = key(y);
    const beforeYesterday = new Date(y.getTime() - 86400000);
    if (!days.has(yKey)) {
      let prev = 0;
      let c = beforeYesterday;
      while (days.has(key(c))) { prev += 1; c = new Date(c.getTime() - 86400000); }
      let forgiveLast = 0;
      try {
        const prof = await _prisma.profile.findFirst({ where: { userId } });
        forgiveLast = Number(JSON.parse(prof?.settings || "{}").forgiveLastAt) || 0;
      } catch { /* ignore */ }
      if (prev >= 3 && Date.now() - forgiveLast > 7 * 86400000) {
        stats.streak = prev;
        stats.streakFrozen = true;
        try {
          const prof = await _prisma.profile.findFirst({ where: { userId } });
          if (prof) {
            const st = JSON.parse(prof.settings || "{}");
            st.forgiveLastAt = Date.now();
            await _prisma.profile.update({ where: { id: prof.id }, data: { settings: JSON.stringify(st) } });
          }
        } catch { /* ignore */ }
      }
    }
  }
  stats.freshStartAvailable = !startedToday && streak === 0 && rows.length > 0;

  // 主动邀约(PRD P0-1 应用内形态):活跃时段 && 今日未启动 && 已有目标
  const hour = d0.getHours();
  try {
    const prof = await _prisma.profile.findFirst({ where: { userId } });
    const active = JSON.parse(prof?.procrastination || "{}").activeHours || [20, 21, 22];
    const hasGoal = (await _prisma.goal.count({ where: { userId } })) > 0;
    if (!startedToday && hasGoal && (active as number[]).includes(hour)) {
      stats.invite = {
        title: `现在是 ${hour}:00 前后 —— 你的黄金启动时段`,
        body: "Pace 在等你:只要 2 分钟的第一步,做完就算今天赢。点「现在开始」直达计时器。",
      };
    }
  } catch { /* ignore */ }
  return stats;
}

export async function GET() {
  try {
    const user = await ensureDemoUser();
    const stats = await startStats(user.id);
    const today = todayStr();
    const empty = {
      task: null, startCard: null, weekProgress: { done: 0, total: 0 }, today,
      hasGoal: false, goalTitle: null as string | null, weekFocus: null as string | null,
    };
    const goal = await prisma.goal.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!goal) return NextResponse.json({ ...empty, ...stats, hasGoal: false });

    const plans = await loadPlansForGoal(goal.id);
    if (plans.length === 0) {
      return NextResponse.json({ ...empty, hasGoal: true, goalTitle: goal.title });
    }

    // 当前周优先按「包含今天日期」判断;兜底按距创建时间推算,再兜底取最后一周
    const current =
      plans.find((p) => p.days.some((d) => d.date === today)) ??
      plans.find((p) => p.week === Math.floor(diffDays(goal.createdAt, new Date()) / 7) + 1) ??
      plans[plans.length - 1];

    const todayPlan = current.days.find((d) => d.date === today);
    let task = todayPlan?.tasks.find((t) => !t.done) ?? null;
    if (!task) {
      // 今天已清零时给本周下一个未完成任务,保持「今日有事可启动」
      task = current.days.flatMap((d) => d.tasks).find((t) => !t.done) ?? null;
    }
    const weekProgress = current.days.reduce(
      (acc, d) => {
        for (const t of d.tasks) {
          acc.total += 1;
          if (t.done) acc.done += 1;
        }
        return acc;
      },
      { done: 0, total: 0 }
    );
    const startCard = task ? getCachedStartCard(task.id) : null;
    return NextResponse.json({
      task, startCard, weekProgress, today,
      hasGoal: true, goalTitle: goal.title, weekFocus: current.focus,
      streak: stats.streak, startedToday: stats.startedToday,
    });
  } catch (err) {
    return apiError(`获取今日计划失败:${errorMessage(err)}`, 500);
  }
}
