const api = require('../../utils/api');
const { errorMessage } = require('../../utils/format');
const { copyPurchaseLink } = require('../../utils/membership-purchase');
const membershipLabels = { free: 'Free', vip: 'VIP', svip: 'SVIP', ssvip: 'SSVIP' };

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
    membershipLabel: '正在读取',
    membershipExpiresAt: '',
    membershipError: '',
    redeemOpen: false,
    redeemCode: '',
    redeemError: '',
    redeemNotice: '',
  },

  onShow() {
    this._visible = true;
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
    this.refreshMembership();
  },

  onHide() { this._visible = false; this._membershipRevision = (this._membershipRevision || 0) + 1; },
  onUnload() { this._destroyed = true; this.onHide(); },

  setMembership(account) {
    this.setData({ membershipLabel: membershipLabels[account.plan] || 'Free',
      membershipExpiresAt: account.plan !== 'free' && account.expiresAt
        ? account.expiresAt.slice(0, 10) : '', membershipError: '' });
  },

  refreshMembership() {
    const revision = this._membershipRevision = (this._membershipRevision || 0) + 1;
    return api.accountEntitlements().then((account) => {
      if (this._visible && revision === this._membershipRevision) this.setMembership(account);
    }).catch((error) => {
      if (this._visible && revision === this._membershipRevision)
        this.setData({ membershipLabel: '暂未同步', membershipError: errorMessage(error, '会员信息暂时无法读取，请稍后重试') });
    });
  },

  buyMembership() { copyPurchaseLink(); },
  openRedemption() { this.setData({ redeemOpen: true, redeemError: '', redeemNotice: '' }); },
  closeRedemption() { if (!this.data.busy) this.setData({ redeemOpen: false }); },
  onRedeemInput(event) { this.setData({ redeemCode: event.detail.value.slice(0, 80), redeemError: '' }); },
  redeemMembership() {
    if (this.data.busy) return;
    const code = this.data.redeemCode.trim();
    if (!code) { this.setData({ redeemError: '请先输入兑换码。' }); return; }
    this._membershipRevision = (this._membershipRevision || 0) + 1;
    this.setData({ busy: true, redeemError: '' });
    return api.redeemMembership(code).then((result) => {
      if (!this._visible) return;
      this.setMembership(result.entitlements);
      this.setData({ redeemOpen: false, redeemCode: '', redeemNotice: result.alreadyRedeemed
        ? '这张兑换码已兑换到你的账号。' : `${membershipLabels[result.redemption.plan]} 兑换成功，会员权益已到账。` });
    }).catch((error) => {
      if (this._visible) this.setData({ redeemError: errorMessage(error, '兑换失败，请检查兑换码后重试。') });
    }).finally(() => { if (!this._destroyed) this.setData({ busy: false }); });
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
