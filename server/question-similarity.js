function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[\s\u3000，。？?！!、：:；;（）()【】[\]“”‘’《》<>「」,.!?;:'"`~·…—_\-]/g, "");
}

function shingles(value) {
  const text = normalize(value);
  if (!text) return new Set();
  if (text.length === 1) return new Set([text]);
  return new Set(Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2)));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

function optionText(question) {
  return Object.entries(question.options || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join("");
}

function answerScore(left, right) {
  const leftAnswers = new Set(left.answer || []);
  const rightAnswers = new Set(right.answer || []);
  const union = new Set([...leftAnswers, ...rightAnswers]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const answer of leftAnswers) if (rightAnswers.has(answer)) intersection++;
  return intersection / union.size;
}

export function questionSimilarity(left, right) {
  if (!left || !right) return 0;
  const stemScore = jaccard(shingles(left.question), shingles(right.question));
  const optionScore = jaccard(
    shingles(optionText(left)),
    shingles(optionText(right)),
  );
  const correctAnswerScore = answerScore(left, right);
  return Math.round(
    (stemScore * 0.6 + optionScore * 0.3 + correctAnswerScore * 0.1) * 1000,
  ) / 1000;
}

function sharesCertificate(left, right) {
  const a = left.certificates || [];
  const b = new Set(right.certificates || []);
  return !a.length || !b.size || a.some((id) => b.has(id));
}

export function findSimilarQuestions(
  questions,
  { threshold = 0.78, limit = 200 } = {},
) {
  const result = [];
  const safeThreshold = Math.max(0.5, Math.min(0.99, Number(threshold) || 0.78));
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  for (let i = 0; i < questions.length; i++) {
    const left = questions[i];
    for (let j = i + 1; j < questions.length; j++) {
      const right = questions[j];
      if (left.chapter !== right.chapter || !sharesCertificate(left, right))
        continue;
      const score = questionSimilarity(left, right);
      if (score >= safeThreshold)
        result.push({ score, left, right });
    }
  }
  return result
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit);
}
