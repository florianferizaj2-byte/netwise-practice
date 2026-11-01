import fs from "node:fs";
import { exportTutorCurriculum } from "./export-tutor-curriculum.mjs";
import path from "node:path";
import { correctHomeBlueLesson } from "./home-blue-ai-corrections.mjs";
import {
  studyNodes,
  studyPackageSchema,
  studyReviewSchema,
} from "../server/study-content.js";

const output = path.resolve("public/demo/home-blue");
const courses = [
  { id: "network-engineer", title: "软考 · 网络工程师" },
  { id: "sichuan-upgrading-computer", title: "四川专升本 · 计算机" },
];
for (const course of courses) {
  const seed = JSON.parse(
    fs.readFileSync(`server/study-seeds/${course.id}.json`, "utf8"),
  );
  const nodes = studyNodes.filter((n) => n.certificateId === course.id);
  const packages = new Map(seed.packages.map((p) => [p.nodeId, p]));
  if (packages.size !== nodes.length)
    throw new Error("课程快照与目录数量不一致");
  const lessons = nodes.map((node) => {
    const pkg = packages.get(node.id);
    if (!pkg || pkg.curriculumVersion !== node.version)
      throw new Error("课程版本已变化: " + node.id);
    const bundle = studyPackageSchema.parse(pkg.bundle);
    const review = studyReviewSchema.parse(pkg.review);
    if (
      !review.lesson.valid ||
      !review.lesson.knowledgeCorrect ||
      !review.lesson.nodeAligned ||
      review.questions.some(
        (q) =>
          !q.valid ||
          !q.nodeAligned ||
          !q.answerCorrect ||
          !q.explanationCorrect ||
          !q.hintSafe,
      ) ||
      bundle.questions.some((q) => !review.questions.some((r) => r.id === q.id))
    )
      throw new Error("不可导出未经审核的内容: " + node.id);
    return correctHomeBlueLesson({
      id: node.id,
      version: node.version,
      order: node.order,
      chapter: node.chapter,
      section: node.section,
      name: node.sublesson?.title || node.name,
      parent: node.parentName,
      unit: node.sublesson,
      lesson: bundle.lesson,
      questions: bundle.questions,
    });
  });
  const chapters = [...new Set(lessons.map((n) => n.chapter))].map(
    (name, index) => ({
      id: String(index),
      name,
      sections: [
        ...new Set(
          lessons.filter((n) => n.chapter === name).map((n) => n.section),
        ),
      ],
    }),
  );
  const snapshot = { schemaVersion: 1, course, chapters, lessons };
  const filename = path.join(output, "ai-content-" + course.id + ".json");
  fs.writeFileSync(filename, JSON.stringify(snapshot), "utf8");
  if (course.id === "network-engineer") exportTutorCurriculum(snapshot);
  console.log(
    JSON.stringify({
      course: course.title,
      chapters: chapters.length,
      lessons: lessons.length,
      questions: lessons.reduce((n, item) => n + item.questions.length, 0),
      bytes: fs.statSync(filename).size,
    }),
  );
}
