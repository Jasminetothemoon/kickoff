// 微信订阅消息下发(Pace 启动邀约)
// 前置:注册小程序 → .env 配 WECHAT_APPID / WECHAT_SECRET / WECHAT_TEMPLATE_ID;
// 流程:批量把未发送的授权记录(code 换 openid)逐条下发;每次授权只能发一条(微信一次性订阅机制)。
// 用法:node scripts/wechat-send-remind.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPID = process.env.WECHAT_APPID;
const SECRET = process.env.WECHAT_SECRET;

async function main() {
  if (!APPID || !SECRET) {
    console.log("未配置 WECHAT_APPID/WECHAT_SECRET —— 正式注册小程序后填入 .env 再运行。");
    process.exit(0);
  }
  const tokenRes = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`
  ).then((r) => r.json());
  if (!tokenRes.access_token) throw new Error("access_token 获取失败: " + JSON.stringify(tokenRes));
  const pendings = await prisma.wechatReminder.findMany({ where: { sentAt: null }, take: 50 });
  let sent = 0;
  for (const p of pendings) {
    const sns = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${p.code}&grant_type=authorization_code`
    ).then((r) => r.json());
    if (!sns.openid) continue; // code 已被使用/过期:跳过(下次授权重新上报)
    const r = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${tokenRes.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: sns.openid,
        template_id: p.templateId,
        page: "pages/today/today",
        data: {
          thing1: { value: "Pace 启动邀约" },
          thing2: { value: "只要 2 分钟的第一步,做完就算今天赢" },
        },
      }),
    }).then((x) => x.json());
    if (r.errcode === 0) {
      await prisma.wechatReminder.update({ where: { id: p.id }, data: { sentAt: new Date() } });
      sent += 1;
    }
  }
  console.log(`已下发 ${sent}/${pendings.length} 条邀约`);
}

main().finally(() => prisma.$disconnect());
