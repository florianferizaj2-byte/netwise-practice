import {
  banksForCertificate,
  bundledQuestions,
  certificates,
} from "../server/question-banks/loader.js";

// 单纯 import loader 就已经完成了绝大部分校验（它会抛出）：
// 清单字段、证书 ID 与目录名一致、题库路径不越界、题目 Schema、
// 知识分类路径、章节必须在大纲内、权重合计 100、题目 ID 全局唯一、
// 跨证书同 ID 内容必须一致、共用题引用必须存在。
//
// 这里再补一层显式断言：一是让失败信息更直白，二是防止上述校验
// 在未来被削弱时静默通过。
const failures = [];
const fail = (message) => failures.push(message);

const questions = bundledQuestions();
const seenIds = new Set();
const duplicateIds = new Set();
for (const question of questions) {
  if (seenIds.has(question.id)) duplicateIds.add(question.id);
  seenIds.add(question.id);
}
if (duplicateIds.size)
  fail(`题目 ID 重复：${[...duplicateIds].join("、")}`);

for (const certificate of certificates) {
  const count = questions.filter((question) =>
    question.certificates.includes(certificate.id),
  ).length;
  const banks = banksForCertificate(certificate.id);
  if (!count) fail(`${certificate.id} 没有加载到任何题目`);
  if (!banks.length) fail(`${certificate.id} 没有声明任何题库分组`);
  if (certificate.syllabus) {
    const totalWeight = certificate.syllabus.modules.reduce(
      (sum, module) => sum + module.weight,
      0,
    );
    if (Math.abs(totalWeight - 100) > 0.001)
      fail(`${certificate.id} 大纲权重合计为 ${totalWeight}，应为 100`);
  }
  console.log(`${certificate.id}: ${count} questions, ${banks.length} banks`);
}

// 每道题至少属于一个证书，否则它既不会出现在任何界面，也无人维护。
const orphans = questions.filter(
  (question) => !Array.isArray(question.certificates) || !question.certificates.length,
);
if (orphans.length)
  fail(`有 ${orphans.length} 道题没有归属证书：${orphans.slice(0, 5).map((q) => q.id).join("、")}`);

if (!questions.length) fail("题库为空");

if (failures.length) {
  console.error(`\n题库校验失败，共 ${failures.length} 项：`);
  for (const message of failures) console.error(`  ✖ ${message}`);
  process.exit(1);
}

console.log(
  `Validated ${questions.length} unique bundled questions across ${certificates.length} certificates.`,
);
