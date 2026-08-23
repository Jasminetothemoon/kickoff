import { NextResponse } from "next/server";
import { z } from "zod";
import { celebrate } from "@/lib/agents/pace";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";
import { findTaskInGoal, markTaskDone } from "@/lib/planStore";
import { updateOnCheckIn } from "@/lib/profile";
import { evaluateAchievements } from "@/lib/achievements";
import { toGranularity } from "@/lib/schemas";

const bodySchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().max(200).optional(),
  mood: z.string().max(20).optional(),
  delaySeconds: z.number().int().min(0).max(86400).optional(),
  granularity: z.number().int().min(1).max(60).optional(),
  note: z.string().trim().max(200).optional(), // 微复盘一句话
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`请求参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const { taskId, mood, delaySeconds = 0 } = parsed.data;
    const user = await ensureDemoUser();
    const goal = await prisma.goal.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const ref = goal ? await findTaskInGoal(goal.id, taskId) : null;
    const taskTitle = parsed.data.taskTitle ?? ref?.task.title ?? "未命名任务";
    // 粒度:body 优先,其次任务自带档,兜底 2
    const granularity = toGranularity(parsed.data.granularity ?? ref?.task.granularity ?? 2);

    // startedAt = 实际开始时刻(现在回推延迟);打卡即完成
    await prisma.checkIn.create({
      data: {
        taskId,
        taskTitle,
        granularity,
        mood: mood ?? "",
        note: parsed.data.note ?? "",
        delaySeconds,
        startedAt: new Date(Date.now() - delaySeconds * 1000),
        completedAt: new Date(),
      },
    });
    if (goal) await markTaskDone(goal.id, taskId);

    const upd = await updateOnCheckIn(user.id, { granularity, mood, delaySeconds });
    const adjustments: string[] = [];
    if (upd.suggestion !== upd.previousSuggestion) {
      const dir =
        upd.suggestion > upd.previousSuggestion ? "近期启动成功率 >80%,上调" : "当前档启动成功率 <50%,下调";
      adjustments.push(`任务粒度建议:${upd.previousSuggestion} → ${upd.suggestion} 分钟(${dir})`);
    }
    if (delaySeconds > 900) {
      adjustments.push(
        `本次启动延迟 ${Math.round(delaySeconds / 60)} 分钟,下次提醒会提前并绑定执行意图场景`
      );
    }
    const ach = await evaluateAchievements(user.id).catch(() => null);
    return NextResponse.json({
      ok: true,
      celebration: celebrate(taskTitle),
      adjustments,
      ...(ach && ach.newly.length > 0
        ? { newAchievements: ach.newly.map((a) => ({ key: a.key, title: a.title, icon: a.icon })) }
        : {}),
    });
  } catch (err) {
    return apiError(`打卡失败:${errorMessage(err)}`, 500);
  }
}
