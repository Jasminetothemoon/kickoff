/**
 * Kickoff Desktop — Menubar 伴侣(触点 B)
 * 常驻时间条(Tray)+ 杂念停车场全局快捷键(Shift+Cmd/Ctrl+K)
 * + 快速启动小窗全局快捷键(Shift+Cmd/Ctrl+J)。
 *
 * 所有服务器请求都在主进程完成(绕开 file:// 的 CORS 限制),
 * renderer 通过 preload.js 暴露的最小桥接 API 访问。
 */
'use strict';

const {
  app, BrowserWindow, Tray, Menu, Notification, globalShortcut, shell,
  nativeImage, ipcMain, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');

// --------------------------------------------------------------------------
// 常量
// --------------------------------------------------------------------------
const POPOVER_W = 360;
const POPOVER_H = 480;
const PARK_W = 380;
const PARK_H = 150;
const QUICK_W = 380;
const QUICK_H = 270;
const DEFAULT_SERVER = 'http://localhost:3000';
const SPRINT_OPTIONS = [2, 10, 15];
const GLOBAL_PARK_ACCEL = 'Shift+CommandOrControl+K';
const GLOBAL_QUICK_ACCEL = 'Shift+CommandOrControl+J';
// 快速启动小窗可打开的 Web 页面白名单(渲染进程只传 key,URL 由主进程拼接)
const WEB_PAGES = { today: '/today', focus: '/focus' };

const IPC = {
  getState: 'kickoff:get-state',
  refreshToday: 'kickoff:refresh-today',
  startSprint: 'kickoff:start-sprint',
  stopSprint: 'kickoff:stop-sprint',
  park: 'kickoff:park',
  checkin: 'kickoff:checkin',
  openWeb: 'kickoff:open-web',
  openWebPage: 'kickoff:open-web-page',
  getConfig: 'kickoff:get-config',
  setConfig: 'kickoff:set-config',
  // main → renderer 推送
  sprintTick: 'kickoff:sprint-tick',
  sprintDone: 'kickoff:sprint-done',
  todayUpdated: 'kickoff:today-updated',
  showSettings: 'kickoff:show-settings',
};

// 内嵌 32x32 图标(assets/make-icon.js 生成;文件缺失时的 fallback)
const EMBEDDED_ICON_32 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA4UlEQVR42mNgGErA3+3pSn+3py/93Z7+x4FBciupbWmmv9vTm3gsxYVBejKp4eP/FOKV5Fr+kwqWw/DPgbScNEfQyHLiHEGlOCcvTUBT+3864UxsDrhJRwfcxOYAojRHBT0HY0odQXbcV5e8+f/l89//E7vfUy8tECheMRwAA/fu/ALzyXTAS5KDH90BMLB319f/qbEvyI8GSh0AAqBoWb7408A5AAZevvhDdLQMLwcMaBRQIxEOeDYc2IJowIviwVIZDWx1POANkkHRJBsUjdJB0SwfFB2TQdE1GxSdU1oDADx+ZcAKK7j3AAAAAElFTkSuQmCC';

// --------------------------------------------------------------------------
// 配置持久化(userData/config.json,零依赖)
// --------------------------------------------------------------------------
let config = { server: DEFAULT_SERVER };
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (typeof raw.server === 'string' && /^https?:\/\//.test(raw.server)) {
      config = { ...config, ...raw };
    }
  } catch { /* 首次运行或文件损坏,用默认值 */ }
}
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch { /* 磁盘异常时静默,下次仍可用内存配置 */ }
}

// --------------------------------------------------------------------------
// 状态
// --------------------------------------------------------------------------
let tray = null;
let popover = null;
let parkWin = null;
let quickWin = null;

let today = null;          // /api/today 缓存
let todayError = null;     // 最近一次刷新错误(供 UI 显示)
let sprint = null;         // {minutes, startedAt, endAt, done}
let sprintTimer = null;

// --------------------------------------------------------------------------
// 服务器请求(主进程 fetch,带超时)
// --------------------------------------------------------------------------
function serverBase() {
  return config.server.replace(/\/+$/, '');
}

