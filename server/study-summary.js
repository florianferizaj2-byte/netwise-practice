const studyDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
});

export function studySummary(attempts, wrong, now = new Date()) {
  const today = studyDay.format(now);
  const counts = new Map();
  let correct = 0;
  let todayTimeMs = 0;
  for (const attempt of attempts) {
    const date = studyDay.format(new Date(attempt.createdAt));
    counts.set(date, (counts.get(date) || 0) + 1);
    if (date === today) todayTimeMs += attempt.timeMs;
    if (attempt.correct) correct += 1;
  }
  const dateAt = (offset) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  let streakDays = 0;
  let offset = counts.has(today) ? 0 : -1;
  while (counts.has(dateAt(offset))) {
    streakDays += 1;
    offset -= 1;
  }
  return {
    todayCount: counts.get(today) || 0,
    totalCount: attempts.length,
    accuracy: attempts.length ? correct / attempts.length : null,
    minutes: Math.round(todayTimeMs / 60000),
    dueCount: wrong.filter(
      (question) => question.review?.dueAt <= now.toISOString(),
    ).length,
    wrongCount: wrong.length,
    streakDays,
    recentDays: Array.from({ length: 7 }, (_, i) => ({
      day: dateAt(i - 6),
      count: counts.get(dateAt(i - 6)) || 0,
    })),
  };
}
