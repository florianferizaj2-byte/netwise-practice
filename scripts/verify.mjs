import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verificationEnvironment } from "./verification-env.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const isolated = verificationEnvironment(process.env);
try {
for (const [label, args] of [
  ["移动端版本一致性检查", ["scripts/check-mobile-version.mjs"]],
  ["题库结构检查", ["scripts/validate-question-banks.js"]],
  [
    "移动端类型检查",
    [
      "mobile/node_modules/typescript/bin/tsc",
      "--noEmit",
      "--project",
      "mobile/tsconfig.json",
    ],
  ],
  ["服务端与客户端回归测试", ["--test", "--test-concurrency=4", "test/*.test.js"]],
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
]) {
  console.log(`\n正在进行：${label}`);
  const test = args[0] === "--test" || args[0].startsWith("test/");
  const result = spawnSync(process.execPath, test ? ["--import", "./test/helpers/local-http-only.js", ...args] : args, {
    cwd: root,
    env: isolated.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label}未通过，退出码 ${result.status}`);
}
console.log("\n所有发布前检查通过。");
} finally {
  isolated.cleanup();
}