// 设备 UID:持久化在 config,随请求头 x-kickoff-uid 携带——
// 多用户底座按 cookie/header 识别用户;无稳定 UID 时每次请求都会被当成新访客(数据永远为空)
const { randomUUID } = require('node:crypto');
function ensureUid() {
  if (!config.uid || typeof config.uid !== 'string' || config.uid.length < 8) {
    config.uid = randomUUID();
    saveConfig();
  }
  return config.uid;
}
async function api(pathname, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(serverBase() + pathname, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-kickoff-uid': ensureUid() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('服务器无响应(8 秒超时)');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshToday({ silent } = {}) {
  try {
    today = await api('/api/today');
    todayError = null;
  } catch (err) {
    todayError = String((err && err.message) || err);
    if (!silent) console.warn('[kickoff] 刷新今日失败:', todayError);
  }
  const payload = { today, error: todayError };
  if (popover && !popover.isDestroyed()) sendWhenReady(popover, IPC.todayUpdated, payload);
  if (quickWin && !quickWin.isDestroyed()) sendWhenReady(quickWin, IPC.todayUpdated, payload);
  return payload;
}

// --------------------------------------------------------------------------
// 托盘图标(assets/icon-16.png + 32px 视网膜;缺文件时用内嵌 base64)
// --------------------------------------------------------------------------
function loadTrayIcon() {
  try {
    const p16 = path.join(__dirname, 'assets', 'icon-16.png');
    const p32 = path.join(__dirname, 'assets', 'icon.png');
    if (fs.existsSync(p16)) {
      const base = nativeImage.createFromBuffer(fs.readFileSync(p16));
      if (!base.isEmpty()) {
        if (fs.existsSync(p32)) {
          base.addRepresentation({
            scaleFactor: 2,
            buffer: fs.readFileSync(p32),
            width: 32,
            height: 32,
          });
        }
        return base;
      }
    }
  } catch { /* 落入内嵌 fallback */ }
  return nativeImage.createFromDataURL(EMBEDDED_ICON_32);
}

function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function sprintStateForRenderer() {
  if (!sprint) return { active: false, waitingCheckin: false };
  if (sprint.done) {
    return { active: false, waitingCheckin: true, minutes: sprint.minutes, remainingMs: 0, elapsedSeconds: sprint.minutes * 60 };
  }
  return {
    active: true,
    waitingCheckin: false,
    minutes: sprint.minutes,
    endAt: sprint.endAt,
    remainingMs: Math.max(0, sprint.endAt - Date.now()),
  };
}

function updateTrayTitle() {
  if (!tray) return;
  if (sprint && !sprint.done) {
    const label = formatClock(sprint.endAt - Date.now());
    if (process.platform === 'darwin') tray.setTitle(' ' + label, { fontName: 'Menlo' });
    tray.setToolTip(`Kickoff 冲刺中 · 剩余 ${label}`);
  } else if (sprint && sprint.done) {
    if (process.platform === 'darwin') tray.setTitle(' ✓');
    tray.setToolTip('Kickoff · 冲刺完成,待打卡');
  } else {
    if (process.platform === 'darwin') tray.setTitle('');
    tray.setToolTip('Kickoff · 点击开始今日冲刺');
  }
}

// --------------------------------------------------------------------------
// 冲刺计时
// --------------------------------------------------------------------------
function startSprint(minutes) {
  minutes = SPRINT_OPTIONS.includes(minutes) ? minutes : 2;
  stopTicker();
  sprint = { minutes, startedAt: Date.now(), endAt: Date.now() + minutes * 60 * 1000, done: false };
  sprintTimer = setInterval(tick, 1000);
  tick();
  return sprintStateForRenderer();
}
function stopTicker() {
  if (sprintTimer) { clearInterval(sprintTimer); sprintTimer = null; }
}
function tick() {
  if (!sprint || sprint.done) return;
  updateTrayTitle();
  const remainingMs = sprint.endAt - Date.now();
  if (popover && !popover.isDestroyed()) {
    sendWhenReady(popover, IPC.sprintTick, sprintStateForRenderer());
  }
  if (remainingMs <= 0) finishSprint();
}
function finishSprint() {
  if (!sprint || sprint.done) return;
  sprint.done = true;
  stopTicker();
  updateTrayTitle();
  if (popover && !popover.isDestroyed()) {
    sendWhenReady(popover, IPC.sprintDone, sprintStateForRenderer());
  }
  const n = new Notification({
    title: `⚡ ${sprint.minutes} 分钟冲刺完成!`,
    body: '要继续吗?打卡才算数 —— 点击这里打开面板完成打卡。',
    silent: false,
  });
  n.on('click', () => showPopover());
  n.show();
  // 不强制弹出面板抢焦点:托盘 title 变为 ✓,点通知即可回来打卡
}
function stopSprint() {
  stopTicker();
  sprint = null;
  updateTrayTitle();
  return sprintStateForRenderer();
}

// --------------------------------------------------------------------------
// Popover 窗口
// --------------------------------------------------------------------------
function createPopover() {
  popover = new BrowserWindow({
    width: POPOVER_W,
    height: POPOVER_H,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  popover.loadFile('index.html');
  // 失焦自动隐藏
  popover.on('blur', () => {
    if (popover && popover.isVisible()) {
      popover.hide();
      lastHiddenAt = Date.now();
    }
  });
  popover.on('closed', () => { popover = null; });
  // 兜底:页面加载失败时退回内嵌提示页,避免白窗
  popover.webContents.on('did-fail-load', () => {
    popover.loadURL('data:text/html,<body style="font:14px -apple-system">面板加载失败,请重启应用</body>');
  });
}

let lastHiddenAt = 0;
/** 页面加载完成后再推送 IPC,避免事件在 loadFile 完成前丢失 */
function sendWhenReady(win, channel, arg) {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.send(channel, arg);
    });
  } else {
    win.webContents.send(channel, arg);
  }
}
function positionPopover() {
  if (!popover) return;
  try {
    if (process.platform === 'darwin' && tray) {
      const tb = tray.getBounds();
      const wb = popover.getBounds();
      const display = screen.getDisplayMatching(tb);
      const wa = display.workArea;
      let x = Math.round(tb.x + tb.width / 2 - wb.width / 2);
      x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - wb.width - 8);
      let y = tb.y + tb.height + 6;
      if (y + wb.height > wa.y + wa.height) y = Math.max(wa.y, tb.y - wb.height - 6); // 菜单栏在上沿
      popover.setPosition(x, y);
    } else {
      const cursor = screen.getCursorScreenPoint();
      const wa = screen.getDisplayNearestPoint(cursor).workArea;
      popover.setPosition(
        Math.max(wa.x + 8, wa.x + wa.width - POPOVER_W - 12),
        Math.max(wa.y + 8, wa.y + wa.height - POPOVER_H - 12),
      );
    }
  } catch { /* 定位失败时保持默认位置 */ }
}
function showPopover({ settings = false } = {}) {
  if (!popover) createPopover();
  positionPopover();
  popover.show();
  popover.focus();
  if (settings) sendWhenReady(popover, IPC.showSettings);
  refreshToday({ silent: true });
  if (sprint && !sprint.done) {
    sendWhenReady(popover, IPC.sprintTick, sprintStateForRenderer());
  }
}
function togglePopover() {
  if (!popover) { showPopover(); return; }
  // 刚因点击托盘触发 blur 隐藏时,应视为"重新显示"而非 toggle 关闭
  if (Date.now() - lastHiddenAt < 300) { showPopover(); return; }
  if (popover.isVisible()) popover.hide();
  else showPopover();
}

