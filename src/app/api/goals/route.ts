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
    const preferPack = matched; // 精选内容优先;通用兜底才允许 LLM 即兴增强
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
      preferPack,
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

// GET /api/goals:目标列表(含是否激活=最新创建);POST {goalId}:切换激活目标(重排 createdAt 置顶)
export async function GET() {
  try {
    const user = await ensureDemoUser();
    const goals = await prisma.goal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true, weeks: true, minutesPerDay: true },
    });
    return NextResponse.json({
      goals: goals.map((g, i) => ({
        id: g.id,
        title: g.title,
        weeks: g.weeks,
        minutesPerDay: g.minutesPerDay,
        active: i === 0,
        createdAt: g.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return apiError(`读取目标失败:${errorMessage(err)}`, 500);
  }
}

const switchSchema = z.object({ goalId: z.string().min(1) });

export async function PATCH(request: Request) {
  try {
    const parsed = switchSchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) return apiError(`参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    const user = await ensureDemoUser();
    const goal = await prisma.goal.findFirst({ where: { id: parsed.data.goalId, userId: user.id } });
    if (!goal) return apiError("目标不存在", 404);
    // 切换激活 = 把该目标 createdAt 置为最新(findFirst 按 createdAt desc 取激活)
    await prisma.goal.update({
      where: { id: goal.id },
      data: { createdAt: new Date(Date.now() + Math.floor(Math.random() * 1000)) },
    });
    return NextResponse.json({ ok: true, activated: goal.id });
  } catch (err) {
    return apiError(`切换目标失败:${errorMessage(err)}`, 500);
  }
}
