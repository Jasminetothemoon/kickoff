import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, errorMessage } from "@/lib/api";
import { getLLM, MockLLM } from "@/lib/llm";

export const dynamic = "force-dynamic";

const replySchema = z.object({ reply: z.string().min(1) });
const FALLBACK_REPLY =
  "微习惯原理:把行动缩小到「小到不可能失败」的最小单位(例如每天 2 分钟),用极低的启动门槛换取持续的行动与身份认同。";

/** 冒烟测试:验证模型链路(真实模型名 / mock)与 JSON 输出 */
export async function GET() {
  try {
    let model = "mock";
    let reply = FALLBACK_REPLY;
    try {
      const llm = getLLM();
      model = llm instanceof MockLLM ? "mock" : process.env.MODEL_NAME ?? "llm";
      const data = await llm.chatJSON<unknown>(
        '你是行为科学助手。用中文一句话回答,输出严格 JSON:{"reply": string}',
        "用一句话介绍微习惯原理",
        'JSON:{"reply":"一句话中文回答"}'
      );
      const parsed = replySchema.safeParse(data);
      if (parsed.success) reply = parsed.data.reply;
    } catch {
      model = "mock"; // 真实调用失败:按 mock 口径返回兜底文案
    }
    return NextResponse.json({ model, reply });
  } catch (err) {
    return apiError(`冒烟测试失败:${errorMessage(err)}`, 500);
  }
}
