import { NextResponse } from "next/server";
import { apiError, errorMessage } from "@/lib/api";
import {
  defaultLearnerProfile,
  defaultProcrastinationProfile,
  ensureDemoUser,
  prisma,
} from "@/lib/db";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await ensureDemoUser();
    return NextResponse.json(await getProfile(user.id));
  } catch (err) {
    return apiError(`读取画像失败:${errorMessage(err)}`, 500);
  }
}

/** 一键删除(合规):清空该用户全部 Goal/Plan(级联)/CheckIn/Profile 并重建空画像 */
export async function DELETE() {
  try {
    const user = await ensureDemoUser();
    await prisma.checkIn.deleteMany({}); // MVP 单用户:CheckIn 无 userId,全清
    await prisma.goal.deleteMany({ where: { userId: user.id } }); // Plan 随 Goal 级联删除
    await prisma.profile.deleteMany({ where: { userId: user.id } });
    await prisma.profile.create({
      data: {
        userId: user.id,
        learner: JSON.stringify(defaultLearnerProfile()),
        procrastination: JSON.stringify(defaultProcrastinationProfile()),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(`删除数据失败:${errorMessage(err)}`, 500);
  }
}
