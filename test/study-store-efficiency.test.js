import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createStudyStore } from "../server/study-store.js";

test("teacher quota and expired reservations use dedicated indexes", () => {
  const db = new DatabaseSync(":memory:");
  try {
    createStudyStore(db);
    const quota = db.prepare("EXPLAIN QUERY PLAN SELECT count(*) FROM study_teacher_requests WHERE user_id=? AND day=? AND status IN ('processing','completed')")
      .all("learner", "2026-10-20");
    const leases = db.prepare("EXPLAIN QUERY PLAN UPDATE study_teacher_requests SET status='failed' WHERE status='processing' AND lease_until<?")
      .all("2026-10-20T00:00:00.000Z");
    assert(quota.some((row) => row.detail.includes("study_teacher_quota")));
    assert(leases.some((row) => row.detail.includes("study_teacher_leases")));
  } finally { db.close(); }
});

test("teacher history keeps three completed exchanges and isolates account and course", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const content = createStudyStore(db);
    const insert = db.prepare("INSERT INTO study_teacher_requests VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (let index = 0; index < 7; index++) {
      const user = index === 4 ? "other" : "learner",
        course = index === 5 ? "other-course" : "course",
        status = index === 6 ? "processing" : "completed";
      insert.run(String(index), user, "node", course, "request-" + index, "hash", "2026-10-20", status,
        JSON.stringify({ context: { message: "问题" + index }, answer: { conclusion: "回答" + index } }),
        `2026-10-20T00:00:0${index}.000Z`, "2026-10-20T00:05:00.000Z");
    }
    assert.deepEqual(content.teacherHistory("learner", "course").map((row) => row.question), ["问题1", "问题2", "问题3"]);
    assert.deepEqual(content.teacherHistory("other", "course").map((row) => row.question), ["问题4"]);
  } finally { db.close(); }
});
