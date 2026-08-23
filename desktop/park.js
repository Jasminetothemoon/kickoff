/**
 * Kickoff Desktop — 杂念停车场小窗
 * 全局快捷键 Shift+Cmd/Ctrl+K 唤起;Enter 提交 → POST /api/park;成功后自动隐藏。
 */
'use strict';

(() => {
  const ko = window.kickoff;
  const input = document.getElementById('park-input');
  const msg = document.getElementById('park-msg');
  let busy = false;
  let hideTimer = null;

  function say(text, cls) {
    msg.textContent = text;
    msg.className = 'park-msg ' + (cls || '');
  }

  async function submit() {
    const text = input.value.trim();
    if (!text) { say('先写点什么再停车 🙂', 'err'); return; }
    if (busy) return;
    busy = true;
    say('停车中…', '');
    try {
      const res = await ko.park(text);
      if (res && res.ok) {
        input.value = '';
        const count = typeof res.count === 'number' ? `(在场 ${res.count} 条)` : '';
        say(`已停好 ✓ ${count}`, 'ok');
        hideTimer = setTimeout(() => ko.requestHide(), 900);
      } else {
        say(((res && res.error) || '停车失败') + ' —— 按 Enter 重试,或稍后再来。', 'err');
      }
    } catch (err) {
      say('出错了:' + (err && err.message ? err.message : err), 'err');
    } finally {
      busy = false;
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(hideTimer);
      submit();
    } else if (e.key === 'Escape') {
      clearTimeout(hideTimer);
      ko.requestHide();
    }
  });

  // 每次窗口重新显示时:清空旧状态并聚焦输入框
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearTimeout(hideTimer);
      input.value = '';
      say('想到什么就停进来,大脑继续专注。', '');
      input.focus();
    }
  });

  // 首次加载
  input.focus();
})();
