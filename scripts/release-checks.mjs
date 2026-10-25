import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getReleaseTarget(root) {
  const file = path.join(root, 'release-target.json');
  if (!fs.existsSync(file)) return 'unified';
  const { target } = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!['android', 'unified'].includes(target)) throw new Error('Unknown release target: ' + target);
  return target;
}

export const allReleaseChecks = [
  ['version', '移动端版本一致性', ['scripts/check-mobile-version.mjs']],
  ['banks', '已发布题库结构', ['scripts/validate-question-banks.js']],
  ['types', '移动端类型检查', ['mobile/node_modules/typescript/bin/tsc', '--noEmit', '--project', 'mobile/tsconfig.json']],
  ['apk', '正式 APK 签名与内容', ['python', 'scripts/verify-android-apk.py']],
  ['unit', '服务端与客户端全量回归', ['--test', '--test-concurrency=6', 'test/*.test.js']],
  ['build', '电脑与移动网页构建', ['scripts/build.mjs']],
  ['runtime', '旧数据升级与独立运行包', ['scripts/verify-release-runtime.mjs', '--baseline=64ad007c8edaef51dc7019b3f5a4e791594f955a']],
  ['browser', '电脑网页完整流程', ['test/e2e.js']],
  ['study', 'AI 精讲与练习', ['test/subjective-study.e2e.js']],
  ['purchase', '会员购买与兑换', ['test/membership-purchase.e2e.js']],
  ['mobile-web', '移动网页双浏览器', ['test/mobile-web.e2e.js']],
  ['apple', '苹果网页布局与无障碍', ['test/apple-ui.e2e.js']],
  ['phone-study', '移动端 AI 精炼', ['test/mobile-study.e2e.js']],
  ['admin', '手机账号管理', ['test/mobile-admin.e2e.js']],
  ['announcement', '公告热更新', ['test/mobile-announcement.e2e.js']],
  ['profile', '启动公告与资料补全', ['test/mobile-profile.e2e.js']],
  ['download', '官网 APK 下载与强制更新', ['test/mobile-release-publish.e2e.js']],
  ['android-points', 'Android AI 确认与积分结算', ['test/android-points-flow.e2e.js']],
  ['android-layout', 'Android 我的与会员布局', ['test/android-profile-vip-layout.e2e.js']],
  ['android-flows', 'Android 全流程与升级恢复', ['test/mobile-update.e2e.js']],
  ['launch', 'App 启动与减弱动画', ['test/app-launch.e2e.js']],
  ['deployment', '部署自检完整链路', ['test/mobile-deployment.e2e.js']],
].map(([id, label, args]) => ({ id, label, args }));

const mobileWebChecks = new Set(['mobile-web', 'apple', 'phone-study', 'admin', 'announcement', 'profile']);
export function checksForTarget(target) {
  return allReleaseChecks.filter(({ id }) => target !== 'android' || !mobileWebChecks.has(id))
    .map(check => target === 'android' && check.id === 'build' ? { ...check, label: '电脑官网与 APK 下载构建' } : check);
}
export const releaseChecks = checksForTarget(getReleaseTarget(fileURLToPath(new URL('../', import.meta.url))));
