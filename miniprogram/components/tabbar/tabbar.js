Component({
  properties: {
    current: {
      type: String,
      value: 'today',
    },
  },

  data: {
    items: [
      { key: 'today', label: '今日', icon: '⌂' },
      { key: 'practice', label: '练习', icon: '✦' },
      { key: 'wrong', label: '错题', icon: '×' },
      { key: 'exam', label: '考试', icon: '□' },
      { key: 'community', label: '社区', icon: '◉' },
      { key: 'profile', label: '我的', icon: '◎' },
    ],
  },

  methods: {
    onTap(event) {
      const key = event.currentTarget.dataset.key;
      if (key && key !== this.data.current) this.triggerEvent('change', { key });
    },
  },
});
