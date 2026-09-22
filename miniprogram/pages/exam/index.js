Page({
  onShow() {
    if (!getApp().globalData.sessionToken) wx.redirectTo({ url: '/pages/auth/index' });
  },

  createExam() {
    wx.redirectTo({ url: '/pages/practice/index?mode=sequential' });
  },

  onTabChange(event) {
    wx.redirectTo({ url: `/pages/${event.detail.key}/index` });
  },
});
