// app.js — Kickoff 小程序入口
var config = require('./config.js');

App({
  onLaunch: function () {
    // 启动时同步一次服务器地址(「我的」页保存的地址会覆盖 config.js 默认值)
    this.globalData.baseURL = config.getBaseURL();
  },

  globalData: {
    baseURL: config.BASE_URL
  }
});
