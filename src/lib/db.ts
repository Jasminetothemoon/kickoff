import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import type { LearnerProfile, ProcrastinationProfile } from "./types";

export const DEMO_USER_ID = "demo"; // 兼容遗留引用;真实 uid 见 currentUserId()

/** 当前访问者 uid(middleware 已保证 cookie 存在;无 cookie 环境回退 demo) */
export function currentUserId(): string {
  try {
    return cookies().get("kickoff_uid")?.value || DEMO_USER_ID;
  } catch {
    return DEMO_USER_ID;
  }
}

// dev 热重载下避免重复实例导致连接耗尽
const globalForPrisma = globalThis as unknown as { __kickoffPrisma?: PrismaClient };
export const prisma: PrismaClient = globalForPrisma.__kickoffPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__kickoffPrisma = prisma;
}

export function defaultLearnerProfile(): LearnerProfile {
  return { goal: "", motivation: "", mastery: {}, historyCompletion: 0 };
}

export function defaultProcrastinationProfile(): ProcrastinationProfile {
  const uniform = 1 / 6; // 无数据时的先验:六型卡点均匀分布
  return {
    blockerDist: {
      模糊型: uniform,
      畏难型: uniform,
      完美主义型: uniform,
      动力型: uniform,
      环境型: uniform,
      疲劳型: uniform,
    },
    successByGran: {},
    avgStartDelayMin: 0,
    activeHours: [20, 21, 22],
    lowDays: [],
  };
}

/** 幂等创建当前访问者与空双画像(匿名 uid 多用户 MVP;上线后升级注册体系) */
export async function ensureDemoUser() {
  const uid = currentUserId();
  const user = await prisma.user.upsert({
    where: { id: uid },
    update: {},
    create: { id: uid },
  });
  await prisma.profile.upsert({
    where: { userId: uid },
    update: {},
    create: {
      userId: uid,
      learner: JSON.stringify(defaultLearnerProfile()),
      procrastination: JSON.stringify(defaultProcrastinationProfile()),
    },
  });
  return user;
}
