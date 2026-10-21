import fs from "node:fs";
import { catalogue, allBundles } from "../server/demo-tutor/registry.js";
import { validateBundle } from "../server/demo-tutor/authoring.js";
const catalog = catalogue();
const publicCatalog =
  '"use strict";\nwindow.AceTutorCatalog = Object.freeze(' +
  JSON.stringify(catalog).replaceAll("<", "\\u003c") +
  ");\n";
if (process.argv.includes("--check")) {
  if (
    fs.readFileSync("public/demo/home-blue/tutor-catalog.js", "utf8") !==
    publicCatalog
  )
    throw new Error("公开课程目录与私有注册表不一致，请重新生成");
} else
  fs.writeFileSync("public/demo/home-blue/tutor-catalog.js", publicCatalog);
for (const bundle of allBundles())
  if (bundle.course.id !== "vlan-broadcast-domain") validateBundle(bundle);
const report = {
  ...catalog.coverage,
  knowledgePoints: catalog.knowledgePoints,
  authored: allBundles().map((b) => ({
    id: b.course.id,
    concepts: b.course.concepts.length,
    questions: b.quizzes.reduce((n, q) => n + 1 + q.variants.length, 0),
    wrongBranches: b.quizzes
      .flatMap((q) => [q.main, ...q.variants])
      .reduce((n, q) => n + Object.keys(q.branches).length, 0),
  })),
};
fs.mkdirSync("outputs/home-blue-demo", { recursive: true });
fs.writeFileSync(
  "outputs/home-blue-demo/tutor-coverage.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    { coverage: catalog.coverage, authored: report.authored },
    null,
    2,
  ),
);
if (
  process.argv.includes("--require-complete") &&
  (catalog.coverage.pending || catalog.coverage.partial)
) {
  console.error("全量互动课程尚未完成，禁止将当前覆盖率作为全量验收通过。");
  process.exitCode = 1;
}
