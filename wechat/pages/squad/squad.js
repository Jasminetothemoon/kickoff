// pages/squad/squad.js — 「小队」页:与多 Agent 聊天
var api = require('../../utils/api.js');

// Agent 徽章元信息(与 Web 端四位 Agent 对应)
var AGENT_META = {
  Coach: { label: 'Coach · 教练', emoji: '🧭', cls: 'badge-coach' },
  Spark: { label: 'Spark · 火花', emoji: '✨', cls: 'badge-spark' },
  Pace: { label: 'Pace · 节奏', emoji: '🎧', cls: 'badge-pace' },
  Mirror: { label: 'Mirror · 镜子', emoji: '🪞', cls: 'badge-mirror' }
};

Page({
  data: {
    messages: [],       // [{id, role:'me'|'agent', agentLabel, agentEmoji, agentClass, text}]
    input: '',
    sending: false,
    chips: ['帮我拆解一个任务', '复盘一下', '我完全没动力'],
    scrollIntoView: ''
  },

  onLoad: function () {
    this.nextId = 1; // 消息自增 id,用于 wx:key 与 scroll-into-view
    this.appendMessage({
      id: 0,
      role: 'agent',
      agentLabel: 'Coach · 教练',
      agentEmoji: '🧭',
      agentClass: 'badge-coach',
      text: '嗨,这里是你的支持小队 🧭✨🎧🪞\n卡住了、没动力、想复盘,随时说。'
    });
  },

  onInput: function (e) {
    this.setData({ input: e.detail.value });
  },

  // 快捷问题 chip:填入并直接发送
  onChipTap: function (e) {
    var text = e.currentTarget.dataset.text || '';
    this.setData({ input: text });
    this.onSend();
  },

  onSend: function () {
    var text = (this.data.input || '').trim();
    if (!text || this.data.sending) {
      return;
    }
    var that = this;
    this.setData({ input: '' });
    this.appendMessage({ id: this.nextId++, role: 'me', text: text });
    this.setData({ sending: true });

    api.chat(text).then(function (res) {
      that.setData({ sending: false });
      var agent = (res && res.agent) || '';
      var meta = AGENT_META[agent];
      if (!meta) {
        meta = { label: agent || '小队', emoji: '🤖', cls: 'badge-default' };
      }
      that.appendMessage({
        id: that.nextId++,
        role: 'agent',
        agentLabel: meta.label,
        agentEmoji: meta.emoji,
        agentClass: meta.cls,
        text: (res && res.reply) || '……'
      });
    }).catch(function () {
      // 网络失败:给出本地兜底气泡(api 层已统一 toast 错误)
      that.setData({ sending: false });
      that.appendMessage({
        id: that.nextId++,
        role: 'agent',
        agentLabel: '小队',
        agentEmoji: '🤖',
        agentClass: 'badge-default',
        text: '刚才没接上话,稍后再试一次?'
      });
    });
  },

  // 追加一条消息并滚动到底部
  appendMessage: function (msg) {
    var that = this;
    var messages = this.data.messages.concat([msg]);
    this.setData({ messages: messages }, function () {
      that.setData({ scrollIntoView: 'msg-' + msg.id });
    });
  }
});
