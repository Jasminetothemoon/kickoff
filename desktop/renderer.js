/**
 * Kickoff Desktop — popover 渲染逻辑(原生 JS,无框架)
 * 通过 window.kickoff(preload contextBridge)与主进程通信,不直接 require。
 */
'use strict';

(() => {
  const ko = window.kickoff;
  if (!ko) {
    document.getElementById('card-area').innerHTML =
      '<div class="error-box"><div class="emoji">⚠️</div><h3>桥接初始化失败</h3><p>请重启应用。</p></div>';
    return;
  }

  // ---------- 状态 ----------
  let state = {
    server: 'http://localhost:3000',
    today: null,
    todayError: null,
    sprint: { active: false, waitingCheckin: false },
    sprintOptions: [2, 10, 15],
    platform: '',
  };
  let justCheckedIn = null; // {celebration, adjustments}
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const cardArea = $('card-area');
  const viewMain = $('view-main');
  const viewSettings = $('view-settings');

  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const esc = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---------- 渲染 ----------
  function render() {
    renderWeekbar();
    renderCards();
  }

  function renderWeekbar() {
    const wp = state.today && state.today.weekProgress;
    const weekbar = $('weekbar');
    const focusEl = $('week-focus');
    if (!wp || (!wp.total && !wp.done)) {
      weekbar.hidden = true;
      focusEl.hidden = true;
      return;
    }
    weekbar.hidden = false;
    const pct = wp.total > 0 ? Math.round((wp.done / wp.total) * 100) : 0;
    $('week-fill').style.width = pct + '%';
    $('week-num').textContent = `${wp.done}/${wp.total}`;
    if (state.today.weekFocus) {
      focusEl.hidden = false;
      focusEl.textContent = '🎯 ' + state.today.weekFocus;
    } else {
      focusEl.hidden = true;
    }
  }

  function sprintCardHtml() {
    const s = state.sprint;
    if (s.active) {
      const total = (s.minutes || 1) * 60 * 1000;
      const pct = Math.min(100, Math.max(0, (1 - s.remainingMs / total) * 100));
      return `
        <section class="card timer-card">
          <div class="card-kicker">冲刺中 · ${s.minutes} 分钟</div>
          <div class="timer-num" id="timer-num">${fmtClock(s.remainingMs)}</div>
          <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:${pct}%"></div></div>
          <p class="card-sub">只管这一格时间,杂念随手停进停车场。</p>
          <button class="btn btn-danger-ghost" id="btn-abandon" ${busy ? 'disabled' : ''}>放弃冲刺</button>
        </section>`;
    }
    if (s.waitingCheckin) {
      return `
        <section class="card timer-card">
          <div class="card-kicker">冲刺完成</div>
          <div class="timer-num done">00:00</div>
          <div class="progress-track"><div class="progress-fill complete" style="width:100%"></div></div>
          <p class="card-sub">要继续吗?<b>打卡才算数</b>。</p>
          <button class="btn btn-primary" id="btn-checkin" ${busy ? 'disabled' : ''}>✓ 完成打卡</button>
          <button class="btn btn-ghost" id="btn-skip-checkin">先不打卡</button>
        </section>`;
    }
    return '';
  }

  function todayCardHtml() {
    const t = state.today;
    if (!t) return '';
    const task = t.task;
    const sc = t.startCard;
    if (!task) {
      if (t.hasGoal === false) {
        return `
          <section class="card empty">
            <div class="emoji">🌱</div>
            <h3>还没有设定目标</h3>
            <p>先去 Web 端立一个本周目标,桌面端就能随时陪你启动。</p>
            <button class="btn btn-primary" id="btn-open-web-main">去 Web 端设定目标</button>
          </section>`;
      }
      return `
        <section class="card empty">
          <div class="emoji">🎉</div>
          <h3>本周任务全部清零</h3>
          <p>休息也是计划的一部分。需要的话去 Web 端看看下周安排。</p>
          <button class="btn btn-primary" id="btn-open-web-main">打开 Web 应用</button>
        </section>`;
    }
    const minutes = (sc && sc.minutes) || task.minutes || 2;
    return `
      <section class="card">
        <div class="card-kicker">今日任务</div>
        <div class="card-title">${esc(task.title)}</div>
        ${sc ? `
          <div class="card-sub">第一步:${esc(sc.firstStep)}(约 ${minutes} 分钟)</div>
          ${sc.intent ? `<div class="intent"><b>执行意图</b><br/>${esc(sc.intent)}</div>` : ''}
          ${sc.doneCriteria ? `<div class="done-criteria">${esc(sc.doneCriteria)}</div>` : ''}
        ` : `<div class="card-sub">建议先来一发 2 分钟微冲刺,迈出第一步。</div>`}
      </section>`;
  }

  function sprintButtonsHtml() {
    if (state.sprint.active || state.sprint.waitingCheckin) return '';
    const t = state.today;
    if (!t || !t.task) return '';
    const hints = { 2: '微启动', 10: '小步走', 15: '深推进' };
    const btns = (state.sprintOptions || [2, 10, 15])
      .map((m) => `<button class="sprint-btn" data-min="${m}">${m} 分钟<small>${hints[m] || '冲刺'}</small></button>`)
      .join('');
    return `<div class="sprint-row">${btns}</div>`;
  }

  function checkedInCardHtml() {
    if (!justCheckedIn) return '';
    const adj = (justCheckedIn.adjustments || [])
      .map((a) => `<li>${esc(a)}</li>`).join('');
    return `
      <section class="card celebrate">
        <div class="emoji">🏁</div>
        <h3>${esc(justCheckedIn.celebration || '打卡成功!')}</h3>
        <p>这一步真实地发生了。今天的你是启动者。</p>
        ${adj ? `<ul class="adjustments">${adj}</ul>` : ''}
        <button class="btn btn-ghost" id="btn-back-after-checkin" style="margin-top:12px">好的</button>
      </section>`;
  }

  function errorStripHtml() {
    if (!state.todayError || state.today) return ''; // 有缓存数据时只做弱提示
    return `
      <section class="card error-box">
        <div class="emoji">🔌</div>
        <h3>连不上 Kickoff 服务器</h3>
        <p>${esc(state.todayError)}</p>
        <button class="btn btn-primary" id="btn-goto-settings">检查服务器设置</button>
        <button class="btn btn-ghost" id="btn-retry">重试</button>
      </section>`;
  }

  function renderCards() {
    const s = state.sprint;
    const parts = [];
    parts.push(checkedInCardHtml());
    if (!justCheckedIn) {
      parts.push(errorStripHtml());
      parts.push(s.active || s.waitingCheckin ? sprintCardHtml() : todayCardHtml());
      parts.push(sprintButtonsHtml());
    }
    cardArea.innerHTML = parts.filter(Boolean).join('') ||
      '<div class="loading">加载中…</div>';
    bindCardEvents();
  }

  // ---------- 事件绑定 ----------
  function bindCardEvents() {
    document.querySelectorAll('.sprint-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const minutes = Number(btn.dataset.min);
        if (!minutes || busy) return;
        busy = true;
        justCheckedIn = null;
        try {
          state.sprint = await ko.startSprint(minutes);
        } finally {
          busy = false;
        }
        render();
      });
    });
    const btnAbandon = $('btn-abandon');
    if (btnAbandon) btnAbandon.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      try { state.sprint = await ko.stopSprint(); } finally { busy = false; }
      render();
    });
    const btnCheckin = $('btn-checkin');
    if (btnCheckin) btnCheckin.addEventListener('click', doCheckin);
    const btnSkip = $('btn-skip-checkin');
    if (btnSkip) btnSkip.addEventListener('click', async () => {
      state.sprint = await ko.stopSprint();
      render();
    });
    const openWebBtns = ['btn-open-web-main'];
    openWebBtns.forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('click', () => ko.openWeb());
    });
    const btnSettings = $('btn-goto-settings');
    if (btnSettings) btnSettings.addEventListener('click', () => showSettings(true));
    const btnRetry = $('btn-retry');
    if (btnRetry) btnRetry.addEventListener('click', refresh);
    const btnBackAfter = $('btn-back-after-checkin');
    if (btnBackAfter) btnBackAfter.addEventListener('click', () => {
      justCheckedIn = null;
      render();
    });
  }

  async function doCheckin() {
    if (busy) return;
    busy = true;
    const s = state.sprint;
    const btn = $('btn-checkin');
    if (btn) { btn.disabled = true; btn.textContent = '打卡中…'; }
    try {
      const res = await ko.checkin({
        granularity: s && s.minutes ? s.minutes : undefined,
        delaySeconds: s && s.minutes ? s.minutes * 60 : 0,
      });
      if (res && res.ok) {
        justCheckedIn = { celebration: res.celebration, adjustments: res.adjustments };
        state.sprint = { active: false, waitingCheckin: false };
        await refresh();
      } else {
        if (btn) { btn.disabled = false; btn.textContent = '✓ 完成打卡'; }
        alert(((res && res.error) || '打卡失败') + '\n\n若持续失败,请确认 Web 端正在运行。');
      }
    } finally {
      busy = false;
      render();
    }
  }

  // ---------- 数据 ----------
  async function refresh() {
    try {
      state = await ko.getState();
    } catch { /* main 未就绪 */ }
    render();
  }

  // ---------- 视图切换 ----------
  function showSettings(show) {
    viewMain.hidden = show;
    viewSettings.hidden = !show;
    if (show && $('input-uid')) {
      window.kickoff?.getUid?.().then((uid) => { $('input-uid').value = uid || ''; }).catch(() => {});
    }
    if (show) {
      $('input-server').value = state.server || 'http://localhost:3000';
      if ($('input-uid')) $('input-uid').value = window.kickoff?.getUid?.() || '';
      setSettingsMsg('', '');
    }
  }

  function setSettingsMsg(text, cls) {
    const el = $('settings-msg');
    el.textContent = text;
    el.className = 'settings-msg ' + (cls || '');
  }

  $('btn-settings').addEventListener('click', () => showSettings(true));
  $('btn-back').addEventListener('click', () => showSettings(false));
  $('btn-web').addEventListener('click', () => ko.openWeb());

  $('btn-copy-uid') && $('btn-copy-uid').addEventListener('click', async () => {
      const uid = window.kickoff?.getUid?.() || '';
      try { await navigator.clipboard.writeText(uid); $('uid-status').textContent = '已复制本机 UID'; }
      catch { $('uid-status').textContent = '本机 UID:' + uid; }
    });
    $('btn-save-uid') && $('btn-save-uid').addEventListener('click', async () => {
      const v = ($('input-uid').value || '').trim();
      if (v.length < 8) { $('uid-status').textContent = 'UID 至少 8 位'; return; }
      const ok = await window.kickoff.setUid(v);
      $('uid-status').textContent = ok ? '✓ 已配对,数据将与该网页账户同步' : '保存失败';
      window.kickoff?.refreshToday?.();
    });
