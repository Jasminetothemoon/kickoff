// utils/api.js — wx.request 的 Promise 封装 + Kickoff 全部接口
// 统一约定:请求成功(2xx)resolve 后端返回的 data;
// 非 2xx 或网络失败时统一 toast 错误并 reject,页面只需处理 then。
var config = require('../config.js');

// 统一错误提示
function showError(message) {
  wx.showToast({
    title: message || '请求失败,请稍后再试',
    icon: 'none',
    duration: 2200
  });
}

// 基础请求
function request(path, method, data) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: config.getBaseURL() + path,
      method: method || 'GET',
      data: data || {},
      timeout: 15000,
      header: {
        'content-type': 'application/json'
      },
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          var msg = '请求失败(' + res.statusCode + ')';
          if (res.data && res.data.error) {
            msg = String(res.data.error);
          }
          showError(msg);
          reject(new Error(msg));
        }
      },
      fail: function (err) {
        showError('无法连接服务器,请检查网络或「我的」页服务器地址');
        reject(err);
      }
    });
  });
}

module.exports = {
  // GET /api/today
  // → {task, startCard, weekProgress, hasGoal, weekFocus}
  getToday: function () {
    return request('/api/today', 'GET', {});
  },

  // POST /api/decompose {rawTask, mood?}
  // → {blocker, empathy, steps, startCard}
  decompose: function (rawTask, mood) {
    var data = { rawTask: rawTask };
    if (mood) {
      data.mood = mood;
    }
    return request('/api/decompose', 'POST', data);
  },

  // POST /api/checkins {taskId, mood?, granularity?}
  // → {ok, celebration, adjustments}
  checkin: function (taskId, mood, granularity) {
    var data = {};
    if (typeof taskId !== 'undefined' && taskId !== null) {
      data.taskId = taskId;
    }
    if (mood) {
      data.mood = mood;
    }
    if (granularity) {
      data.granularity = granularity;
    }
    return request('/api/checkins', 'POST', data);
  },

  // POST /api/park {text}
  // → {ok, count}
  park: function (text) {
    return request('/api/park', 'POST', { text: text });
  },

  // POST /api/chat {message}
  // → {agent: 'Coach'|'Spark'|'Pace'|'Mirror', reply}
  chat: function (message) {
    return request('/api/chat', 'POST', { message: message });
  },

  // POST /api/wechat/subscribe {code, templateId}
  // → {ok}(记录订阅授权,服务端据此可下发一次订阅消息)
  wechatSubscribe: function (code, templateId) {
    return request('/api/wechat/subscribe', 'POST', { code: code, templateId: templateId });
  }
};
