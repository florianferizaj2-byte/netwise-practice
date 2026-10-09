import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const [label, args] of [
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
  ["服务端与客户端回归测试", ["--test", "test/*.test.js"]],
  ["电脑与移动网页构建", ["scripts/build.mjs"]],
  ["浏览器完整流程检查", ["test/e2e.js"]],
  ["VIP AI 精讲与练习完整流程检查", ["test/subjective-study.e2e.js"]],
  ["会员购买与兑换入口检查", ["test/membership-purchase.e2e.js"]],
  ["移动网页双浏览器流程检查", ["test/mobile-web.e2e.js"]],
  ["苹果网页布局与无障碍检查", ["test/apple-ui.e2e.js"]],
  ["移动端 AI 精炼完整流程检查", ["test/mobile-study.e2e.js"]],
]) {
  console.log(`\n正在进行：${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\n所有发布前检查通过。");
