# Kickoff 微信小程序(骨架)

Kickoff「多 Agent 学习引擎」的微信小程序端。本目录是**上线路线的先行代码包**:注册小程序主体后,即可直接导入微信开发者工具联调,无需任何构建步骤。

- 纯原生小程序代码(无 TypeScript、无框架、无 npm 依赖)
- 模块规范:CommonJS(`require` / `module.exports`)
- 图标全部使用 emoji,无外部图片资源
- 视觉对齐 Web 端:白底圆角卡片、靛蓝主按钮(#4F46E5)、暖橙强调(#E8701A)

## 目录结构

```
wechat/
├── app.js                  # 小程序入口
├── app.json                # 页面注册 / 深靛导航(#1E1B4B)/ 底部 tabBar(今天·小队·我的)
├── app.wxss                # 全局样式:色彩 class、白卡圆角、按钮、进度条
├── config.js               # baseURL 配置(默认 http://localhost:3000,支持本地缓存覆盖)
├── project.config.json     # 开发者工具项目配置(appid 为 test 占位)
├── sitemap.json            # 收录规则
├── README.md               # 本文件
├── utils/
│   └── api.js              # wx.request Promise 封装 + 全部接口(统一错误 toast)
└── pages/
    ├── today/              # 「今天」:启动卡、2 分钟计时、打卡、杂念停车场、周进度
    ├── squad/              # 「小队」:多 Agent 聊天(Coach/Spark/Pace/Mirror 徽章)
    └── me/                 # 「我的」:服务器地址设置、专注支持模式、免责声明
```

每个页面均为 `wxml / wxss / js / json` 四件套,并已在 `app.json` 注册。

## 如何导入微信开发者工具

1. 下载并安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)(稳定版)。
2. 打开开发者工具 → 「导入项目」→ 目录选择本 `wechat/` 目录。
3. AppID 选择「测试号」(本项目 `project.config.json` 中已填 `touristappid` 占位;有自己的 AppID 时直接替换即可)。
4. 项目配置中已默认 `urlCheck: false`(等价于勾选「不校验合法域名」),因此模拟器可以直接请求 `http://localhost:3000`。
5. 先在本机启动 Web 端 API(`http://localhost:3000`),再在模拟器中编译预览。

### 真机调试注意

真机上 `localhost` 指向手机自身,无法访问你电脑的 API。请在「我的 → 服务器设置」中把地址改为电脑的**局域网 IP**(如 `http://192.168.1.5:3000`),并保证手机与电脑同一 Wi-Fi。该地址通过 `wx.setStorageSync('kickoff_base_url')` 保存,`config.js` 的 `getBaseURL()` 会优先读取。

## 页面功能说明

### pages/today 「今天」

- `onShow` 拉取 `GET /api/today`,支持下拉刷新。
- 渲染启动卡:第一步、分钟数、完成标准、执行意图。
- 大按钮「只做 N 分钟,现在开始」(默认 2 分钟档)→ 页内计时态:`setInterval` 倒计时 + 进度条(view 宽度百分比),支持暂停/继续(切后台自动暂停、回前台自动续跑)。
- 到点弹 `wx.showModal`「要继续吗?」:「完成打卡」→ `POST /api/checkins` → toast 底座返回的庆祝文案;「继续学」→ 再来一轮计时。
- 次按钮「换更小的步骤」→ `POST /api/decompose`,用返回的 `startCard` 原地替换,并展示拆解出的步骤列表。
- 「杂念停车场」输入 → `POST /api/park`。
- `hasGoal === false` 时显示引导文案 + 「去网页端创建目标」按钮(复制 baseURL 到剪贴板)。
- 底部周进度条(`weekProgress.done / total`)+ 本周聚焦(`weekFocus`)。

### pages/squad 「小队」

- 聊天 UI:消息列表(scroll-view,自动滚到底)+ 输入框 + 发送按钮,调 `POST /api/chat`。
- 回复气泡前显示 Agent 徽章:Coach 🧭 靛蓝 / Spark ✨ 暖橙 / Pace 🎧 青绿 / Mirror 🪞 深靛。
- 快捷问题 chips:帮我拆解一个任务 / 复盘一下 / 我完全没动力。

### pages/me 「我的」

- 服务器地址输入框(保存到 `wx.setStorageSync`,全局请求立即生效)。
- 专注支持模式开关(`switch`,本地存储 `kickoff_focus_mode`)。
- 免责声明:「Kickoff 是学习与自我管理工具,不构成医疗建议或诊断,不替代专业治疗。」

## API 对接说明

`utils/api.js` 封装了全部请求,`config.getBaseURL() + path` 拼接 URL;非 2xx 或网络失败统一 `wx.showToast`(icon: none)提示,页面只需处理 `then`。

| 方法 | 接口 | 请求体 | 返回(关键字段) | 页面调用 |
| --- | --- | --- | --- | --- |
| `api.getToday()` | `GET /api/today` | - | `task{id,title,minutes}`、`startCard{firstStep,minutes,doneCriteria,intent}`、`weekProgress{done,total}`、`hasGoal`、`weekFocus` | today |
| `api.decompose(rawTask, mood?)` | `POST /api/decompose` | `{rawTask, mood?}` | `steps[{title,minutes}]`、`startCard` | today |
| `api.checkin(taskId, mood?, granularity?)` | `POST /api/checkins` | `{taskId, mood?, granularity?}` | `ok`、`celebration`、`adjustments[]` | today |
| `api.park(text)` | `POST /api/park` | `{text}` | `ok`、`count` | today |
| `api.chat(message)` | `POST /api/chat` | `{message}` | `agent:"Coach"\|"Spark"\|"Pace"\|"Mirror"`、`reply` | squad |

后端默认运行在 `http://localhost:3000`(见 `config.js` 的 `BASE_URL`)。

## 正式上线前需要做的事

1. **注册小程序主体**:在[微信公众平台](https://mp.weixin.qq.com/)注册小程序(个人或企业主体),取得正式 AppID。
2. **替换 AppID**:将 `project.config.json` 中的 `"appid": "touristappid"` 替换为正式 AppID。
3. **准备 https 域名**:小程序生产环境强制 https,且域名需 ICP 备案。将 Web 端 API 部署到如 `https://api.your-domain.com`,并把 `config.js` 的 `BASE_URL` 默认值改为该地址(用户仍可在「我的」页覆盖)。
4. **配置合法域名**:微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → `request` 合法域名,添加你的 https API 域名。
5. **重新打开域名校验**:上线前确认开发者工具「校验合法域名」勾选状态恢复正常(本地开发才允许关闭)。
6. **提交审核发布**:上传代码 → 提交审核 → 发布。免责声明、「我的」页服务器设置等内容建议在提审时如实填写页面用途说明。

## 开发约定

- 色彩体系在 `app.wxss` 中以 class 实现(小程序不依赖 CSS 变量):`text-deep #1E1B4B`、`text-indigo #4F46E5`、`text-orange #E8701A`、`text-teal #0D948A` 及对应 `bg-*`。
- 通用样式(卡片 `.card`、按钮 `.btn-primary` / `.btn-ghost`、进度条 `.progress-track` / `.progress-fill`)在 `app.wxss`,页面私有样式写在各自 `wxss`。
- 模块一律 CommonJS;不要引入 `import/export`,保持无构建可直接运行。
