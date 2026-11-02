const api = require('../../utils/api');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    phase: 'wechat',
    bindingToken: '',
    username: '',
    password: '',
    passwordConfirm: '',
    email: '', emailCode: '', challengeId: '', codeSending: false, codeWait: 0, notice: '',
    emailVerificationRequired: false, emailPolicyReady: false, emailPolicyError: '',
    busy: false,
    error: '',
  },

  onLoad() {
    this.loadEmailPolicy();
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

  async loadEmailPolicy() {
    this.setData({ emailPolicyReady: false, emailPolicyError: '' });
    try {
      const policy = await api.request('/auth/security-config');
      if (typeof policy.emailVerificationRequired !== 'boolean') throw new Error('注册设置读取失败');
      this.setData({ emailVerificationRequired: policy.emailVerificationRequired, emailPolicyReady: true });
    } catch (error) { this.setData({ emailPolicyError: errorMessage(error, '注册设置读取失败') }); }
  },

  chooseWechat() {
    this.setData({ phase: 'wechat', error: '' });
  },

  choosePassword() {
    this.setData({ phase: 'password', error: '' });
  },

  handleInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value, ...(['username', 'email'].includes(field) ? { challengeId: '', emailCode: '' } : {}) });
  },

  onUnload() { clearInterval(this._codeTimer); },

  chooseRecovery() { this.setData({ phase: 'reset', password: '', passwordConfirm: '', emailCode: '', challengeId: '', error: '', notice: '' }); },

  async sendEmailCode() {
    if (!this.data.emailVerificationRequired || this.data.codeSending || this.data.codeWait || this.data.busy) return;
    const { email, username, phase } = this.data;
    if (!email.trim() || !username.trim()) { this.setData({ error: '请先填写账号和邮箱' }); return; }
    this.setData({ codeSending: true, error: '', notice: '' });
    const scope = `${phase}:${username}:${email}`;
    try {
      const result = await api.request('/auth/email-code', { method: 'POST', data: { email: email.trim(), username: username.trim(), purpose: phase === 'reset' ? 'reset' : 'register' } });
      if (scope !== `${this.data.phase}:${this.data.username}:${this.data.email}`) return;
      this.setData({ challengeId: result.challengeId, codeWait: result.retryAfter, notice: result.message });
      clearInterval(this._codeTimer);
      this._codeTimer = setInterval(() => { this.setData({ codeWait: Math.max(0, this.data.codeWait - 1) }); if (!this.data.codeWait) clearInterval(this._codeTimer); }, 1000);
    } catch (error) { this.setData({ error: errorMessage(error, '验证码发送失败') }); }
    finally { this.setData({ codeSending: false }); }
  },

  async handleReset() {
    if (!this.data.emailVerificationRequired) { this.setData({ error: '邮箱找回暂未启用' }); return; }
    if (this.data.busy || this.data.codeSending) return;
    const { username, password, passwordConfirm, email, emailCode, challengeId } = this.data;
    if (password.length < 8 || password !== passwordConfirm) { this.setData({ error: '密码至少 8 位，两次输入须一致' }); return; }
    if (!challengeId || !/^\d{6}$/.test(emailCode)) { this.setData({ error: '请获取并填写 6 位邮箱验证码' }); return; }
    this.setData({ busy: true, error: '' });
    try {
      await api.request('/auth/reset-password', { method: 'POST', data: { username: username.trim(), password, email: email.trim(), code: emailCode, challengeId } });
      this.setData({ phase: 'password', password: '', passwordConfirm: '', challengeId: '', emailCode: '', notice: '密码已重置，请使用新密码登录' });
    } catch (error) { this.setData({ error: errorMessage(error, '密码重置失败') }); }
    finally { this.setData({ busy: false }); }
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
    if (!this.data.emailPolicyReady) { this.setData({ error: '请先重新读取注册设置' }); return; }
    const { bindingToken, username, password, passwordConfirm, email, emailCode, challengeId } = this.data;
    if (!username.trim() || password.length < 8) {
      this.setData({ error: '账号不能为空，密码至少 8 位' });
      return;
    }
    if (password !== passwordConfirm) {
      this.setData({ error: '两次输入的密码不一致' });
      return;
    }
    if (this.data.busy || this.data.codeSending) return;
    if (this.data.emailVerificationRequired && (!challengeId || !/^\d{6}$/.test(emailCode))) { this.setData({ error: '请获取并填写 6 位邮箱验证码' }); return; }
    this.setData({ busy: true, error: '' });
    api.registerWechat(bindingToken, username.trim(), password, this.data.emailVerificationRequired ? { email: email.trim(), code: emailCode, challengeId } : undefined).then((response) => {
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
    this.setData({ phase: event.currentTarget.dataset.mode, error: '', challengeId: '', emailCode: '' });
  },
});
