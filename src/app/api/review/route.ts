import { NextResponse } from "next/server";
import { z } from "zod";
import { review } from "@/lib/agents/mirror";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { currentUserId, ensureDemoUser, prisma } from "@/lib/db";
import { applyProfileDelta } from "@/lib/profile";
import { applyPlanAdjustments } from "@/lib/replan";
import { evaluateAchievements, unlockReview } from "@/lib/achievements";

const bodySchema = z.object({ scope: z.enum(["day", "week"]) });

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`请求参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const { scope } = parsed.data;
    await ensureDemoUser();
    const since =
      scope === "day"
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // MVP 单演示用户:CheckIn 表无 userId 字段,直接全量取时间窗内记录
    const rows = await prisma.checkIn.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    const result = await review(
      scope,
      rows.map((r) => ({
        taskId: r.taskId,
        taskTitle: r.taskTitle,
        granularity: r.granularity,
        mood: r.mood,
        delaySeconds: r.delaySeconds,
        startedAt: r.startedAt.toISOString(),
        completed: r.completedAt !== null,
      }))
    );
    // 复盘产生的画像增量(平均启动延迟/低谷日等)回写画像,反馈 Coach
    await applyProfileDelta(await currentUserId(), result.profileDelta);
    // M2 闭环:复盘建议自动落库(低谷日减载/粒度调整/过期顺延)
    const replan = await applyPlanAdjustments(await currentUserId(), result.planAdjustments);
    await unlockReview(await currentUserId()).catch(() => {});
    const ach = await evaluateAchievements(await currentUserId()).catch(() => null);
    return NextResponse.json({
      ...result, applied: replan.applied,
      ...(ach && ach.newly.length > 0
        ? { newAchievements: ach.newly.map((a) => ({ key: a.key, title: a.title, icon: a.icon })) }
        : {}),
    });
  } catch (err) {
    return apiError(`复盘失败:${errorMessage(err)}`, 500);
  }
}
