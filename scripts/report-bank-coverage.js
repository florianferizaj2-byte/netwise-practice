// 题库覆盖缺口报表。只读：不修改任何题库文件或数据库。
//
// 用途：扩题前先看清每个证书、每个大纲模块现在有多少题、离 targetQuestionCount
// 还差多少，以及有没有题目的 chapter 不在大纲里（后者会让启动直接失败）。
//
// 用法：
//   node scripts/report-bank-coverage.js
//   node scripts/report-bank-coverage.js --json
//   node scripts/report-bank-coverage.js --certificate hcia-datacom

import {
  bundledQuestions,
  certificates,
  questionForCertificate,
} from "../server/question-banks/loader.js";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const certificateFilter = (() => {
  const index = argv.indexOf("--certificate");
  return index === -1 ? null : argv[index + 1];
})();

const typeLabels = {
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  short_answer: "简答",
};

// 题库文件里的 chapter 只是「基础题型」分类；共用题可能通过
// certificateScopes 覆盖成当前考试的大纲模块名，所以这里按证书取生效值。
const effectiveChapter = (question, certificateId) =>
  question.certificateScopes?.[certificateId]?.chapter || question.chapter;

const questions = bundledQuestions();
const selected = certificates.filter(
  (certificate) => !certificateFilter || certificate.id === certificateFilter,
);

if (certificateFilter && !selected.length) {
  console.error(`未找到证书：${certificateFilter}`);
  console.error(`可用证书：${certificates.map((entry) => entry.id).join("、")}`);
  process.exit(2);
}

const report = selected.map((certificate) => {
  const rows = questions.filter((question) =>
    question.certificates.includes(certificate.id),
  );
  const chapterCounts = new Map();
  const types = new Map();
  for (const question of rows) {
    const chapter = effectiveChapter(question, certificate.id);
    chapterCounts.set(chapter, (chapterCounts.get(chapter) || 0) + 1);
    types.set(question.type, (types.get(question.type) || 0) + 1);
  }

  const modules = certificate.syllabus?.modules || [];
  const moduleNames = new Set(modules.map((module) => module.name));
  const mapped = modules
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((module) => {
      const actual = chapterCounts.get(module.name) || 0;
      return {
        id: module.id,
        name: module.name,
        weight: module.weight,
        target: module.targetQuestionCount,
        actual,
        gap: Math.max(0, module.targetQuestionCount - actual),
      };
    });
  // 只有配置了 syllabus 的证书才有「大纲外」概念。没有 syllabus 时 chapter
  // 就是题库自带的分类标签，全部落到 unmatchedChapters 里作参考，不算问题。
  const unmatchedChapters = [...chapterCounts.entries()]
    .filter(([chapter]) => !moduleNames.has(chapter))
    .map(([chapter, count]) => ({ chapter, count }))
    .sort((a, b) => b.count - a.count);
  const unmapped = modules.length ? unmatchedChapters : [];

  return {
    certificate,
    total: rows.length,
    types: Object.fromEntries(types),
    hasSyllabus: Boolean(certificate.syllabus),
    allowUnmappedChapters: Boolean(
      certificate.syllabus?.allowUnmappedChapters,
    ),
    mapped,
    unmatchedChapters,
    unmapped,
  };
});

if (asJson) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalUniqueQuestions: questions.length,
        certificates: report.map((entry) => ({
          id: entry.certificate.id,
          name: entry.certificate.name,
          shortName: entry.certificate.shortName,
          total: entry.total,
          types: entry.types,
          hasSyllabus: entry.hasSyllabus,
          allowUnmappedChapters: entry.allowUnmappedChapters,
          modules: entry.mapped,
          unmappedChapters: entry.unmapped,
        })),
      },
      null,
      2,
    ),
  );
} else {
  console.log(`题库覆盖缺口报表`);
  console.log(`唯一内置题目合计：${questions.length} 道`);
  console.log("─".repeat(72));
  for (const entry of report) {
    const { certificate } = entry;
    const typeText = Object.entries(entry.types)
      .map(([type, count]) => `${typeLabels[type] || type} ${count}`)
      .join(" · ");
    console.log(
      `\n${certificate.shortName}（${certificate.id}）  共 ${entry.total} 道`,
    );
    console.log(`  题型：${typeText || "无"}`);
    if (!entry.hasSyllabus) {
      console.log("  未配置考试大纲，以下为题库自带章节：");
      for (const item of entry.unmatchedChapters)
        console.log(`    ${String(item.count).padStart(6)}  ${item.chapter}`);
      continue;
    }
    console.log("  模块（权重 / 目标 / 现有 / 缺口）：");
    let totalGap = 0;
    for (const module of entry.mapped) {
      totalGap += module.gap;
      const flag = module.gap > 0 ? "缺" : "足";
      console.log(
        `    ${flag} ${String(module.actual).padStart(6)} / ${String(module.target).padStart(4)}` +
          `  (权重 ${String(module.weight).padStart(3)}%)  ${module.name}`,
      );
    }
    console.log(
      `  模块缺口合计：${totalGap} 道` +
        (totalGap === 0 ? "（各模块均已达目标）" : ""),
    );
    if (entry.unmapped.length) {
      const label = entry.allowUnmappedChapters
        ? "大纲外章节（清单已允许，仍需人工确认）"
        : "⚠ 大纲外章节（会导致服务启动失败，必须修正）";
      console.log(`  ${label}：`);
      for (const item of entry.unmapped)
        console.log(`    ${String(item.count).padStart(6)}  ${item.chapter}`);
    }
  }
  const blockers = report.filter(
    (entry) => entry.unmapped.length && !entry.allowUnmappedChapters,
  );
  console.log(`\n${"─".repeat(72)}`);
  if (blockers.length) {
    console.log(
      `存在 ${blockers.length} 个证书有会阻止启动的大纲外章节，请先修正。`,
    );
    process.exit(1);
  }
  console.log("未发现会阻止启动的大纲外章节。");
}
