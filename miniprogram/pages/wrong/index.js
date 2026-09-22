const api = require('../../utils/api');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    loading: true,
    error: '',
    questions: [],
    wrongCount: 0,
  },

  onShow() {
    if (!getApp().globalData.sessionToken) {
      wx.redirectTo({ url: '/pages/auth/index' });
      return;
    }
    this.loadWrong();
  },

  loadWrong() {
    this.setData({ loading: true, error: '' });
    Promise.all([
      api.wrong(),
      api.dashboard().catch(() => null),
    ]).then(([questions, dashboard]) => {
      const wrongCount = dashboard && dashboard.wrongCount != null
        ? dashboard.wrongCount
        : (questions || []).length;
      this.setData({
        loading: false,
        questions: (questions || []).slice(0, 8),
        wrongCount,
      });
    }).catch((error) => {
      this.setData({ loading: false, error: errorMessage(error, '错题加载失败，请稍后重试') });
    });
  },

  startReview() {
    wx.redirectTo({ url: '/pages/practice/index?source=wrong&mode=sequential' });
  },

  onTabChange(event) {
    wx.redirectTo({ url: `/pages/${event.detail.key}/index` });
  },
});
