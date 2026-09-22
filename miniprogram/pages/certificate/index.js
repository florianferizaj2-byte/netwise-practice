const api = require('../../utils/api');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    certificates: [],
    currentId: '',
    busy: false,
    error: '',
    fromProfile: false,
  },

  onLoad(options) {
    const currentApp = getApp();
    this.setData({
      certificates: currentApp.globalData.certificates || [],
      currentId: currentApp.globalData.user && currentApp.globalData.user.certificateId || '',
      fromProfile: options.from === 'profile',
    });
  },

  choose(event) {
    if (this.data.busy) return;
    this.setData({ currentId: event.currentTarget.dataset.id, error: '' });
  },

  confirm() {
    if (!this.data.currentId || this.data.busy) {
      this.setData({ error: '请选择一个证书' });
      return;
    }
    this.setData({ busy: true, error: '' });
    api.selectCertificate(this.data.currentId).then(() => {
      this.setData({ busy: false });
      wx.redirectTo({ url: '/pages/today/index' });
    }).catch((error) => {
      this.setData({ busy: false, error: errorMessage(error, '证书选择失败，请检查服务器连接') });
    });
  },

  cancel() {
    wx.navigateBack();
  },
});
