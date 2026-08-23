import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { currentUserId, ensureDemoUser, prisma } from "@/lib/db";
import { detectTone, sessionClosing } from "@/lib/agents/pace";
import { evaluateAchievements } from "@/lib/achievements";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

// 陪伴冲刺会话(PRD P1-1 AI Body Doubling):结束一次性上报
const bodySchema = z.object({
  goalText: z.string().trim().min(1).max(80),
  minutes: z.number().int().min(5).max(60),
  completed: z.boolean(),
  mood: z.string().max(20).optional(),
  note: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`请求参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const user = await ensureDemoUser();
    const uid = user.id || currentUserId();
    const { goalText, minutes, completed, mood, note } = parsed.data;
    const row = await prisma.focusSession.create({
      data: {
        userId: uid,
        goalText,
        minutes,
        completed,
        mood: mood ?? "",
        note: note ?? "",
        startedAt: new Date(Date.now() - minutes * 60000),
        finishedAt: new Date(),
      },
    });
    // 结束语按画像语气生成(P0-3)
    let tone: ReturnType<typeof detectTone> = "drill";
    try {
      const dual = await getProfile(uid);
      tone = detectTone(dual.procrastination);
    } catch { /* 默认语气 */ }
    const ach = await evaluateAchievements(uid).catch(() => null);
    return NextResponse.json({
      ok: true,
      id: row.id,
      message: sessionClosing(goalText, completed, tone),
      ...(ach && ach.newly.length > 0
        ? { newAchievements: ach.newly.map((a) => ({ key: a.key, title: a.title, icon: a.icon })) }
        : {}),
    });
  } catch (err) {
    return apiError(`会话保存失败:${errorMessage(err)}`, 500);
  }
}
