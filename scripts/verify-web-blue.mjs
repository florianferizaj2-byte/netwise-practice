import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertBuildProvenance } from "./release-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const checks = [
  ["蓝色公开首页与真实登录", "blue-landing"],
  ["现有六类证书选择", "certificate-selection"],
  ["首页与全部章节插画", "blue-workspace"],
  ["题目收藏总览", "favorites-overview"],
  ["知识点收藏", "knowledge-favorites"],
  ["真实学习计划", "learning-plan"],
  ["通用刷题与错题总览", "blue-practice"],
  ["兽医病例与配伍题", "blue-veterinary-practice"],
  ["知识点组卷、考试恢复与成绩", "blue-exam"],
  ["分步互动精讲", "interactive-tutor"],
  ["分步老师答疑与失败处理", "tutor-teacher"],
  ["网页学习偏好与显示设置", "web-preferences"],
  ["个人资料与App共用资料", "blue-settings-profile"],
  ["解析展开与自动切题", "practice-review"],
  ["会员三档与真实测试码兑换", "blue-membership"],
  ["全站蓝色与深色配色", "blue-palette"],
];
const output = path.join(root, "test-output");
fs.mkdirSync(output, { recursive: true });
const reportFile = path.join(output, "blue-release-gate-report.json");
const report = {
  complete: false,
  passed: false,
  productionDataUsed: false,
  externalModelVerification: false,
  checks: [],
};
const save = () =>
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
save();
const parent = fs.realpathSync(os.tmpdir());
const temporary = fs.mkdtempSync(path.join(parent, "ace-blue-gate-env-"));
// Never load the checkout's .env, model credentials, real mail or user database.
const dotenv = path.join(temporary, "empty.env");
fs.writeFileSync(dotenv, "");
const systemEnvironment = new Set([
  "PATH",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "TMPDIR",
  "PLAYWRIGHT_BROWSERS_PATH",
  "TEST_BROWSER_CHANNEL",
  "CI",
]);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    systemEnvironment.has(name.toUpperCase()),
  ),
);
Object.assign(env, {
  DOTENV_CONFIG_PATH: dotenv,
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  AUTH_EMAIL_VERIFICATION_ENABLED: "0",
});
try {
  report.build = assertBuildProvenance(root);
  save();
  for (const [label, name] of checks) {
    console.log(`正在检查：${label}`);
    const logFile = path.join(output, `blue-release-${name}.log`);
    const fd = fs.openSync(logFile, "w");
    const began = Date.now();
    let result;
    try {
      result = spawnSync(
        process.execPath,
        [
          "--import",
          "./test/helpers/local-http-only.js",
          `test/${name}.e2e.js`,
        ],
        {
          cwd: root,
          env,
          stdio: ["ignore", fd, fd],
          windowsHide: true,
          timeout: 300000,
        },
      );
    } finally {
      fs.closeSync(fd);
    }
    const check = {
      name,
      label,
      exitCode: result.status,
      durationMs: Date.now() - began,
      log: path.relative(root, logFile).split(path.sep).join("/"),
    };
    report.checks.push(check);
    save();
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`${label}未通过，请查看 ${check.log}`);
  }
  assertBuildProvenance(root);
  report.complete = true;
  report.passed = true;
  save();
  console.log(
    `蓝色Web候选版本 ${checks.length} 项浏览器专项通过；未调用外部模型，未操作生产数据。`,
  );
} catch (cause) {
  report.error = cause.message;
  save();
  console.error(cause.message);
  process.exitCode = 1;
} finally {
  const absolute = path.resolve(temporary);
  if (
    path.dirname(absolute) !== parent ||
    !path.basename(absolute).startsWith("ace-blue-gate-env-")
  )
    throw new Error("临时验证目录校验失败");
  fs.rmSync(absolute, { recursive: true, force: true });
}
