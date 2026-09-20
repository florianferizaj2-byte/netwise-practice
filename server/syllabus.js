import crypto from "node:crypto";

const shuffle = (items, randomInt) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const selected = randomInt(index + 1);
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
};

export function buildSyllabusProgress(questions, attempts, syllabus) {
  if (!syllabus) return null;
  const modules = [...syllabus.modules]
    .sort((a, b) => a.order - b.order)
    .map((module) => {
      const moduleQuestions = questions.filter(
        (question) => question.chapter === module.name,
      );
      const ids = new Set(moduleQuestions.map((question) => question.id));
      const moduleAttempts = attempts.filter((attempt) =>
        ids.has(attempt.questionId),
      );
      const total = moduleQuestions.length;
      return {
        ...module,
        total,
        attempted: new Set(moduleAttempts.map((attempt) => attempt.questionId))
          .size,
        accuracy: moduleAttempts.length
          ? moduleAttempts.filter((attempt) => attempt.correct).length /
            moduleAttempts.length
          : null,
        coverage: Math.min(1, total / module.targetQuestionCount),
      };
    });
  const targetQuestionCount = modules.reduce(
    (sum, module) => sum + module.targetQuestionCount,
    0,
  );
  const coveredQuestionCount = modules.reduce(
    (sum, module) => sum + Math.min(module.total, module.targetQuestionCount),
    0,
  );
  return {
    ...syllabus,
    modules,
    questionCount: questions.length,
    targetQuestionCount,
    coveredQuestionCount,
    coverage: targetQuestionCount
      ? coveredQuestionCount / targetQuestionCount
      : 0,
    coveredModules: modules.filter((module) => module.total > 0).length,
    completeModules: modules.filter((module) => module.coverage >= 1).length,
  };
}

export function stratifiedSample(
  questions,
  syllabus,
  requestedCount,
  randomInt = (max) => crypto.randomInt(max),
) {
  const count = Math.min(requestedCount, questions.length);
  if (!syllabus?.modules?.length)
    return shuffle(questions, randomInt).slice(0, count);

  const groups = syllabus.modules
    .map((module) => ({
      module,
      questions: questions.filter(
        (question) => question.chapter === module.name,
      ),
      selected: 0,
      ideal: (count * module.weight) / 100,
    }))
    .filter((group) => group.questions.length);

  while (groups.reduce((sum, group) => sum + group.selected, 0) < count) {
    const available = groups.filter(
      (group) => group.selected < group.questions.length,
    );
    if (!available.length) break;
    available.sort(
      (a, b) =>
        b.ideal - b.selected - (a.ideal - a.selected) ||
        b.module.weight - a.module.weight ||
        a.module.order - b.module.order,
    );
    available[0].selected++;
  }

  return shuffle(
    groups.flatMap((group) =>
      shuffle(group.questions, randomInt).slice(0, group.selected),
    ),
    randomInt,
  );
}

export function sampleExamQuestions(
  questions,
  syllabus,
  requestedCount,
  randomInt = (max) => crypto.randomInt(max),
) {
  const blueprint = syllabus?.examBlueprint;
  if (!blueprint?.questionsPerModule) {
    return stratifiedSample(questions, syllabus, requestedCount, randomInt);
  }

  const modules = [...(syllabus.modules || [])].sort(
    (a, b) => a.order - b.order,
  );
  const expectedCount =
    blueprint.questionCount || modules.length * blueprint.questionsPerModule;
  if (requestedCount !== expectedCount) {
    throw new Error(`本场模拟考试必须包含 ${expectedCount} 道题`);
  }

  const groups = modules.map((module) => ({
    module,
    questions: questions.filter(
      (question) => question.chapter === module.name,
    ),
  }));
  const missing = groups.find(
    (group) => group.questions.length < blueprint.questionsPerModule,
  );
  if (missing) {
    throw new Error(
      `${missing.module.name} 题库不足 ${blueprint.questionsPerModule} 道，暂时无法组卷`,
    );
  }

  return shuffle(
    groups.flatMap((group) =>
      shuffle(group.questions, randomInt).slice(
        0,
        blueprint.questionsPerModule,
      ),
    ),
    randomInt,
  );
}