$('btn-save-server').addEventListener('click', async () => {
    const val = $('input-server').value.trim();
    setSettingsMsg('保存中…', '');
    const res = await ko.setConfig(val);
    if (res && res.ok) {
      state.server = res.server;
      setSettingsMsg('已保存,正在重新连接…', 'ok');
      await refresh();
      setSettingsMsg(state.todayError ? '仍连不上:' + state.todayError : '连接成功 ✓', state.todayError ? 'err' : 'ok');
    } else {
      setSettingsMsg((res && res.error) || '保存失败', 'err');
    }
  });

  $('btn-test-server').addEventListener('click', async () => {
    setSettingsMsg('测试中…', '');
    const res = await ko.refreshToday();
    if (res && res.today && !res.error) {
      setSettingsMsg('连接成功 ✓', 'ok');
    } else {
      setSettingsMsg('连接失败:' + ((res && res.error) || '未知错误'), 'err');
    }
  });

  $('input-server').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-save-server').click();
    if (e.key === 'Escape') showSettings(false);
  });

  // ---------- 主进程事件 ----------
  ko.onSprintTick((s) => {
    if (!s || !s.active) return;
    const changed = !state.sprint.active || state.sprint.minutes !== s.minutes;
    state.sprint = s;
    if (changed) { render(); return; }
    const num = $('timer-num');
    const fill = $('progress-fill');
    if (num) num.textContent = fmtClock(s.remainingMs);
    if (fill) {
      const total = (s.minutes || 1) * 60 * 1000;
      fill.style.width = Math.min(100, Math.max(0, (1 - s.remainingMs / total) * 100)) + '%';
    }
  });
  ko.onSprintDone((s) => {
    state.sprint = s || { active: false, waitingCheckin: true };
    render();
  });
  ko.onTodayUpdated((payload) => {
    if (payload) {
      state.today = payload.today;
      state.todayError = payload.error;
    }
    render();
  });
  ko.onShowSettings(() => showSettings(true));

  // 窗口每次显示时刷新(隐藏→显示触发 visibilitychange)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      justCheckedIn = null; // 重新显示时回到主视图
      refresh();
    }
  });

  refresh();
})();
