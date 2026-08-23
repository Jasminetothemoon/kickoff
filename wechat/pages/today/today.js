// pages/today/today.js — 「今天」页:启动卡 + 2 分钟计时 + 打卡 + 周进度
var api = require('../../utils/api.js');
var config = require('../../config.js');

Page({
  data: {
    baseURL: '',
    loading: true,
    hasGoal: true,        // 是否已在网页端创建目标
    task: null,           // {id, title, minutes}
    startCard: null,      // {firstStep, minutes, doneCriteria, intent}
    steps: [],            // 拆解步骤 [{key, title, minutes}]
    effMinutes: 2,        // 本轮计时分钟数(默认 2 分钟档)
    weekProgress: null,   // {done, total}
    weekPercent: 0,
    weekFocus: '',
    quickTask: '',        // 现场拆解输入
    parkText: '',         // 杂念停车场输入
    parkCount: 0,
    hasParkCount: false,
    smallerLoading: false,
    // 计时态(timerActive = 运行中或暂停中)
    timerActive: false,
    timerPaused: false,
    secondsLeft: 0,
    totalSeconds: 0,
    displayTime: '02:00',
    progressPercent: 0
  },

  onLoad: function () {
    this.timer = null; // setInterval 句柄,不进 data
  },

  onShow: function () {
    this.setData({ baseURL: config.getBaseURL() });
    if (this.data.timerPaused && this.data.secondsLeft > 0) {
      this.resumeTimer(); // 切后台回来自动续跑
      return;
    }
    if (this.data.timerActive) {
      return; // 计时中不刷新,避免打断现场
    }
    this.loadToday();
  },

  onHide: function () {
    this.pauseTimer();
  },

  onUnload: function () {
    this.clearTimer();
  },

  onPullDownRefresh: function () {
    if (this.data.timerActive) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadToday().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  /* ---------- 数据加载 ---------- */

  loadToday: function () {
    var that = this;
    this.setData({ loading: true });
    return api.getToday().then(function (res) {
      var startCard = (res && res.startCard) || null;
      that.setData({
        loading: false,
        hasGoal: !!(res && res.hasGoal),
        task: (res && res.task) || null,
        startCard: startCard,
        steps: [],
        effMinutes: (startCard && startCard.minutes) || 2,
        weekProgress: (res && res.weekProgress) || null,
        weekPercent: that.calcWeekPercent(res && res.weekProgress),
        weekFocus: (res && res.weekFocus) || ''
      });
    }).catch(function () {
      // 错误 toast 已由 api 层统一处理
      that.setData({ loading: false });
    });
  },

  calcWeekPercent: function (wp) {
    if (!wp || !wp.total) {
      return 0;
    }
    return Math.min(100, Math.round((wp.done / wp.total) * 100));
  },

  /* ---------- 拆解 ---------- */

  onQuickTaskInput: function (e) {
    this.setData({ quickTask: e.detail.value });
  },

  onQuickDecompose: function () {
    var raw = (this.data.quickTask || '').trim();
    if (!raw) {
      wx.showToast({ title: '先写下你想推进的事', icon: 'none' });
      return;
    }
    this.doDecompose(raw);
  },

  // 「换更小的步骤」:把当前第一步再拆小
  onSmallerStep: function () {
    var raw = '';
    if (this.data.startCard && this.data.startCard.firstStep) {
      raw = this.data.startCard.firstStep;
    } else if (this.data.task && this.data.task.title) {
      raw = this.data.task.title;
    }
    if (!raw) {
      return;
    }
    this.doDecompose(raw);
  },

  doDecompose: function (rawTask) {
    var that = this;
    if (this.data.smallerLoading) {
      return;
    }
    this.setData({ smallerLoading: true });
    api.decompose(rawTask).then(function (res) {
      var startCard = (res && res.startCard) || null;
      var rawSteps = (res && res.steps) || [];
      var mapped = [];
      for (var i = 0; i < rawSteps.length; i++) {
        mapped.push({
          key: 'step-' + i,
          title: rawSteps[i].title,
          minutes: rawSteps[i].minutes
        });
      }
      that.setData({
        smallerLoading: false,
        startCard: startCard,
        steps: mapped,
        effMinutes: (startCard && startCard.minutes) || 2
      });
      wx.showToast({ title: '已换成更小的步骤 🍼', icon: 'none' });
    }).catch(function () {
      that.setData({ smallerLoading: false });
    });
  },

  /* ---------- 2 分钟计时 ---------- */

  onStartTimer: function () {
    var minutes = this.data.effMinutes || 2;
    var total = Math.max(60, Math.round(minutes * 60));
    this.setData({
      timerActive: true,
      timerPaused: false,
      totalSeconds: total,
      secondsLeft: total,
      displayTime: this.formatTime(total),
      progressPercent: 0
    });
    this.startInterval();
  },

  startInterval: function () {
    var that = this;
    this.clearTimer();
    this.timer = setInterval(function () {
      var left = that.data.secondsLeft - 1;
      if (left <= 0) {
        that.clearTimer();
        that.setData({
          secondsLeft: 0,
          displayTime: that.formatTime(0),
          progressPercent: 100,
          timerActive: false,
          timerPaused: false
        });
        that.showDoneModal();
        return;
      }
      var total = that.data.totalSeconds;
      that.setData({
        secondsLeft: left,
        displayTime: that.formatTime(left),
        progressPercent: Math.round(((total - left) / total) * 100)
      });
    }, 1000);
  },

  pauseTimer: function () {
    if (this.data.timerActive && !this.data.timerPaused) {
      this.clearTimer();
      this.setData({ timerActive: true, timerPaused: true });
    }
  },

  resumeTimer: function () {
    if (this.data.timerPaused && this.data.secondsLeft > 0) {
      this.setData({ timerActive: true, timerPaused: false });
      this.startInterval();
    }
  },

  onToggleTimer: function () {
    if (this.data.timerPaused) {
      this.resumeTimer();
    } else {
      this.pauseTimer();
    }
  },

  clearTimer: function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  formatTime: function (seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    var mm = m < 10 ? '0' + m : '' + m;
    var ss = s < 10 ? '0' + s : '' + s;
    return mm + ':' + ss;
  },

  // 到点弹窗:完成打卡 or 再来一轮
  showDoneModal: function () {
    var that = this;
    wx.showModal({
      title: '要继续吗?',
      content: '这 ' + (this.data.effMinutes || 2) + ' 分钟你已经迈出第一步了。可以就此打住打卡庆祝,也可以趁热再学一会儿。',
      confirmText: '完成打卡',
      cancelText: '继续学',
      success: function (res) {
        if (res.confirm) {
          that.doCheckin();
        } else {
          that.onStartTimer(); // 再来一轮计时
        }
      }
    });
  },

  // 计时中提前完成
  onFinishEarly: function () {
    this.clearTimer();
    this.setData({ timerActive: false, timerPaused: false });
    this.doCheckin();
  },

  doCheckin: function () {
    var that = this;
    var taskId = this.data.task ? this.data.task.id : null;
    api.checkin(taskId).then(function (res) {
      var text = (res && res.celebration) ? res.celebration : '🎉 太棒了,完成一次!';
      wx.showToast({ title: text, icon: 'none', duration: 2500 });
      that.setData({
        timerActive: false,
        timerPaused: false,
        progressPercent: 0,
        secondsLeft: 0
      });
      that.loadToday();
    }).catch(function () {
      // 错误提示由 api 层统一 toast,保留现场供重试
    });
  },

  /* ---------- 杂念停车场 ---------- */

  onParkInput: function (e) {
    this.setData({ parkText: e.detail.value });
  },

  onPark: function () {
    var that = this;
    var text = (this.data.parkText || '').trim();
    if (!text) {
      wx.showToast({ title: '先写下飘进来的念头', icon: 'none' });
      return;
    }
    api.park(text).then(function (res) {
      that.setData({
        parkText: '',
        parkCount: (res && res.count) || 0,
        hasParkCount: true
      });
      wx.showToast({ title: '已放进停车场,安心回来 🅿️', icon: 'none' });
    }).catch(function () {
      // 错误 toast 已统一处理
    });
  },

  /* ---------- 未创建目标的引导 ---------- */

  onCopyBaseURL: function () {
    wx.setClipboardData({
      data: config.getBaseURL(),
      success: function () {
        wx.showToast({ title: '网页端地址已复制,去浏览器打开', icon: 'none', duration: 2500 });
      }
    });
  }
});