// --------------------------------------------------------------------------
// 杂念停车场小窗
// --------------------------------------------------------------------------
function createParkWindow() {
  parkWin = new BrowserWindow({
    width: PARK_W,
    height: PARK_H,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    backgroundColor: '#1E1B4B',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  parkWin.loadFile('park.html');
  parkWin.on('blur', () => {
    if (parkWin && parkWin.isVisible()) parkWin.hide();
  });
  parkWin.on('closed', () => { parkWin = null; });
  parkWin.webContents.on('did-fail-load', () => {
    parkWin.loadURL('data:text/html,<body style="font:14px -apple-system;color:#fff;background:#1E1B4B">停车场加载失败</body>');
  });
}
function showParkWindow() {
  if (!parkWin) createParkWindow();
  try {
    const cursor = screen.getCursorScreenPoint();
    const wa = screen.getDisplayNearestPoint(cursor).workArea;
    const b = parkWin.getBounds();
    parkWin.setPosition(Math.round(wa.x + wa.width / 2 - b.width / 2), wa.y + Math.round(wa.height * 0.18));
  } catch { /* 默认居中 */ }
  parkWin.show();
  parkWin.focus();
}

// --------------------------------------------------------------------------
// 快速启动小窗(全局热键 Shift+Cmd/Ctrl+J):今日第一步 + 两个入口
// --------------------------------------------------------------------------
function createQuickWindow() {
  quickWin = new BrowserWindow({
    width: QUICK_W,
    height: QUICK_H,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    backgroundColor: '#1E1B4B',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  quickWin.loadFile('quick.html');
  quickWin.on('blur', () => {
    if (quickWin && quickWin.isVisible()) quickWin.hide();
  });
  quickWin.on('closed', () => { quickWin = null; });
  quickWin.webContents.on('did-fail-load', () => {
    quickWin.loadURL('data:text/html,<body style="font:14px -apple-system;color:#fff;background:#1E1B4B">快速启动加载失败</body>');
  });
}
function showQuickWindow() {
  if (!quickWin) createQuickWindow();
  try {
    const cursor = screen.getCursorScreenPoint();
    const wa = screen.getDisplayNearestPoint(cursor).workArea;
    const b = quickWin.getBounds();
    quickWin.setPosition(Math.round(wa.x + wa.width / 2 - b.width / 2), wa.y + Math.round(wa.height * 0.18));
  } catch { /* 默认居中 */ }
  quickWin.show();
  quickWin.focus();
  // today 缓存为空(面板从未打开过/启动后一直没拉到)时,先静默刷新一次;
  // 刷新完成后会通过 kickoff:today-updated 推给小窗。
  if (!today) refreshToday({ silent: true });
}

/** 在默认浏览器打开 Web 应用的指定页(白名单:today / focus) */
function openWebPage(page) {
  const p = WEB_PAGES[String(page || '')];
  if (!p) return { ok: false, error: '未知页面' };
  shell.openExternal(serverBase() + p);
  return { ok: true };
}

// --------------------------------------------------------------------------
// 托盘
// --------------------------------------------------------------------------
function createTray() {
  tray = new Tray(loadTrayIcon());
  if (typeof tray.setIgnoreDoubleClickEvents === 'function') {
    tray.setIgnoreDoubleClickEvents(true);
  }
  tray.on('click', togglePopover);
  tray.on('right-click', () => {
    tray.popUpContextMenu(buildTrayMenu());
  });
  // Windows/Linux:托盘图标右键弹菜单;左键仍触发 click → toggle popover
  if (process.platform !== 'darwin') {
    tray.setContextMenu(buildTrayMenu());
  }
  updateTrayTitle();
}

function buildTrayMenu() {
  const sprintItem = sprint && !sprint.done
    ? { label: `冲刺中 · 剩余 ${formatClock(sprint.endAt - Date.now())}`, enabled: false }
    : { label: '开始冲刺…', click: () => showPopover() };
  return Menu.buildFromTemplate([
    sprintItem,
    { label: '打开面板', click: () => showPopover() },
    { type: 'separator' },
    { label: '启动邀约(打开今天)', click: () => openWebPage('today') },
    { label: '陪伴冲刺', click: () => openWebPage('focus') },
    { label: '打开 Web 应用', click: () => shell.openExternal(serverBase()) },
    { label: '设置服务器地址…', click: () => showPopover({ settings: true }) },
    { label: '杂念停车场 (Shift+Cmd+K)', click: () => showParkWindow() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
}

// --------------------------------------------------------------------------
// IPC(与 preload.js 的命名一一对应)
// --------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('kickoff:get-uid', () => ensureUid());
  ipcMain.handle('kickoff:set-uid', (_e, uid) => {
    if (typeof uid !== 'string' || uid.trim().length < 8) return false;
    config.uid = uid.trim();
    saveConfig();
    refreshToday({ silent: true }).catch(() => {});
    return true;
  });
  ipcMain.handle(IPC.getState, () => ({
    server: config.server,
    today,
    todayError,
    sprint: sprintStateForRenderer(),
    sprintOptions: SPRINT_OPTIONS,
    platform: process.platform,
  }));

  ipcMain.handle(IPC.refreshToday, async () => refreshToday({ silent: true }));

  ipcMain.handle(IPC.startSprint, (_e, minutes) => startSprint(Number(minutes)));

  ipcMain.handle(IPC.stopSprint, () => stopSprint());

  ipcMain.handle(IPC.park, async (_e, text) => {
    const value = String(text || '').trim().slice(0, 200);
    if (!value) return { ok: false, error: '内容为空' };
    try {
      const data = await api('/api/park', { method: 'POST', body: { text: value } });
      return { ok: true, count: data && data.count };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle(IPC.checkin, async (_e, payload) => {
    try {
      const task = today && today.task;
      if (!task || !task.id) {
        return { ok: false, error: '今日任务未加载(无法确定 taskId),请打开面板刷新后重试' };
      }
      const body = {
        taskId: task.id,
        taskTitle: task.title,
      };
      if (payload && typeof payload.granularity === 'number') {
        body.granularity = Math.min(60, Math.max(1, Math.round(payload.granularity)));
      }
      if (payload && typeof payload.delaySeconds === 'number') {
        body.delaySeconds = Math.min(86400, Math.max(0, Math.round(payload.delaySeconds)));
      }
      const data = await api('/api/checkins', { method: 'POST', body });
      sprint = null; // 打卡完成,结束本轮冲刺状态
      updateTrayTitle();
      refreshToday({ silent: true });
      return {
        ok: !!(data && data.ok),
        celebration: (data && data.celebration) || '完成打卡!',
        adjustments: (data && data.adjustments) || [],
        error: data && data.ok === false ? '服务器拒绝了本次打卡' : undefined,
      };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle(IPC.openWeb, () => {
    shell.openExternal(serverBase());
    return true;
  });

  // 快速启动小窗:打开 {server}/today 或 {server}/focus(白名单见 WEB_PAGES)
  ipcMain.handle(IPC.openWebPage, (_e, page) => openWebPage(page));

  ipcMain.handle(IPC.getConfig, () => ({ ...config }));

  ipcMain.handle(IPC.setConfig, (_e, cfg) => {
    const server = typeof cfg === 'string' ? cfg : cfg && cfg.server;
    if (typeof server !== 'string' || !/^https?:\/\/.+/.test(server.trim())) {
      return { ok: false, error: '地址需以 http:// 或 https:// 开头' };
    }
    config.server = server.trim().replace(/\/+$/, '');
    saveConfig();
    refreshToday({ silent: true });
    return { ok: true, server: config.server };
  });

  // 停车场小窗请求关闭自己
  ipcMain.on('kickoff:hide-park', () => {
    if (parkWin) parkWin.hide();
  });

  // 快速启动小窗请求关闭自己
  ipcMain.on('kickoff:hide-quick', () => {
    if (quickWin) quickWin.hide();
  });
}

// --------------------------------------------------------------------------
// 生命周期
// --------------------------------------------------------------------------
app.whenReady().then(() => {
  loadConfig();
  if (process.platform === 'darwin' && typeof app.dock === 'object' && app.dock && app.dock.hide) {
    try { app.dock.hide(); } catch { /* 非 Mac 或无 dock 时忽略 */ }
  }
  createPopover();
  createParkWindow();
  createQuickWindow();
  createTray();
  registerIpc();

  const ok = globalShortcut.register(GLOBAL_PARK_ACCEL, showParkWindow);
  if (!ok) console.warn('[kickoff] 全局快捷键注册失败,可能被其他应用占用');

  const okQuick = globalShortcut.register(GLOBAL_QUICK_ACCEL, showQuickWindow);
  if (!okQuick) console.warn('[kickoff] 快速启动快捷键注册失败,可能被其他应用占用');

  refreshToday({ silent: true });
  // 低频轮询,保证 Tray tooltip / 面板数据不至于陈旧(面板打开时也会即时刷新)
  setInterval(() => refreshToday({ silent: true }), 5 * 60 * 1000);
});

app.on('window-all-closed', () => {
  // menubar 应用:关窗不退出,常驻托盘
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopTicker();
});

app.on('activate', () => {
  // macOS dock 已隐藏,重新激活即显示面板
  showPopover();
});
