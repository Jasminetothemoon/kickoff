// Web Push 发送核心 + 进程内邀约调度器(PRD P0-1 的"自动发送"半环)
// 说明:调度器为单进程 MVP 实现(服务器存活期间每 10 分钟巡检);多实例部署时应换成外部 cron 调 /api/push/invite
import webpush from "web-push";
import { prisma } from "./db";

function vapidReady(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** 向某用户的所有有效订阅发送一条启动邀约;清理失效订阅 */
export async function sendInvitesForUser(
  userId: string,
  opts: { title?: string; body?: string } = {}
): Promise<{ sent: number; total: number; reason?: string }> {
  if (!vapidReady()) {
    return { sent: 0, total: 0, reason: "未配置 VAPID 密钥(见 .env.example / scripts/gen-vapid.mjs)" };
  }
  webpush.setVapidDetails("mailto:kickoff@local", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const hour = new Date().getHours();
  const payload = JSON.stringify(
    opts.title
      ? { title: opts.title, body: opts.body ?? "", url: "/today" }
      : {
          title: `现在是 ${hour}:00 前后 —— 你的启动时段`,
          body: "Pace 在等你:只要 2 分钟的第一步,做完就算今天赢。",
          url: "/today",
        }
  );
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => {});
      }
    }
  }
  return { sent, total: subs.length };
}

let schedulerStarted = false;
export function ensureScheduler(): void {
  if (schedulerStarted || process.env.KICKOFF_NO_SCHEDULER === "1") return;
  schedulerStarted = true;
  const tick = async () => {
    try {
      if (!vapidReady()) return;
      const users = await prisma.pushSubscription.findMany({ select: { userId: true }, distinct: ["userId"] });
      const todayKey = new Date().toISOString().slice(0, 10);
      for (const u of users) {
        const profile = await prisma.profile.findFirst({ where: { userId: u.userId } });
        if (!profile) continue;
        const settings = JSON.parse(profile.settings || "{}");
        if (settings.lastInviteDay === todayKey) continue; // 每日最多 1 条
        const proc = JSON.parse(profile.procrastination || "{}");
        const active: number[] = proc.activeHours ?? [20, 21, 22];
        if (!active.includes(new Date().getHours())) continue;
        const hasGoal = (await prisma.goal.count({ where: { userId: u.userId } })) > 0;
        if (!hasGoal) continue;
        // 今日已启动则不打扰(CheckIn 为全局表,MVP 近似)
        const startedToday = await prisma.checkIn.findFirst({
          where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        if (startedToday) continue;
        const r = await sendInvitesForUser(u.userId);
        if (r.sent > 0) {
          settings.lastInviteDay = todayKey;
          await prisma.profile.update({ where: { id: profile.id }, data: { settings: JSON.stringify(settings) } });
          console.log(`[kickoff] 已向 ${u.userId} 发送启动邀约`);
        }
      }
    } catch {
      // 巡检失败静默,下轮再试
    }
  };
  setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 30 * 1000); // 启动 30s 后先跑一轮
}
