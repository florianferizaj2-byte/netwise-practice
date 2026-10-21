import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
import { verificationEnvironment } from "./verification-env.mjs";
import {
  buildInputs,
  filesBelow,
  fingerprint,
  assertBuildProvenance,
} from "./release-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const checks = [
  ["移动端版本一致性检查", ["scripts/check-mobile-version.mjs"]],
  ["题库结构检查", ["scripts/validate-question-banks.js"]],
  ["内容审核与发布包质量检查", ["--test", ".agents/skills/kaojiang-content-pipeline/scripts/quality.test.mjs"]],
  [
    "移动端类型检查",
    [
      "mobile/node_modules/typescript/bin/tsc",
      "--noEmit",
      "--project",
      "mobile/tsconfig.json",
    ],
  ],
  [
    "服务端与客户端回归测试",
    [
      "--test",
      `--test-concurrency=${Math.min(4, availableParallelism())}`,
      "test/*.test.js",
    ],
  ],
  ["电脑与移动网页构建", ["scripts/build.mjs"]],
  ["浏览器完整流程检查", ["test/e2e.js"]],
  ["VIP AI 精讲与练习完整流程检查", ["test/subjective-study.e2e.js"]],
  ["会员购买与兑换入口检查", ["test/membership-purchase.e2e.js"]],
  ["移动网页双浏览器流程检查", ["test/mobile-web.e2e.js"]],
  ["苹果网页布局与无障碍检查", ["test/apple-ui.e2e.js"]],
  ["移动端 AI 精炼完整流程检查", ["test/mobile-study.e2e.js"]],
  ["手机账号管理完整流程检查", ["test/mobile-admin.e2e.js"]],
  ["公告热更新完整流程检查", ["test/mobile-announcement.e2e.js"]],
  ["启动公告、资料补全与网页用户列表检查", ["test/mobile-profile.e2e.js"]],
  ["官网安装包与强制更新检查", ["test/mobile-release-publish.e2e.js"]],
  ["可跳过更新、再次启动与失败降级检查", ["test/mobile-update.e2e.js"]],
  ["蓝色Web候选版本专项验收", ["scripts/verify-web-blue.mjs"]],
  ["管理员Web工作台完整流程检查", ["test/admin-console.e2e.js"]],
];
const output = path.join(root, "test-output");
fs.mkdirSync(output, { recursive: true });
const reportFile = path.join(output, "release-verification-report.json");
const inputs = () =>
  fingerprint(
    root,
    [
      ...new Set([
        ...buildInputs(root),
        ...filesBelow(root, "test"),
        "scripts/verify.mjs",
        "scripts/verification-env.mjs",
        "scripts/verify-web-blue.mjs",
      ]),
    ].sort(),
  );
const report = {
  complete: false,
  passed: false,
  startedAt: new Date().toISOString(),
  inputs: inputs(),
  checks: [],
};
const save = () =>
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
save();
const isolated = verificationEnvironment(process.env, {
  temporaryParent: path.join(root, "tmp"),
});
try {
  for (const [index, [label, args]] of checks.entries()) {
    console.log(`正在进行：${label}`);
    const filename = path.join(output, `release-step-${index + 1}.log`);
    const fd = fs.openSync(filename, "w");
    const test = args[0] === "--test" || args[0].startsWith("test/");
    const began = Date.now();
    let result;
    try {
      result = spawnSync(
        process.execPath,
        test
          ? ["--import", "./test/helpers/local-http-only.js", ...args]
          : args,
        {
          cwd: root,
          env: isolated.env,
          stdio: ["ignore", fd, fd],
          windowsHide: true,
          timeout: 600000,
        },
      );
    } finally {
      fs.closeSync(fd);
    }
    report.checks.push({
      label,
      command: args,
      exitCode: result.status,
      durationMs: Date.now() - began,
      log: `test-output/release-step-${index + 1}.log`,
      ...(result.error ? { error: result.error.message } : {}),
    });
    save();
    if (result.error || result.status !== 0) {
      console.error(
        fs.readFileSync(filename, "utf8").split(/\r?\n/).slice(-40).join("\n"),
      );
      throw result.error || new Error(`${label}未通过，详见${filename}`);
    }
  }
  assert.deepEqual(
    inputs(),
    report.inputs,
    "验收期间源码或测试发生变化，请重新验收。",
  );
  report.build = assertBuildProvenance(root);
  report.complete = true;
  report.passed = true;
  console.log("所有发布前检查通过；生产环境与真实模型未在此流程内操作。");
} catch (error) {
  report.complete = true;
  report.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  isolated.cleanup();
}
