const SESSION_TOKEN_KEY = 'kaojiang-miniprogram-session-token';

App({
  globalData: {
    apiBaseUrl: 'https://aceexam.top/api',
    sessionToken: '',
    user: null,
    certificates: [],
    dashboard: null,
  },

  onLaunch() {
    this.globalData.sessionToken = wx.getStorageSync(SESSION_TOKEN_KEY) || '';
  },

  setAuth(response) {
    this.globalData.sessionToken = response.sessionToken || '';
    this.globalData.user = response.user || null;
    this.globalData.certificates = response.certificates || [];
    if (this.globalData.sessionToken) {
      wx.setStorageSync(SESSION_TOKEN_KEY, this.globalData.sessionToken);
    }
  },

  updateUser(user) {
    this.globalData.user = user;
  },

  clearAuth() {
    this.globalData.sessionToken = '';
    this.globalData.user = null;
    this.globalData.certificates = [];
    this.globalData.dashboard = null;
    wx.removeStorageSync(SESSION_TOKEN_KEY);
  },
});
