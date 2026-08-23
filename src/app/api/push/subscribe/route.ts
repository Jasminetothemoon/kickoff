import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";
import { ensureScheduler } from "@/lib/push";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  endpoint: z.string().url().max(500),
  p256dh: z.string().min(10).max(200),
  auth: z.string().min(4).max(200),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) return apiError(`参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    const user = await ensureDemoUser();
    await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      update: { ...parsed.data, userId: user.id },
      create: { ...parsed.data, userId: user.id },
    });
    ensureScheduler();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(`订阅失败:${errorMessage(err)}`, 500);
  }
}
