import { NextResponse } from "next/server";
import { apiError, errorMessage } from "@/lib/api";
import { ensureDemoUser } from "@/lib/db";
import { evaluateAchievements } from "@/lib/achievements";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureDemoUser();
    const out = await evaluateAchievements(user.id);
    return NextResponse.json({
      points: out.points,
      unlocked: out.unlocked.map((u) => ({ ...u, unlockedAt: u.unlockedAt.toISOString() })),
      next: out.next,
    });
  } catch (err) {
    return apiError(`成就读取失败:${errorMessage(err)}`, 500);
  }
}
