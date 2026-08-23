import { NextResponse } from "next/server";
import { z } from "zod";
import { decompose, cacheStartCard } from "@/lib/agents/spark";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { ensureDemoUser } from "@/lib/db";
import { getProfile, suggestGranularity } from "@/lib/profile";

const bodySchema = z.object({
  taskId: z.string().min(1).max(120).optional(),
  rawTask: z.string().trim().min(1, "rawTask 不能为空").max(300),
  mood: z.string().max(20).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`请求参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const { taskId, rawTask, mood } = parsed.data;
    const user = await ensureDemoUser();
    // 拆解粒度提示:取画像当前建议档(画像缺失则不提示,由 Spark 默认 2 分钟起步)
    let granularityHint: ReturnType<typeof suggestGranularity> | undefined;
    try {
      granularityHint = suggestGranularity((await getProfile(user.id)).procrastination);
    } catch {
      granularityHint = undefined;
    }
    const result = await decompose(rawTask, mood, granularityHint);
    if (taskId) cacheStartCard(taskId, result.startCard); // 供 /api/today 复用近期启动卡
    return NextResponse.json(result);
  } catch (err) {
    return apiError(`任务拆解失败:${errorMessage(err)}`, 500);
  }
}
