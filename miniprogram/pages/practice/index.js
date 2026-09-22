const api = require('../../utils/api');
const { errorMessage } = require('../../utils/format');

function shuffled(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

Page({
  data: {
    mode: 'sequential',
    session: 'standard',
    source: 'all',
    sourceLabel: '题库练习',
    modeLabel: '顺序刷题',
    questions: [],
    questionIndex: 0,
    question: null,
    optionEntries: [],
    selected: [],
    result: null,
    loading: true,
    submitting: false,
    finished: false,
    error: '',
    aiBusy: false,
    aiText: '',
    startedAt: 0,
  },

  onLoad(options) {
    if (!getApp().globalData.sessionToken) {
      wx.redirectTo({ url: '/pages/auth/index' });
      return;
    }
    const session = options.session === 'daily' ? 'daily' : 'standard';
    const source = options.source === 'wrong' ? 'wrong' : 'all';
    const mode = options.mode === 'random' ? 'random' : 'sequential';
    this.setData({
      session,
      source,
      mode,
      sourceLabel: session === 'daily' ? '今日练习' : (source === 'wrong' ? '错题复习' : '题库练习'),
      modeLabel: mode === 'random' ? '随机刷题' : '顺序刷题',
    });
    this.loadQuestions();
  },

  loadQuestions() {
    this.setData({ loading: true, error: '', finished: false, result: null, selected: [], aiText: '' });
    const count = this.data.session === 'daily' ? 30 : (this.data.mode === 'random' ? 10 : 10);
    const loader = this.data.source === 'wrong'
      ? api.wrong()
      : api.questions(count, 0, this.data.session === 'daily' || this.data.mode === 'random');
    loader.then((items) => {
      let questions = items || [];
      if (this.data.session === 'daily') questions = shuffled(questions).slice(0, 30);
      if (this.data.mode === 'random' && this.data.session !== 'daily') questions = shuffled(questions);
      this.setData({ questions, loading: false, questionIndex: 0 });
      if (questions.length) this.setQuestion(0);
    }).catch((error) => {
      this.setData({ loading: false, error: errorMessage(error, '题目加载失败，请稍后重试') });
    });
  },

  setQuestion(index) {
    const question = this.data.questions[index];
    if (!question) return;
    this.setData({
      questionIndex: index,
      question,
      optionEntries: this.buildOptions(question, [], null),
      selected: [],
      result: null,
      aiText: '',
      error: '',
      startedAt: Date.now(),
    });
  },

  buildOptions(question, selected, result) {
    const answer = result && result.answer ? result.answer : [];
    return Object.keys(question.options || {}).map((key) => ({
      key,
      label: question.options[key],
      selected: selected.includes(key),
      correct: answer.includes(key),
      wrong: !!result && selected.includes(key) && !answer.includes(key),
    }));
  },

  toggleOption(event) {
    if (this.data.result || this.data.submitting) return;
    const key = event.currentTarget.dataset.key;
    let selected;
    if (this.data.question.type === 'multiple_choice') {
      selected = this.data.selected.includes(key)
        ? this.data.selected.filter((item) => item !== key)
        : [...this.data.selected, key].sort();
    } else {
      selected = [key];
    }
    this.setData({ selected, optionEntries: this.buildOptions(this.data.question, selected, null), error: '' });
  },

  submitAnswer() {
    if (!this.data.question || this.data.result || this.data.submitting) return;
    if (!this.data.selected.length) {
      this.setData({ error: '先选择一个答案' });
      return;
    }
    this.setData({ submitting: true, error: '' });
    const timeMs = Math.min(86400000, Math.max(0, Date.now() - this.data.startedAt));
    api.recordAttempt(this.data.question.id, this.data.selected, timeMs).then((result) => {
      this.setData({
        result,
        submitting: false,
        optionEntries: this.buildOptions(this.data.question, this.data.selected, result),
      });
    }).catch((error) => {
      this.setData({ submitting: false, error: errorMessage(error, '提交失败，请检查网络后重试') });
    });
  },

  nextQuestion() {
    if (this.data.questionIndex >= this.data.questions.length - 1) {
      this.setData({ finished: true });
      return;
    }
    this.setQuestion(this.data.questionIndex + 1);
  },

  askAi() {
    if (!this.data.question || this.data.aiBusy) return;
    this.setData({ aiBusy: true, aiText: '' });
    api.request('/ai/teacher', {
      method: 'POST',
      data: {
        questionId: this.data.question.id,
        action: '详细讲解',
        selected: this.data.selected,
        hintLevel: 0,
      },
    }).then((response) => {
      this.setData({ aiBusy: false, aiText: response.text || 'AI 暂时没有返回讲解。' });
    }).catch((error) => {
      this.setData({ aiBusy: false, aiText: errorMessage(error, 'AI 服务暂时不可用，请先在“我的”中配置。') });
    });
  },

  changeMode(event) {
    if (this.data.session === 'daily' || this.data.loading) return;
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode, modeLabel: mode === 'random' ? '随机刷题' : '顺序刷题' });
    this.loadQuestions();
  },

  restart() {
    this.loadQuestions();
  },

  goToday() {
    wx.redirectTo({ url: '/pages/today/index' });
  },

  onTabChange(event) {
    wx.redirectTo({ url: `/pages/${event.detail.key}/index` });
  },
});
