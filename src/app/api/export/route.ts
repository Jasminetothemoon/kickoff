import { NextResponse } from "next/server";
import { apiError, errorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";
import { todayStr } from "@/lib/datetime";
import { parsePlanDays } from "@/lib/planStore";
import { parseLearner, parseProcrastination } from "@/lib/profile";

export const dynamic = "force-dynamic";

/** 全量数据导出(JSON 附件,画像对用户透明可查看可带走) */
export async function GET() {
  try {
    const user = await ensureDemoUser();
    const goals = await prisma.goal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { plans: true },
    });
    const checkIns = await prisma.checkIn.findMany({ orderBy: { startedAt: "asc" } });
    const profileRow = await prisma.profile.findUnique({ where: { userId: user.id } });

    const payload = {
      exportedAt: new Date().toISOString(),
      user: { id: user.id, createdAt: user.createdAt.toISOString() },
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        motivation: g.motivation,
        weeks: g.weeks,
        minutesPerDay: g.minutesPerDay,
        skillPackId: g.skillPackId,
        createdAt: g.createdAt.toISOString(),
        plans: g.plans
          .slice()
          .sort((a, b) => a.week - b.week)
          .map((p) => ({
            id: p.id,
            week: p.week,
            focus: p.focus,
            createdAt: p.createdAt.toISOString(),
            days: parsePlanDays(p.days),
          })),
      })),
      checkIns: checkIns.map((c) => ({
        id: c.id,
        taskId: c.taskId,
        taskTitle: c.taskTitle,
        granularity: c.granularity,
        mood: c.mood,
        delaySeconds: c.delaySeconds,
        startedAt: c.startedAt.toISOString(),
        completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      })),
      profile: profileRow
        ? {
            learner: parseLearner(profileRow.learner),
            procrastination: parseProcrastination(profileRow.procrastination),
            updatedAt: profileRow.updatedAt.toISOString(),
          }
        : null,
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="kickoff-export-${todayStr()}.json"`,
      },
    });
  } catch (err) {
    return apiError(`导出失败:${errorMessage(err)}`, 500);
  }
}
