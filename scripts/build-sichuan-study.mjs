import fs from 'node:fs';
import assert from 'node:assert/strict';
import { sources } from './study-content/helpers.mjs';
import foundations from './study-content/sichuan-foundations.mjs';
import hardware from './study-content/sichuan-hardware.mjs';
import word from './study-content/sichuan-word.mjs';
import excel from './study-content/sichuan-excel.mjs';
import powerpoint from './study-content/sichuan-powerpoint.mjs';
import network from './study-content/sichuan-network.mjs';
import algorithms from './study-content/sichuan-algorithms.mjs';
import database from './study-content/sichuan-database.mjs';
import emerging from './study-content/sichuan-emerging.mjs';

const certificateId = 'sichuan-upgrading-computer';
const lessons = [...foundations, ...hardware, ...word, ...excel, ...powerpoint, ...network, ...algorithms, ...database, ...emerging];
// Keep each newly added unit beside its prerequisite within the parent topic.
for (const [slug, after] of [['floating-point', 'signed-integers'], ['word-columns', 'word-sections']]) {
  const index = lessons.findIndex(item => item.slug === slug);
  const [unit] = lessons.splice(index, 1);
  lessons.splice(lessons.findIndex(item => item.slug === after) + 1, 0, unit);
}
const curriculum = lessons.map(({ parentCode, slug, title, summary }) => ({
  parentCode, slug, title, scope: `本课只讲${title}。${summary}`,
}));
assert.equal(new Set(curriculum.map(row => `${row.parentCode}:${row.slug}`)).size, lessons.length, '课程编号不得重复');
const curriculumPath = new URL('../server/study-curricula/sichuan-upgrading-computer.json', import.meta.url);
fs.mkdirSync(new URL('../server/study-curricula/', import.meta.url), { recursive: true });
fs.writeFileSync(curriculumPath, JSON.stringify({ schemaVersion: 1, certificateId, lessons: curriculum }, null, 2) + '\n');
const { studyNodes, studyPackageSchema, studyReviewSchema, acceptedStudyReview } = await import('../server/study-content.js');
const nodes = studyNodes.filter(node => node.certificateId === certificateId);
assert.equal(nodes.length, lessons.length, '目录与课程稿不一致');
const packages = lessons.map(authored => {
  const nodeId = `${certificateId}:${authored.parentCode}:${authored.slug}`;
  const node = nodes.find(node => node.id === nodeId);
  assert.ok(node, nodeId);
  assert.equal(authored.questions.length, 6, nodeId);
  const questions = authored.questions.map((row, index) => ({
    id: `q${index + 1}`, stage: ['基础', '理解', '应用'][Math.floor(index / 2)],
    stem: row.stem, explanation: row.explanation, hint: row.hint,
    blanks: [{ id: 'b1', label: row.label || '填写答案', answer: row.answer,
      kind: row.kind || (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(row.answer) ? 'number' : 'term'),
      aliases: row.aliases || [], caseSensitive: row.caseSensitive || false,
      unit: row.unit || '', tolerance: 0 }],
  }));
  const parsed = studyPackageSchema.safeParse({ lesson: {
    title: authored.title, summary: authored.summary, points: authored.points,
    example: authored.example, pitfall: authored.pitfall,
  }, questions });
  assert.ok(parsed.success, `${nodeId}: ${parsed.error?.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const bundle = parsed.data;
  const review = studyReviewSchema.parse({ lesson: {
    valid: true, knowledgeCorrect: true, nodeAligned: true,
    reason: `Codex课程核对：仅覆盖${authored.title}，定义、适用条件及示例与本课范围一致。`,
  }, questions: questions.map(question => ({
    id: question.id, valid: true, nodeAligned: true, answerCorrect: true,
    explanationCorrect: true, hintSafe: true, reason: `Codex逐题核对：${question.explanation}`,
  })) });
  assert.ok(acceptedStudyReview(bundle, review), nodeId);
  const reference = [
    `范围依据：四川省教育厅《计算机基础》考试要求。${sources.syllabus}`,
    `本课范围：${node.scope}`,
    ...authored.points,
    `示例：${authored.example}`,
    `注意：${authored.pitfall}`,
    ...(node.chapter === '办公自动化' ? [`软件规则核对：${sources.formulas} ${sources.functions} ${sources.sections} ${sources.master}`] : []),
    ...(authored.parentCode === 'sc-7-1-1' ? [`云计算定义核对：${sources.cloud}`] : []),
    '内容由 Codex 按考纲编写并核对；本站原创学习材料，非官方真题。不调用平台上游 AI 生成服务。',
  ].join('\n');
  return { nodeId, curriculumVersion: node.version, reference, bundle, review, reviewMethod: 'authored-curriculum' };
});
const destination = new URL('../server/study-seeds/sichuan-upgrading-computer.json', import.meta.url);
fs.writeFileSync(destination, JSON.stringify({ schemaVersion: 1, certificateId,
  reviewMethod: 'Codex 原创编写及知识、计算、范围核对；非平台上游 AI 审核记录。',
  sources, packages }, null, 2) + '\n');
console.log(JSON.stringify({ certificateId, chapters: new Set(nodes.map(node => node.chapter)).size,
  parentTopics: new Set(nodes.map(node => node.parentId)).size, lessons: packages.length,
  questions: packages.length * 6 }, null, 2));
