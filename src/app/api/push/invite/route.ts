import { NextResponse } from "next/server";
import { apiError, errorMessage } from "@/lib/api";
import { ensureDemoUser } from "@/lib/db";
import { sendInvitesForUser } from "@/lib/push";

export const dynamic = "force-dynamic";

// 手动发送一条启动邀约(测试链路 / 用户主动催一下);自动调度见 lib/push.ts ensureScheduler
export async function POST() {
  try {
    const user = await ensureDemoUser();
    const r = await sendInvitesForUser(user.id);
    return NextResponse.json({ sent: r.sent, total: r.total, ...(r.reason ? { reason: r.reason } : {}) });
  } catch (err) {
    return apiError(`邀约发送失败:${errorMessage(err)}`, 500);
  }
}
