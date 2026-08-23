// config.js — 全局配置
// 开发环境默认指向本机 Web 端 API。
// ⚠️ 正式上线前必须替换为 https 域名,并在微信公众平台后台配置为 request 合法域名,
//    否则真机与线上环境无法访问(小程序生产环境强制要求 https + 已备案合法域名)。
// 当前隧道地址(本机会话有效;重启隧道后需更新;上线时换正式 https 域名)
var BASE_URL = 'https://humanity-theme-copying-pixel.trycloudflare.com';
// 微信订阅消息模板 ID:注册小程序后在「订阅消息」公共模板库申请,填到这里
var REMINDER_TEMPLATE_ID = '';

// 本地缓存 key:「我的」页保存的自定义服务器地址
var STORAGE_KEY_URL = 'kickoff_base_url';

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

// 取当前生效的服务器地址:优先读本地缓存,其次回退默认值
function getBaseURL() {
  try {
    var saved = wx.getStorageSync(STORAGE_KEY_URL);
    if (saved && typeof saved === 'string' && saved.length > 0) {
      return trimSlash(saved);
    }
  } catch (e) {
    // 读取失败时回退默认值
  }
  return trimSlash(BASE_URL);
}

module.exports = {
  REMINDER_TEMPLATE_ID: REMINDER_TEMPLATE_ID,
  BASE_URL: BASE_URL,
  STORAGE_KEY_URL: STORAGE_KEY_URL,
  getBaseURL: getBaseURL
};
