/**
 * Kickoff Desktop — 快速启动小窗
 * 全局快捷键 Shift+Cmd/Ctrl+J 唤起;数据取自主进程 today 缓存(getState)。
 * 「现在开始(N 分钟)」→ 打开 {server}/today(自动聚焦启动卡);
 * 「开一场陪伴冲刺」→ 打开 {server}/focus。Esc 关闭。
 */
'use strict';

(() => {
  const ko = window.kickoff;
  const stepEl = document.getElementById('quick-step');
  const metaEl = document.getElementById('quick-meta');
  const btnStart = document.getElementById('btn-start-today');
  const btnFocus = document.getElementById('btn-focus-sprint');

  let minutes = 2;

  function sayMeta(text, cls) {
    metaEl.textContent = text;
    metaEl.className = 'quick-meta ' + (cls || '');
  }

  function render(today, err) {
    const task = today && today.task;
    const sc = today && today.startCard;
    if (sc && sc.firstStep) {
      stepEl.textContent = sc.firstStep;
      minutes = sc.minutes || (task && task.minutes) || 2;
      sayMeta(`约 ${minutes} 分钟`);
    } else if (task) {
      // 有今日任务但没有起步卡:退回任务标题,打开今天即可生成第一步
      stepEl.textContent = task.title;
      minutes = task.minutes || 2;
      sayMeta('还没有起步卡,打开今天看看第一步');
    } else if (today && today.hasGoal === false) {
      stepEl.textContent = '还没有设定目标';
      sayMeta('打开今天,先立一个本周目标');
    } else if (today) {
      stepEl.textContent = '今天没有待启动的任务';
      sayMeta('休息也是计划的一部分');
    } else if (err) {
      stepEl.textContent = '连不上 Kickoff 服务器';
      sayMeta(err, 'err');
    } else {
      stepEl.textContent = '加载中…';
      sayMeta('');
    }
    btnStart.textContent = `现在开始(${minutes} 分钟)`;
  }

  async function refresh() {
    try {
      const st = await ko.getState();
      render(st && st.today, st && st.todayError);
    } catch {
      render(null, '主进程未就绪');
    }
  }

  if (!ko) {
    stepEl.textContent = '桥接初始化失败';
    sayMeta('请重启应用', 'err');
    return;
  }

  btnStart.addEventListener('click', () => ko.openWebPage('today'));
  btnFocus.addEventListener('click', () => ko.openWebPage('focus'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ko.requestHideQuick();
  });

  // today 缓存更新时同步(小窗打开触发静默刷新后,结果由主进程推送)
  ko.onTodayUpdated((payload) => {
    if (payload) render(payload.today, payload.error);
  });

  // 每次窗口重新显示时:重新读取主进程缓存
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  refresh();
})();
