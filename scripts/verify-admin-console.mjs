import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verificationEnvironment } from "./verification-env.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  output = path.join(root, "test-output/admin-console"),
  recheck = process.argv.includes("--recheck"),
  reportFile = path.join(
    output,
    recheck ? "recheck.json" : "verification.json",
  );
fs.mkdirSync(output, { recursive: true });
const isolated = verificationEnvironment(process.env, {
    temporaryParent: path.join(root, "tmp"),
  }),
  report = {
    startedAt: new Date().toISOString(),
    productionDataUsed: false,
    paidModelCalls: false,
    checks: [],
  };
let checks = [
  ["题库结构", ["scripts/validate-question-banks.js"]],
  [
    "后台与共用服务接口",
    [
      "--test",
      "--test-concurrency=3",
      "test/admin-console.test.js",
      "test/admin-console-upgrade.test.js",
      "test/mobile-admin.test.js",
      "test/mobile-announcement.test.js",
      "test/membership-codes.test.js",
      "test/account-security.test.js",
      ".agents/skills/kaojiang-content-pipeline/scripts/quality.test.mjs",
    ],
  ],
  [
    "旧刷题与管理接口",
    [
      "--test",
      "--test-name-pattern=管理员面板|普通题目可以提交|settings never|exam is resumable",
      "test/api.test.js",
    ],
  ],
  ["电脑及移动网页构建", ["scripts/build.mjs"]],
  ["后台实际浏览器验收", ["test/admin-console.e2e.js"]],
  ["旧学习与考试流程回归", ["test/e2e.js"]],
  ["课程生成发布与学习回归", ["test/subjective-study.e2e.js"]],
  ["普通用户刷题与错题回归", ["test/blue-practice.e2e.js"]],
  ["会员兑换回归", ["test/membership-codes.e2e.js"]],
  ["App 管理共用接口界面回归", ["test/mobile-admin.e2e.js"]],
  ["公告跨端回归", ["test/mobile-announcement.e2e.js"]],
  ["资料头像与后台列表回归", ["test/mobile-profile.e2e.js"]],
  ["蓝色与深色配色回归", ["test/blue-palette.e2e.js"]],
];
if (recheck)
  checks = checks.filter(([label]) =>
    [
      "后台与共用服务接口",
      "旧刷题与管理接口",
      "电脑及移动网页构建",
      "后台实际浏览器验收",
      "蓝色与深色配色回归",
    ].includes(label),
  );
if (process.argv.includes("--full"))
  checks.unshift([
    "全量单元回归",
    ["--test", "--test-concurrency=4", "test/*.test.js"],
  ]);
try {
  let built = false;
  for (let i = 0; i < checks.length; i++) {
    const [label, args] = checks[i],
      test = args[0] === "--test" || args[0].startsWith("test/");
    if (args[0].startsWith("test/") && !built) {
      report.checks.push({
        label,
        passed: false,
        skipped: "构建未成功，不能使用旧产物验收",
      });
      continue;
    }
    console.log("正在验证：" + label);
    const file = path.join(
        output,
        (recheck ? "recheck-gate-" : "gate-") + i + ".log",
      ),
      fd = fs.openSync(file, "w"),
      started = Date.now();
    const result = spawnSync(
      process.execPath,
      [
        ...(test ? ["--import", "./test/helpers/local-http-only.js"] : []),
        ...args,
      ],
      {
        cwd: root,
        env: isolated.env,
        stdio: ["ignore", fd, fd],
        windowsHide: true,
        timeout: 600000,
      },
    );
    fs.closeSync(fd);
    const item = {
      label,
      passed: result.status === 0,
      exitCode: result.status,
      durationMs: Date.now() - started,
      log: path.relative(root, file),
      ...(result.error ? { error: result.error.message } : {}),
    };
    report.checks.push(item);
    console.log((item.passed ? "通过：" : "未通过：") + label);
    if (args[0] === "scripts/build.mjs") built = item.passed;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  }
} finally {
  isolated.cleanup();
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.every((c) => c.passed);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      checks: report.checks.map((c) => ({ label: c.label, passed: c.passed })),
      report: path.relative(root, reportFile),
    },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
