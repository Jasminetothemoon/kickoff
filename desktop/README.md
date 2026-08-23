# Kickoff Desktop — Menubar 伴侣(触点 B)

多 Agent 学习引擎 Kickoff 的桌面常驻触点:**时间条 Tray + 杂念停车场全局快捷键**。
与 Web 端(默认 `http://localhost:3000`)共用同一套 API,一核两触点。

## 功能

| 能力 | 说明 |
| --- | --- |
| 常驻时间条 | 托盘图标常驻(靛蓝圆点 + 白色播放三角);冲刺进行中在菜单栏实时显示剩余时间(如 `07:32`),悬停可见状态 |
| 今日面板(Popover) | 点击托盘图标弹出 360×480 无边框面板:本周进度、周主题、今日任务第一步(执行意图 + 完成标准),失焦自动隐藏 |
| 冲刺计时 | 面板内发起 **2 / 10 / 15** 分钟冲刺;面板内显示倒计时与进度条 |
| 冲刺完成 | 系统通知「冲刺完成 —— 要继续吗?打卡才算数」,面板出现「✓ 完成打卡」按钮(自动携带今日 `taskId` → `POST /api/checkins`),展示庆祝语与粒度调整建议 |
| 杂念停车场 | 全局快捷键 **`Shift+Cmd+K`(Windows/Linux:`Shift+Ctrl+K`)** 随处弹出小输入窗,回车即 `POST /api/park`,成功提示后自动隐藏,`Esc` 取消 |
| 快速启动小窗 | 全局快捷键 **`Shift+Cmd+J`(Windows/Linux:`Shift+Ctrl+J`)** 任何应用内按下即弹出:显示今日第一步与分钟数(主进程 today 缓存,缓存为空时静默刷新),「现在开始(N 分钟)」打开 Web 端今天页(自动聚焦启动卡),「开一场陪伴冲刺」打开陪伴冲刺页 |
| 服务器可配置 | 面板内 ⚙ 或托盘右键「设置服务器地址…」可修改 Web 端地址,持久化于 `userData/config.json` |
| 托盘右键菜单 | 打开面板 / 启动邀约(打开今天) / 陪伴冲刺 / 打开 Web 应用 / 设置服务器地址 / 杂念停车场 / 退出 |

## 运行

```bash
cd kickoff/desktop
npm install        # 仅需 electron(devDependency)
npm start          # 启动(先确保 Web 端 npm run dev 在 3000 端口运行)
```

- 首次启动若连不上服务器,面板会给出友好提示与「检查服务器设置」入口。
- macOS 上应用不占 Dock,常驻菜单栏;点通知可直接回到面板打卡。

## 打包(electron-builder)

`electron-builder` 未列为依赖(安装体积大,按需安装):

```bash
npm install --save-dev electron-builder
npm run dist:mac     # 只打 mac(npm run dist 为 mac+win+linux)
# 产物输出至 desktop/dist/
```

图标由 `assets/make-icon.js`(纯 Node、零依赖)生成:

```bash
npm run icon   # 重新生成 assets/icon.png(32×32)与 assets/icon-16.png(16×16)
```

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Shift+Cmd+K` / `Shift+Ctrl+K` | 全局唤起杂念停车场(任何应用内均可) |
| `Shift+Cmd+J` / `Shift+Ctrl+J` | 全局唤起快速启动小窗(任何应用内均可;显示今日第一步,一键打开今天页或陪伴冲刺页) |
| `Enter`(停车场内) | 停入杂念并自动关闭 |
| `Esc`(停车场/快速启动/设置内) | 关闭窗口 |

## 架构与安全

```
desktop/
├── main.js          主进程:Tray、冲刺计时、全局快捷键、通知、配置持久化、全部服务器请求
├── preload.js       contextBridge 桥接(window.kickoff 最小 API)
├── index.html       Popover 面板结构
├── renderer.js      Popover 逻辑(原生 JS,无框架)
├── style.css        Popover 样式(深靛 #1E1B4B 头部 / 靛蓝 #4F46E5 主按钮)
├── park.html/.css/.js  杂念停车场小窗
├── quick.html/.css/.js 快速启动小窗(全局热键,今日第一步 + 今天/陪伴冲刺入口)
├── assets/          图标生成脚本与 PNG(缺失时回退 main.js 内嵌 base64)
└── electron-builder.json
```

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`;渲染进程不接触 Node。
- 页面启用 CSP(`script-src 'self'`),无内联脚本。
- 所有 API 请求在主进程发起(规避 `file://` 下的 CORS 限制),带 8 秒超时。
- 零原生编译依赖,`electron` 是唯一运行依赖。
- IPC 通道统一 `kickoff:` 前缀,preload 与 main 一一对应。

## 对接的 Web API

- `GET  /api/today` — 今日任务 / 起步卡 / 周进度(面板展示与 taskId 缓存)
- `POST /api/park {text}` — 杂念停车场
- `POST /api/checkins {taskId, taskTitle?, granularity?, delaySeconds?}` — 冲刺后打卡
