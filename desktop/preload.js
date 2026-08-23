/**
 * Kickoff Desktop — preload(安全桥接)
 * contextIsolation: true / nodeIntegration: false / sandbox: true 下,
 * renderer 只能通过 window.kickoff 使用以下最小 API,不直接接触 Node/Electron。
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// 与 main.js 的 IPC 常量一一对应(kickoff:*)
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('kickoff', {
  /** 全量状态: {server, today, todayError, sprint, sprintOptions, platform} */
  getState: () => invoke('kickoff:get-state'),
  /** 强制刷新 /api/today 缓存 */
  refreshToday: () => invoke('kickoff:refresh-today'),

  /** 发起冲刺(minutes ∈ 2|10|15),返回冲刺状态 */
  startSprint: (minutes) => invoke('kickoff:start-sprint', minutes),
  /** 放弃当前冲刺 */
  stopSprint: () => invoke('kickoff:stop-sprint'),

  /** 杂念入停车场 → {ok, count?, error?} */
  park: (text) => invoke('kickoff:park', text),
  /** 完成打卡(taskId 取自主进程 today 缓存)→ {ok, celebration, adjustments, error?} */
  checkin: (payload) => invoke('kickoff:checkin', payload || {}),

  /** 在默认浏览器打开 Web 应用 */
  openWeb: () => invoke('kickoff:open-web'),
  /** 打开 Web 应用的指定页(today / focus)→ {ok, error?}(URL 由主进程按白名单拼接) */
  openWebPage: (page) => invoke('kickoff:open-web-page', page),

  /** 服务器配置(持久化于 userData/config.json) */
  getConfig: () => invoke('kickoff:get-config'),
  setConfig: (cfg) => invoke('kickoff:set-config', cfg),

  /** main → renderer 事件 */
  onSprintTick: (cb) => ipcRenderer.on('kickoff:sprint-tick', (_e, state) => cb(state)),
  onSprintDone: (cb) => ipcRenderer.on('kickoff:sprint-done', (_e, state) => cb(state)),
  onTodayUpdated: (cb) => ipcRenderer.on('kickoff:today-updated', (_e, payload) => cb(payload)),
  onShowSettings: (cb) => ipcRenderer.on('kickoff:show-settings', () => cb()),

  /** 停车场小窗请求隐藏自己(仅 park.html 使用) */
  requestHide: () => ipcRenderer.send('kickoff:hide-park'),

  /** 快速启动小窗请求隐藏自己(仅 quick.html 使用) */
  requestHideQuick: () => ipcRenderer.send('kickoff:hide-quick'),

  /** 设备 UID 配对(与网页账户同步数据) */
  getUid: () => ipcRenderer.invoke('kickoff:get-uid'),
  setUid: (uid) => ipcRenderer.invoke('kickoff:set-uid', uid)
});