const api = require('../../utils/api');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    phase: 'wechat',
    bindingToken: '',
    username: '',
    password: '',
    passwordConfirm: '',
    busy: false,
    error: '',
  },

  onLoad() {
    if (!getApp().globalData.sessionToken) return;
    api.restoreSession().then((response) => {
      if (response && response.user) this.finishAuth(response);
    }).catch(() => {
      // A stale or temporarily unreachable session leaves the login page usable.
    });
  },

  finishAuth(response) {
    getApp().setAuth(response);
    const target = response.user && response.user.certificateId
      ? '/pages/today/index'
      : '/pages/certificate/index';
    wx.redirectTo({ url: target });
  },

  clearError() {
    this.setData({ error: '' });
  },

  chooseWechat() {
    this.setData({ phase: 'wechat', error: '' });
  },

  choosePassword() {
    this.setData({ phase: 'password', error: '' });
  },

  handleInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  handleWechatLogin() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    api.callWechatLogin().then((response) => {
      if (response.needsBinding) {
        this.setData({
          phase: 'bind',
          bindingToken: response.bindingToken,
          busy: false,
          error: '',
        });
        return;
      }
      this.setData({ busy: false });
      this.finishAuth(response);
    }).catch((error) => {
      this.setData({ busy: false, error: errorMessage(error, '微信登录失败，请稍后重试') });
    });
  },

  handlePasswordLogin() {
    const { username, password } = this.data;
    if (!username.trim() || password.length < 8) {
      this.setData({ error: '请输入账号和至少 8 位密码' });
      return;
    }
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    api.passwordLogin(username.trim(), password).then((response) => {
      this.setData({ busy: false });
      this.finishAuth(response);
    }).catch((error) => {
      this.setData({ busy: false, error: errorMessage(error, '登录失败，请检查网络') });
    });
  },

  handleBind() {
    const { bindingToken, username, password } = this.data;
    if (!username.trim() || password.length < 8) {
      this.setData({ error: '请输入原考匠账号和至少 8 位密码' });
      return;
    }
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    api.bindWechat(bindingToken, username.trim(), password).then((response) => {
      this.setData({ busy: false });
      this.finishAuth(response);
    }).catch((error) => {
      this.setData({ busy: false, error: errorMessage(error, '绑定失败，请检查账号信息') });
    });
  },

  handleRegister() {
    const { bindingToken, username, password, passwordConfirm } = this.data;
    if (!username.trim() || password.length < 8) {
      this.setData({ error: '账号不能为空，密码至少 8 位' });
      return;
    }
    if (password !== passwordConfirm) {
      this.setData({ error: '两次输入的密码不一致' });
      return;
    }
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    api.registerWechat(bindingToken, username.trim(), password).then((response) => {
      this.setData({ busy: false });
      this.finishAuth(response);
    }).catch((error) => {
      this.setData({ busy: false, error: errorMessage(error, '注册失败，请稍后重试') });
    });
  },

  handleBindingSubmit() {
    if (this.data.phase === 'register') {
      this.handleRegister();
      return;
    }
    this.handleBind();
  },

  switchBindMode(event) {
    this.setData({ phase: event.currentTarget.dataset.mode, error: '' });
  },
});
