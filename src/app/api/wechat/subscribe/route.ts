import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 微信订阅消息授权上报(PRD P0-1 小程序形态)
// 说明:一次性订阅 —— 每次授权可下发一条;正式下发需 WECHAT_APPID/SECRET 换 openid 后调微信 API(见 scripts/wechat-send-remind.mjs)
const bodySchema = z.object({
  code: z.string().min(1).max(200),
  templateId: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) return apiError(`参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    const user = await ensureDemoUser();
    const row = await prisma.wechatReminder.create({
      data: { userId: user.id, code: parsed.data.code, templateId: parsed.data.templateId },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    return apiError(`订阅记录失败:${errorMessage(err)}`, 500);
  }
}
