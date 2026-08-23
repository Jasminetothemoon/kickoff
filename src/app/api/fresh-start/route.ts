import { NextResponse } from "next/server";
import { apiError, errorMessage } from "@/lib/api";
import { currentUserId, ensureDemoUser, prisma } from "@/lib/db";
import { evaluateAchievements } from "@/lib/achievements";

export const dynamic = "force-dynamic";

// 无羞耻 Fresh Start(PRD P0-2):失败后的一键重新开始 —— 心理重置,不惩罚、不清数据
const MESSAGES = [
  "🌱 新的一页:过去清零,「想开始」的现在最重要 —— 今天只做 2 分钟。",
  "🌱 Fresh Start!不需要补昨天的,只需要开始现在的。",
  "🌱 重新开始不是失败,是数据告诉你换了个更好的起点。",
];

export async function POST() {
  try {
    await ensureDemoUser();
    const uid = currentUserId();
    const profile = await prisma.profile.findFirst({ where: { userId: uid } });
    if (profile) {
      const st = JSON.parse(profile.settings || "{}");
      st.lastFreshStart = Date.now();
      await prisma.profile.update({
        where: { id: profile.id },
        data: { settings: JSON.stringify(st) },
      });
    }
    const ach = await evaluateAchievements(uid).catch(() => null);
    return NextResponse.json({
      ok: true,
      message: MESSAGES[Math.floor(Math.random() * MESSAGES.length)],
      ...(ach && ach.newly.length > 0
        ? { newAchievements: ach.newly.map((a) => ({ key: a.key, title: a.title, icon: a.icon })) }
        : {}),
    });
  } catch (err) {
    return apiError(`重新开始失败:${errorMessage(err)}`, 500);
  }
}
