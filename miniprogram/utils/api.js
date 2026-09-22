function app() {
  return getApp();
}

function request(path, options = {}) {
  const currentApp = app();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Client': 'miniprogram',
    ...(currentApp.globalData.sessionToken
      ? { Authorization: `Bearer ${currentApp.globalData.sessionToken}` }
      : {}),
    ...(options.header || {}),
  };

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${currentApp.globalData.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: headers,
      timeout: 15000,
      success(response) {
        const payload = response.data;
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(payload);
          return;
        }
        const message = payload && payload.error
          ? payload.error
          : `请求失败（${response.statusCode}）`;
        reject({ statusCode: response.statusCode, message, data: payload });
      },
      fail(error) {
        reject({ statusCode: 0, message: error.errMsg || '网络连接失败', data: error });
      },
    });
  });
}

function callWechatLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(response) {
        if (!response.code) {
          reject({ message: '没有获取到微信登录凭证' });
          return;
        }
        request('/auth/wechat/mini-login', {
          method: 'POST',
          data: { code: response.code },
        }).then(resolve).catch(reject);
      },
      fail(error) {
        reject({ message: error.errMsg || '微信登录失败' });
      },
    });
  });
}

function completeAuth(response) {
  app().setAuth(response);
  return response;
}

function bindWechat(bindingToken, username, password) {
  return request('/auth/wechat/bind', {
    method: 'POST',
    data: { bindingToken, username, password },
  }).then(completeAuth);
}

function registerWechat(bindingToken, username, password) {
  return request('/auth/wechat/register', {
    method: 'POST',
    data: { bindingToken, username, password },
  }).then(completeAuth);
}

function passwordLogin(username, password) {
  return request('/auth/login', {
    method: 'POST',
    data: { username, password },
  }).then(completeAuth);
}

function restoreSession() {
  if (!app().globalData.sessionToken) return Promise.resolve(null);
  return request('/auth/me').then((response) => {
    if (!response.authenticated || !response.user) {
      app().clearAuth();
      return null;
    }
    app().globalData.user = response.user;
    app().globalData.certificates = response.certificates || [];
    return response;
  }).catch((error) => {
    if (error.statusCode === 401 || error.statusCode === 403) app().clearAuth();
    throw error;
  });
}

function logout() {
  return request('/auth/logout', { method: 'POST' }).finally(() => app().clearAuth());
}

function dashboard() {
  return request('/dashboard');
}

function questions(limit = 10, offset = 0, random = false) {
  const params = [`limit=${limit}`, `offset=${offset}`];
  if (random) params.push('random=1');
  return request(`/questions?${params.join('&')}`);
}

function wrong() {
  return request('/wrong');
}

function recordAttempt(questionId, selected, timeMs) {
  return request('/attempts', {
    method: 'POST',
    data: { questionId, selected, timeMs },
  });
}

function selectCertificate(certificateId) {
  return request('/auth/certificate', {
    method: 'PUT',
    data: { certificateId },
  }).then((response) => {
    app().updateUser(response.user);
    return response;
  });
}

function communityMessages(before, limit = 50) {
  const params = [`limit=${limit}`];
  if (before) params.push(`before=${encodeURIComponent(before)}`);
  return request(`/community/messages?${params.join('&')}`);
}

function sendCommunityMessage(text) {
  return request('/community/messages', {
    method: 'POST',
    data: { text },
  });
}

function updateCommunityProfile(name) {
  return request('/community/profile', {
    method: 'PUT',
    data: { name },
  }).then((response) => {
    app().updateUser(response.user);
    return response;
  });
}

module.exports = {
  request,
  callWechatLogin,
  bindWechat,
  registerWechat,
  passwordLogin,
  restoreSession,
  logout,
  dashboard,
  questions,
  wrong,
  recordAttempt,
  selectCertificate,
  communityMessages,
  sendCommunityMessage,
  updateCommunityProfile,
};
