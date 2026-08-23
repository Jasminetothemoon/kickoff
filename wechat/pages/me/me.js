// pages/me/me.js — 「我的」页:服务器设置 / 专注支持模式 / 免责声明
var config = require('../../config.js');

// 专注支持模式开关的本地存储 key
var STORAGE_KEY_FOCUS = 'kickoff_focus_mode';

Page({
  onEnableReminder: function () {
    var that = this;
    var config = require('../../config.js');
    var tmplId = config.REMINDER_TEMPLATE_ID;
    if (!tmplId) {
      that.setData({ reminderStatus: '尚未配置模板 ID:注册小程序并在 config.js 填入后可用(详见 README)' });
      return;
    }
    wx.login({
      success: function (lr) {
        wx.requestSubscribeMessage({
          tmplIds: [tmplId],
          success: function (res) {
            if (res[tmplId] === 'accept') {
              require('../../utils/api.js').wechatSubscribe(lr.code, tmplId)
                .then(function () { that.setData({ reminderStatus: '✓ 已开启 — 到点 Pace 会来敲门(本次授权可收 1 条)' }); })
                .catch(function () { that.setData({ reminderStatus: '已授权,但上报失败(稍后重试不影响授权)' }); });
            } else {
              that.setData({ reminderStatus: '本次未授权 — 想收提醒时再点一次即可' });
            }
          },
          fail: function () {
            that.setData({ reminderStatus: '订阅面板拉起失败(需在微信开发者工具/真机环境)' });
          }
        });
      },
      fail: function () { that.setData({ reminderStatus: '登录态获取失败' }); }
    });
  },

  data: {
    serverURL: '',   // 输入框中的服务器地址
    isHttp: false,   // 当前保存地址是否为 http(仅开发可用)
    focusMode: false
  },

  onShow: function () {
    var saved = '';
    try {
      saved = wx.getStorageSync(config.STORAGE_KEY_URL) || '';
    } catch (e) {
      // 读取失败回退默认值
    }
    var focus = false;
    try {
      focus = wx.getStorageSync(STORAGE_KEY_FOCUS) === true;
    } catch (e) {
      // 忽略,默认关闭
    }
    this.applyServerURL(saved || config.BASE_URL);
    this.setData({ focusMode: focus });
  },

  // 同步展示用地址与 http 警告标记
  applyServerURL: function (url) {
    this.setData({
      serverURL: url,
      isHttp: url.indexOf('http://') === 0
    });
  },

  onServerInput: function (e) {
    this.setData({ serverURL: e.detail.value });
  },

  onSaveServer: function () {
    var url = (this.data.serverURL || '').trim().replace(/\/+$/, '');
    if (!url) {
      wx.showToast({ title: '地址不能为空', icon: 'none' });
      return;
    }
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
      wx.showToast({ title: '地址需以 http:// 或 https:// 开头', icon: 'none' });
      return;
    }
    try {
      wx.setStorageSync(config.STORAGE_KEY_URL, url);
    } catch (e) {
      wx.showToast({ title: '保存失败,请重试', icon: 'none' });
      return;
    }
    this.applyServerURL(url);
    wx.showToast({ title: '已保存,回到「今天」即生效', icon: 'none' });
  },

  onResetServer: function () {
    try {
      wx.removeStorageSync(config.STORAGE_KEY_URL);
    } catch (e) {
      // 忽略移除失败
    }
    this.applyServerURL(config.BASE_URL);
    wx.showToast({ title: '已恢复默认地址', icon: 'none' });
  },

  onFocusModeChange: function (e) {
    var val = !!e.detail.value;
    try {
      wx.setStorageSync(STORAGE_KEY_FOCUS, val);
    } catch (err) {
      // 存储失败不影响开关展示
    }
    this.setData({ focusMode: val });
    wx.showToast({ title: val ? '已开启专注支持' : '已关闭专注支持', icon: 'none' });
  }
});
