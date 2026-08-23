import { NextResponse } from "next/server";
import { apiError, errorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";
import { diffDays, todayStr } from "@/lib/datetime";
import { loadPlansForGoal } from "@/lib/planStore";

export const dynamic = "force-dynamic";

// GET /api/plans -> { week: WeekPlan | null, goalTitle: string | null }
// 返回当前周(包含今天)的完整计划,供「计划」页渲染
export async function GET() {
  try {
    const user = await ensureDemoUser();
    const today = todayStr();
    const goal = await prisma.goal.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!goal) return NextResponse.json({ week: null, goalTitle: null });

    const plans = await loadPlansForGoal(goal.id);
    if (plans.length === 0) return NextResponse.json({ week: null, goalTitle: goal.title });

    const current =
      plans.find((p) => p.days.some((d) => d.date === today)) ??
      plans.find((p) => p.week === Math.floor(diffDays(goal.createdAt, new Date()) / 7) + 1) ??
      plans[plans.length - 1];

    return NextResponse.json({
      week: { week: current.week, focus: current.focus, days: current.days },
      goalTitle: goal.title,
    });
  } catch (err) {
    return apiError(`获取周计划失败:${errorMessage(err)}`, 500);
  }
}
