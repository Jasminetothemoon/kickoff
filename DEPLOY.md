# 部署指南

## 方式一:Vercel(最快,约 3 分钟)
1. `git init && git add -A && git commit -m "init"`,推送到 GitHub;
2. vercel.com → Import Project(框架自动识别 Next.js);
3. 环境变量:`DATABASE_URL=file:./dev.db`、`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`MODEL_NAME`(均可选,无 Key 走内置 Mock);
   注意:Vercel 无持久磁盘,SQLite 数据为实例级;演示够用,持久化请用方式二或接 Turso/Neon;
4. Deploy → 得到在线地址。

## 方式二:Docker(任意 VPS,数据持久化)
```bash
echo 'OPENAI_API_KEY=sk-...' > .env   # 可选
docker compose up -d --build
# 访问 http://<服务器IP>:3000,数据持久化在 kickoff-data 卷
```

## 方式三:本地/裸机
```bash
cp .env.example .env && npm install && npm run db:push && npm run build && npm run start
```

## 经济型部署(个人 / 小范围体验)

### 方案一:¥0 —— 本机 Mac + Cloudflare Tunnel(推荐起步)
适合:自己用 + 给朋友发个链接体验。Mac 开着即在线,自动 HTTPS(支持 Web Push)。
```bash
brew install cloudflared
# 稳定地址版(免费账号,一次性配置):
cloudflared tunnel login
cloudflared tunnel create kickoff
cloudflared tunnel route dns kickoff kickoff.你的域名.com   # 需已有域名(¥10-60/年)
cloudflared tunnel run --url http://localhost:3000 kickoff
# 临时体验版(免账号免域名,但每次重启换地址):
cloudflared tunnel --url http://localhost:3000
```
注:Mac 合盖/休眠则离线;`caffeinate -d` 可保持唤醒。数据库就是 `prisma/dev.db` 一个文件,备份=复制该文件。

### 方案二:¥0 —— Vercel Hobby + Neon(免费云数据库)
适合:想要 7×24 在线又零成本。SQLite 不持久,需把数据库换成 Neon 免费档 Postgres:
`schema.prisma` 的 datasource 改 postgresql + 换连接串,`npm i @prisma/adapter-neon` 级别的半天改造。适合愿意动一点代码的情况。

### 方案三:约 ¥10-30/月 —— 海外轻量 VPS + Docker(最像真实产品)
适合:小范围稳定体验、后续接微信小程序。海外节点(腾讯云香港/RackNerd 等)免备案。
```bash
# 服务器上(已装 Docker):上传仓库后
cp .env.example .env && vim .env   # 填 Key/VAPID(本机跑 node scripts/gen-vapid.mjs 生成)
docker compose up -d --build
```
域名(¥10-60/年)+ Caddy 自动 HTTPS 一条反代即可;数据在 `kickoff-data` 卷,`docker compose down` 不丢。

### 不需要花钱的东西
CDN/负载均衡/独立数据库服务器/K8s —— 这个规模完全用不上。

### 按场景速选
| 场景 | 方案 | 月成本 |
|---|---|---|
| 只有自己用(手机/桌面三端) | 方案一 或 Tailscale 私网 | ¥0 |
| 3-10 位朋友体验,不想写代码 | 方案一(稳定地址版) | ¥0 + 域名年付 |
| 3-10 人长期用 / 演示给评委 | 方案三 | ¥10-30 |
| 微信小程序正式联调 | 需 https 域名(方案三);正式上线另需 ICP 备案 | — |
