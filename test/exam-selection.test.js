import test from "node:test";
import assert from "node:assert/strict";
import {
  examPointId,
  examSelectionCatalog,
  wholeExamPool,
  sampleKnowledgeExam,
} from "../server/exam-selection.js";
import { sampleExamQuestions } from "../server/syllabus.js";
const q = (id, point, group, type = "single_choice", chapter = "章节") => ({
  id,
  chapter,
  knowledgeSection: "分类",
  knowledgePoint: point,
  type,
  options: { A: "甲", B: "乙" },
  ...(group ? { sharedGroupId: group } : {}),
});
const checkGroups = (source, selected) => {
  for (const row of selected.filter((q) => q.sharedGroupId))
    assert.deepEqual(
      source
        .filter((q) => q.sharedGroupId === row.sharedGroupId)
        .map((q) => q.id)
        .sort(),
      selected
        .filter((q) => q.sharedGroupId === row.sharedGroupId)
        .map((q) => q.id)
        .sort(),
    );
};
test("exam catalogue gives stable certificate-scoped leaf IDs and actual objective type counts without answers", () => {
  const rows = [q("a", "甲"), q("b", "甲", null, "true_false"), q("c", "乙")];
  const result = examSelectionCatalog(rows, "cert");
  assert.equal(result.chapters[0].questionCount, 3);
  assert.equal(result.chapters[0].knowledgePoints.length, 2);
  assert.deepEqual(result.chapters[0].knowledgePoints[0].types, {
    single_choice: 1,
    true_false: 1,
  });
  assert.equal(
    examPointId("cert", rows[0]),
    examPointId("cert", { ...rows[0], id: "other" }),
  );
  assert.notEqual(examPointId("cert", rows[0]), examPointId("other", rows[0]));
  assert.equal(JSON.stringify(result).includes('"answer"'), false);
});
test("leaf sampling covers every selected point, keeps mixed-leaf groups complete and never fills from outside", () => {
  const rows = [
    q("a", "甲", "g"),
    q("b", "乙", "g"),
    q("c", "甲"),
    q("d", "丙"),
    q("e", "乙"),
    q("f", "甲"),
  ];
  const ids = [examPointId("cert", rows[0]), examPointId("cert", rows[1])];
  const pool = wholeExamPool(rows, (row) =>
    ids.includes(examPointId("cert", row)),
  );
  for (let i = 0; i < 20; i++) {
    const picked = sampleKnowledgeExam(pool, "cert", ids, 4);
    checkGroups(rows, picked);
    assert.equal(picked.length, 4);
    assert.deepEqual(
      [...new Set(picked.map((q) => examPointId("cert", q)))].sort(),
      [...ids].sort(),
    );
  }
  assert.deepEqual(
    wholeExamPool(rows, (row) => row.knowledgePoint === "甲").map((q) => q.id),
    ["c", "f"],
  );
  assert.throws(
    () => sampleKnowledgeExam([rows[0], rows[1]], "cert", ids, 1),
    /增加题量/,
  );
  assert.throws(
    () => sampleKnowledgeExam([rows[0]], "cert", [ids[1]], 3),
    /没有符合/,
  );
});
test("sampling with no syllabus and with cross-chapter materials never splits shared groups", () => {
  const rows = [
    q("a", "甲", "g"),
    q("b", "甲", "g"),
    q("c", "甲", "g"),
    q("d", "甲"),
    q("e", "乙", null, "single_choice", "另一章"),
  ];
  for (let i = 0; i < 40; i++)
    checkGroups(rows, sampleExamQuestions(rows, null, 2));
  const cross = [{ ...rows[0], chapter: "另一章" }, ...rows.slice(1)];
  for (let i = 0; i < 40; i++)
    checkGroups(
      cross,
      sampleExamQuestions(
        cross,
        {
          modules: [
            { name: "章节", weight: 50, order: 1 },
            { name: "另一章", weight: 50, order: 2 },
          ],
        },
        2,
      ),
    );
});
