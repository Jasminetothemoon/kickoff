// API 路由公共工具:统一错误体 {error} 与 body 解析
import { NextResponse } from "next/server";
import type { z } from "zod";

export function apiError(message: string, status: number = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function zodErrorMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join(";");
}

export async function parseJSONBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
