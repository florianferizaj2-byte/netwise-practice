const api = require('../../utils/api');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    user: null,
    certificateName: '未选择',
    nickname: '',
    nicknameDraft: '',
    nicknameOpen: false,
    appearanceOpen: false,
    sponsorOpen: false,
    aiOpen: false,
    busy: false,
    error: '',
  },

  onShow() {
    const currentApp = getApp();
    if (!currentApp.globalData.sessionToken) {
      wx.redirectTo({ url: '/pages/auth/index' });
      return;
    }
    const user = currentApp.globalData.user;
    this.setData({
      user,
      nickname: user && (user.communityName || user.username) || '',
      certificateName: user && user.certificate && user.certificate.name || (user && user.certificateId) || '未选择',
    });
  },

  openCertificate() {
    wx.navigateTo({ url: '/pages/certificate/index?from=profile' });
  },

  openAppearance() {
    this.setData({ appearanceOpen: true });
  },

  closeAppearance() {
    this.setData({ appearanceOpen: false });
  },

  openSponsor() {
    this.setData({ sponsorOpen: true });
  },

  closeSponsor() {
    this.setData({ sponsorOpen: false });
  },

  noop() {},

  openNickname() {
    this.setData({ nicknameDraft: this.data.nickname, nicknameOpen: true, error: '' });
  },

  closeNickname() {
    if (!this.data.busy) this.setData({ nicknameOpen: false });
  },

  onNicknameInput(event) {
    this.setData({ nicknameDraft: event.detail.value.slice(0, 24), error: '' });
  },

  saveNickname() {
    const name = this.data.nicknameDraft.trim();
    if (!name) {
      this.setData({ error: '社区昵称不能为空' });
      return;
    }
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    api.updateCommunityProfile(name).then(() => {
      this.setData({ nickname: name, nicknameOpen: false, busy: false });
    }).catch((error) => {
      this.setData({ busy: false, error: errorMessage(error, '社区昵称保存失败') });
    });
  },

  showAi() {
    this.setData({ aiOpen: true });
  },

  closeAi() {
    this.setData({ aiOpen: false });
  },

  logout() {
    if (this.data.busy) return;
    wx.showModal({
      title: '退出登录',
      content: '退出后下次进入小程序仍可使用微信一键登录。',
      confirmColor: '#3AC096',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ busy: true });
        api.logout().catch(() => undefined).finally(() => {
          this.setData({ busy: false });
          wx.redirectTo({ url: '/pages/auth/index' });
        });
      },
    });
  },

  onTabChange(event) {
    wx.redirectTo({ url: `/pages/${event.detail.key}/index` });
  },
});
