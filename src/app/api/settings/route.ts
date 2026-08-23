import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";
import type { FocusSupportSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULTS: FocusSupportSettings = { enabled: false, sprintMinutes: 10, singleTaskView: false };

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  sprintMinutes: z.union([z.literal(10), z.literal(15), z.literal(5), z.literal(25)]).optional(),
  singleTaskView: z.boolean().optional(),
});

async function readSettings(): Promise<FocusSupportSettings> {
  const user = await ensureDemoUser();
  const row = await prisma.profile.findFirst({ where: { userId: user.id } });
  if (!row) return DEFAULTS;
  try {
    const raw: unknown = JSON.parse(row.settings || "{}");
    const v = settingsSchema.safeParse(raw);
    if (v.success) return { ...DEFAULTS, ...v.data };
  } catch {
    // fallthrough
  }
  return DEFAULTS;
}

async function writeSettings(next: Partial<FocusSupportSettings>): Promise<FocusSupportSettings> {
  const user = await ensureDemoUser();
  const merged = { ...(await readSettings()), ...next };
  await prisma.profile.update({
    where: { userId: user.id },
    data: { settings: JSON.stringify(merged) },
  });
  return merged;
}

export async function GET() {
  try {
    return NextResponse.json({ focusSupport: await readSettings() });
  } catch (err) {
    return apiError(`读取设置失败:${errorMessage(err)}`, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = settingsSchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`设置不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const focusSupport = await writeSettings(parsed.data);
    return NextResponse.json({ ok: true, focusSupport });
  } catch (err) {
    return apiError(`保存设置失败:${errorMessage(err)}`, 500);
  }
}
