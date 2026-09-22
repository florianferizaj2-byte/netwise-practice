function todayLabel(date = new Date()) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · 星期${weekdays[date.getDay()]}`;
}

function messageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function errorMessage(error, fallback = '操作失败，请稍后重试') {
  return error && error.message ? error.message : fallback;
}

module.exports = { todayLabel, messageTime, errorMessage };
