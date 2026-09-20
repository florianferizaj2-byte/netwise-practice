import crypto from "node:crypto";

const shuffle = (items, randomInt) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const selected = randomInt(index + 1);
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
};

function questionUnits(questions) {
  const units = [];
  const grouped = new Map();
  for (const question of questions) {
    if (!question.sharedGroupId) {
      units.push([question]);
      continue;
    }
    if (!grouped.has(question.sharedGroupId)) {
      const unit = [];
      grouped.set(question.sharedGroupId, unit);
      units.push(unit);
    }
    grouped.get(question.sharedGroupId).push(question);
  }
  return units;
}

function selectUnitsExactly(units, count, randomInt) {
  if (!count) return [];
  const shuffled = shuffle(units, randomInt);
  const reachable = Array(count + 1).fill(null);
  reachable[0] = [];
  for (const unit of shuffled) {
    if (unit.length > count) continue;
    for (let total = count - unit.length; total >= 0; total--) {
      if (reachable[total] === null || reachable[total + unit.length] !== null)
        continue;
      reachable[total + unit.length] = [
        ...reachable[total],
        unit,
      ];
    }
    if (reachable[count] !== null) break;
  }
  if (reachable[count] === null) return null;
  return reachable[count];
}

function selectWholeUnitsNear(units, count, randomInt) {
  const target = Math.min(count, units.reduce((sum, unit) => sum + unit.length, 0));
  if (!target) return [];
  const shuffled = shuffle(units, randomInt);
  const reachable = Array(target + 1).fill(null);
  reachable[0] = [];
  for (const unit of shuffled) {
    if (unit.length > target) continue;
    for (let total = target - unit.length; total >= 0; total--) {
      if (reachable[total] === null || reachable[total + unit.length] !== null)
        continue;
      reachable[total + unit.length] = [...reachable[total], unit];
    }
  }
  for (let total = target; total > 0; total--)
    if (reachable[total] !== null) return reachable[total];
  return [shuffled.reduce((smallest, unit) =>
    unit.length < smallest.length ? unit : smallest,
  )];
}

function sampleQuestionUnits(questions, count, randomInt, strict = false) {
  const units = questionUnits(questions);
  const selected = selectUnitsExactly(units, count, randomInt);
  if (selected) return shuffle(selected, randomInt).flat();
  if (strict)
    throw new Error("共享题组无法完整纳入本场试卷，请稍后重新组卷");
  // A practice set may not hit an exact subset-sum target. Keep a whole case
  // together even if that makes the set slightly shorter or longer.
  return shuffle(selectWholeUnitsNear(units, count, randomInt), randomInt).flat();
}

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

  const selectedUnits = groups.flatMap((group) => {
    const picked = sampleQuestionUnits(
      group.questions,
      group.selected,
      randomInt,
    );
    return questionUnits(picked);
  });
  return shuffle(selectedUnits, randomInt).flat();
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

  const selectedUnits = groups.flatMap((group) =>
    questionUnits(
      sampleQuestionUnits(
        group.questions,
        blueprint.questionsPerModule,
        randomInt,
        true,
      ),
    ),
  );
  return shuffle(selectedUnits, randomInt).flat();
}
