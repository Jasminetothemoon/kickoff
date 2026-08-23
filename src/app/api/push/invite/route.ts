import { NextResponse } from "next/server";
import webpush from "web-push";
import { apiError, errorMessage } from "@/lib/api";
import { ensureDemoUser, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 主动启动邀约(PRD P0-1):向当前用户的全部订阅推送执行意图式邀约。
// 部署后建议用系统 cron / 外部调度 定时调用本接口(带用户 cookie 或升级为服务端调度)。
export async function POST() {
  try {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      return NextResponse.json({
        sent: false,
        reason: "未配置 VAPID 密钥:运行 `node scripts/gen-vapid.mjs` 并把输出写入 .env",
      });
    }
    const user = await ensureDemoUser();
    webpush.setVapidDetails("mailto:kickoff@local", pub, priv);
    const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    const hour = new Date().getHours();
    const payload = JSON.stringify({
      title: `现在是 ${hour}:00 前后 —— 你的启动时段`,
      body: "Pace 在等你:只要 2 分钟的第一步,做完就算今天赢。",
      url: "/today",
    });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent += 1;
      } catch (err) {
        // 410/404:订阅失效,清理
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => {});
        }
      }
    }
    return NextResponse.json({ sent, total: subs.length });
  } catch (err) {
    return apiError(`邀约发送失败:${errorMessage(err)}`, 500);
  }
}
