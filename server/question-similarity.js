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

const MAX_SHINGLE_POSTING = 160;
const BLOCK_SHINGLE_COUNT = 8;
const MAX_CANDIDATES_PER_QUESTION = 400;

function questionFeatures(question) {
  const stem = shingles(question.question);
  const options = shingles(optionText(question));
  return {
    stem,
    options,
    block: new Set([...stem, ...options]),
    // Exact duplicates use a separate fast path. Their common shingles are
    // intentionally ignored by the approximate index below.
    exactKey: `${normalize(question.question)}\u0000${normalize(optionText(question))}`,
  };
}

function similarityFromFeatures(left, right) {
  const stemScore = jaccard(left.stem, right.stem);
  const optionScore = jaccard(left.options, right.options);
  const correctAnswerScore = answerScore(left.question, right.question);
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
  const byChapter = new Map();

  // Extract shingles once per question. The old implementation regenerated
  // both sets for every pair in an O(n²) loop.
  questions.forEach((question, index) => {
    const doc = {
      question,
      index,
      features: { ...questionFeatures(question), question },
      blockShingles: [],
    };
    const chapter = question.chapter || "";
    const bucket = byChapter.get(chapter) || [];
    bucket.push(doc);
    byChapter.set(chapter, bucket);
  });

  for (const docs of byChapter.values()) {
    if (docs.length < 2) continue;

    const documentFrequency = new Map();
    for (const doc of docs) {
      for (const shingle of doc.features.block) {
        documentFrequency.set(shingle, (documentFrequency.get(shingle) || 0) + 1);
      }
    }

    const postings = new Map();
    const exactGroups = new Map();
    for (const doc of docs) {
      const exactGroup = exactGroups.get(doc.features.exactKey) || [];
      exactGroup.push(doc);
      exactGroups.set(doc.features.exactKey, exactGroup);

      // Keep only a few rarest fragments. Common fragments such as “下列”
      // would otherwise create a huge candidate bucket.
      doc.blockShingles = Array.from(doc.features.block)
        .filter(
          (shingle) =>
            (documentFrequency.get(shingle) || 0) <= MAX_SHINGLE_POSTING,
        )
        .sort(
          (left, right) =>
            documentFrequency.get(left) - documentFrequency.get(right),
        )
        .slice(0, BLOCK_SHINGLE_COUNT);
      for (const shingle of doc.blockShingles) {
        const posting = postings.get(shingle) || [];
        posting.push(doc);
        postings.set(shingle, posting);
      }
    }

    const seenPairs = new Set();
    const compare = (left, right) => {
      const first = left.index < right.index ? left : right;
      const second = left.index < right.index ? right : left;
      const pairKey = `${first.index}:${second.index}`;
      if (seenPairs.has(pairKey)) return;
      seenPairs.add(pairKey);
      if (!sharesCertificate(first.question, second.question)) return;
      const score = similarityFromFeatures(first.features, second.features);
      if (score >= safeThreshold) {
        result.push({
          score,
          left: first.question,
          right: second.question,
        });
      }
    };

    // Exact duplicates get a deterministic fast path. For an unusually large
    // exact group, anchor and neighbour pairs are enough for the capped UI.
    for (const group of exactGroups.values()) {
      if (group.length < 2) continue;
      if (group.length <= 80) {
        for (let left = 0; left < group.length; left++) {
          for (let right = left + 1; right < group.length; right++) {
            compare(group[left], group[right]);
          }
        }
      } else {
        for (let i = 1; i < group.length; i++) {
          compare(group[0], group[i]);
          compare(group[i - 1], group[i]);
        }
      }
    }

    // Approximate blocking keeps candidate generation close to linear for a
    // large bank, while the original score remains the final decision.
    for (const doc of docs) {
      const candidates = new Set();
      for (const shingle of doc.blockShingles) {
        const posting = postings.get(shingle) || [];
        for (const candidate of posting) {
          if (candidate.index > doc.index) candidates.add(candidate);
          if (candidates.size >= MAX_CANDIDATES_PER_QUESTION) break;
        }
        if (candidates.size >= MAX_CANDIDATES_PER_QUESTION) break;
      }
      for (const candidate of candidates) compare(doc, candidate);
    }
  }

  return result
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit);
}
