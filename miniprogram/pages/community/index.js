const api = require('../../utils/api');
const { errorMessage, messageTime } = require('../../utils/format');

const quickEmojis = ['😀', '🤝', '🎉', '💪', '❤️', '😂'];

Page({
  data: {
    messages: [],
    loading: true,
    sending: false,
    draft: '',
    error: '',
    quickEmojis,
    scrollIntoView: '',
  },

  onShow() {
    if (!getApp().globalData.sessionToken) {
      wx.redirectTo({ url: '/pages/auth/index' });
      return;
    }
    this.loadMessages();
    this.refreshTimer = setInterval(() => this.loadMessages(true), 10000);
  },

  onHide() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  },

  loadMessages(silent = false) {
    if (!silent) this.setData({ loading: true, error: '' });
    api.communityMessages().then((result) => {
      const userId = getApp().globalData.user && getApp().globalData.user.id;
      const messages = (result.messages || []).map((message) => ({
        ...message,
        own: message.userId === userId,
        timeLabel: messageTime(message.createdAt),
      }));
      this.setData({
        messages,
        loading: false,
        scrollIntoView: messages.length ? `message-${messages[messages.length - 1].id}` : '',
      });
    }).catch((error) => {
      if (!silent) this.setData({ loading: false, error: errorMessage(error, '社区加载失败，请稍后重试') });
    });
  },

  onDraftInput(event) {
    this.setData({ draft: event.detail.value.slice(0, 2000), error: '' });
  },

  addEmoji(event) {
    if (this.data.sending) return;
    this.setData({ draft: `${this.data.draft}${event.currentTarget.dataset.emoji}`.slice(0, 2000) });
  },

  sendMessage() {
    const text = this.data.draft.trim();
    if (!text || this.data.sending) {
      if (!text) this.setData({ error: '先输入文字、Emoji 或选择一条消息' });
      return;
    }
    this.setData({ sending: true, error: '' });
    api.sendCommunityMessage(text).then((result) => {
      const message = result.message;
      const userId = getApp().globalData.user && getApp().globalData.user.id;
      const next = [...this.data.messages, {
        ...message,
        own: message.userId === userId,
        timeLabel: messageTime(message.createdAt),
      }];
      this.setData({ messages: next, draft: '', sending: false, scrollIntoView: `message-${message.id}` });
    }).catch((error) => {
      this.setData({ sending: false, error: errorMessage(error, '消息发送失败，请稍后重试') });
    });
  },

  onConfirm() {
    this.sendMessage();
  },

  onTabChange(event) {
    wx.redirectTo({ url: `/pages/${event.detail.key}/index` });
  },
});
