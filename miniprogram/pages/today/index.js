const api = require('../../utils/api');
const { errorMessage, todayLabel } = require('../../utils/format');

Page({
  data: {
    loading: true,
    error: '',
    dateLabel: todayLabel(),
    todayCount: 0,
    wrongCount: 0,
    progress: 0,
    streak: '0 天',
    accuracyText: '—',
    headline: '从一组练习开始',
    subline: '还差 30 道题完成今日目标',
    startLabel: '开始今日学习',
    certificateName: '',
  },

  onShow() {
    if (!getApp().globalData.sessionToken) {
      wx.redirectTo({ url: '/pages/auth/index' });
      return;
    }
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard(true);
  },

  loadDashboard(stopRefresh = false) {
    this.setData({ loading: true, error: '' });
    api.dashboard().then((dashboard) => {
      const todayCount = dashboard.todayCount || 0;
      const target = 30;
      const progress = Math.min(100, Math.round((todayCount / target) * 100));
      const streak = (dashboard.recentDays || []).filter((item) => item.count > 0).length;
      const accuracyText = dashboard.accuracy == null
        ? '—'
        : `${Math.round(dashboard.accuracy * 100)}%`;
      this.setData({
        loading: false,
        todayCount,
        wrongCount: dashboard.wrongCount || 0,
        progress,
        streak: `${streak} 天`,
        accuracyText,
        headline: todayCount >= target ? '今日目标完成' : (todayCount ? '继续保持节奏' : '从一组练习开始'),
        subline: todayCount >= target ? '很棒，明天继续保持。' : `还差 ${Math.max(0, target - todayCount)} 道题完成今日目标`,
        startLabel: todayCount ? '继续今日学习' : '开始今日学习',
        certificateName: (dashboard.certificate && dashboard.certificate.name)
          || (getApp().globalData.user && getApp().globalData.user.certificate && getApp().globalData.user.certificate.name)
          || '',
      });
      getApp().globalData.dashboard = dashboard;
    }).catch((error) => {
      this.setData({ loading: false, error: errorMessage(error, '首页数据加载失败，请稍后重试') });
    }).finally(() => {
      if (stopRefresh) wx.stopPullDownRefresh();
    });
  },

  startToday() {
    wx.redirectTo({ url: '/pages/practice/index?session=daily&mode=random' });
  },

  openWrong() {
    wx.redirectTo({ url: '/pages/wrong/index' });
  },

  onTabChange(event) {
    const key = event.detail.key;
    wx.redirectTo({ url: `/pages/${key}/index` });
  },
});
