import fs from 'node:fs';
import { studyNodes, studyPackageSchema, studyReviewSchema } from '../../server/study-content.js';
import { correctHomeBlueLesson } from '../../server/demo-tutor/curriculum-corrections.js';

// Derive test snapshots from the versioned, reviewed server seeds. Never make
// private answer-bearing demo snapshots a required public runtime asset.
export function reviewedTutorSnapshot() {
  const seed = JSON.parse(fs.readFileSync(new URL('../../server/study-seeds/network-engineer.json', import.meta.url), 'utf8'));
  const packages = new Map(seed.packages.map(item => [item.nodeId, item]));
  return { lessons: studyNodes.filter(node => node.certificateId === 'network-engineer').map(node => {
    const record = packages.get(node.id);
    if (!record || record.curriculumVersion !== node.version) throw new Error('Stale test curriculum: ' + node.id);
    const bundle = studyPackageSchema.parse(record.bundle);
    const review = studyReviewSchema.parse(record.review);
    if (!review.lesson.valid || !review.lesson.knowledgeCorrect || !review.lesson.nodeAligned ||
        review.questions.some(item => !item.valid || !item.nodeAligned || !item.answerCorrect || !item.explanationCorrect || !item.hintSafe) ||
        bundle.questions.some(item => !review.questions.some(checked => checked.id === item.id)))
      throw new Error('Unreviewed test curriculum: ' + node.id);
    return correctHomeBlueLesson({ id: node.id, version: node.version, order: node.order,
      chapter: node.chapter, section: node.section, name: node.sublesson?.title || node.name,
      parent: node.parentName, unit: node.sublesson, lesson: bundle.lesson, questions: bundle.questions });
  }) };
}
