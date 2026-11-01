import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVeterinaryGroups,
  questionTextForGroup,
} from "../src/question-utils.js";

test("case material survives randomized order when only the anchor has group metadata", () => {
  const stem = "病例：一组动物出现相同临床表现，需要先阅读共用材料";
  const anchor = {
    id: "anchor",
    sharedGroupId: "case-one",
    sharedKind: "stem",
    sharedStem: stem,
    question: `${stem}。第一道小题`,
    options: { A: "一", B: "二" },
  };
  const child = {
    id: "child",
    sharedGroupId: "case-one",
    question: `${stem}。第二道小题`,
    options: { A: "一", B: "二" },
  };
  for (const items of [
    [anchor, child],
    [child, anchor],
  ]) {
    const [group] = buildVeterinaryGroups(items);
    assert.equal(group.kind, "stem");
    assert.equal(group.stem, stem);
    assert.equal(group.shared, true);
    assert.equal(group.questions.length, 2);
    assert.equal(questionTextForGroup(child, group), "第二道小题");
  }
  const [paired] = buildVeterinaryGroups([
    { ...child, sharedGroupId: "pair", sharedKind: "options" },
  ]);
  assert.equal(
    paired.kind,
    "options",
    "Actual shared-option questions stay shared-option questions",
  );
});
