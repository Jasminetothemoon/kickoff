import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";
import { evaluateAchievements } from "@/lib/achievements";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().trim().min(1, "杂念内容不能为空").max(200) });

export async function GET() {
  try {
    const user = await ensureDemoUser();
    const items = await prisma.parkedThought.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({
      items: items.map((i) => ({ id: i.id, text: i.text, createdAt: i.createdAt.toISOString() })),
    });
  } catch (err) {
    return apiError(`读取停车场失败:${errorMessage(err)}`, 500);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`请求参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const user = await ensureDemoUser();
    const row = await prisma.parkedThought.create({
      data: { userId: user.id, text: parsed.data.text },
    });
    const count = await prisma.parkedThought.count({ where: { userId: user.id } });
    const ach = await evaluateAchievements(user.id).catch(() => null);
    return NextResponse.json({
      ok: true, count, id: row.id,
      ...(ach && ach.newly.length > 0
        ? { newAchievements: ach.newly.map((a) => ({ key: a.key, title: a.title, icon: a.icon })) }
        : {}),
    });
  } catch (err) {
    return apiError(`记入停车场失败:${errorMessage(err)}`, 500);
  }
}
