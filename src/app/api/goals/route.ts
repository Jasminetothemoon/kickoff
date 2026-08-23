import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePlan } from "@/lib/agents/coach";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { currentUserId, ensureDemoUser, prisma } from "@/lib/db";
import { matchSkillPack } from "@/lib/skillpack";

const bodySchema = z.object({
  title: z.string().trim().min(1, "学习目标不能为空").max(120),
  weeks: z.number().int().min(1).max(24).optional(),
  minutesPerDay: z.number().int().min(5).max(240).optional(),
  motivation: z.string().max(500).optional(),
  resources: z.array(z.string().trim().min(1).max(300)).max(12).optional(), // 每行一条:视频/教程链接、教材、线下要点
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`请求参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const { title, weeks = 12, minutesPerDay = 25, motivation = "", resources = [] } = parsed.data;
    const user = await ensureDemoUser();
    // 用户提供资源 → 生成专属自定义路线;否则走匹配(自定义→内置→通用)
    let pack: import("@/lib/skillpack").SkillPack;
    let matched: boolean;
    if (resources.length > 0) {
      const { generateCustomPack } = await import("@/lib/customPack");
      pack = await generateCustomPack({ userId: user.id, goalTitle: title, resources, motivation });
      matched = true;
    } else {
      const m = await matchSkillPack(user.id, title);
      pack = m.pack;
      matched = m.matched;
    }
    const goal = await prisma.goal.create({
      data: { userId: user.id, title, motivation, weeks, minutesPerDay, skillPackId: pack.id },
    });
    const plan = await generatePlan({
      userId: await currentUserId(),
      goalId: goal.id,
      title,
      weeks,
      minutesPerDay,
      motivation,
      skillPackId: goal.skillPackId,
      skillPack: pack,
    });
    // Plan 按周落库,days 序列化为 JSON 字符串;日期在生成时已从今天起排 7×week 天
    await prisma.plan.createMany({
      data: plan.weeks.map((w) => ({
        goalId: goal.id,
        week: w.week,
        focus: w.focus,
        days: JSON.stringify(w.days),
      })),
    });
    const planMeta = { skillPack: pack.title, matched };
    return NextResponse.json({ goalId: goal.id, plan, ...planMeta });
  } catch (err) {
    return apiError(`创建目标失败:${errorMessage(err)}`, 500);
  }
}
