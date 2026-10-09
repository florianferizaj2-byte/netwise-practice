import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function checkMobileVersion(root = fileURLToPath(new URL('../', import.meta.url))) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'mobile', name), 'utf8'));
  const { version } = read('package.json');
  const { expo } = read('app.json');
  const lock = read('package-lock.json');
  const config = createRequire(path.join(root, 'mobile/package.json'))('./app.config.js')({ config: expo });
  assert.match(version, /^\d+\.\d+\.\d+$/, '移动端版本必须为数字三段式');
  for (const [name, value] of [['app.json', expo.version], ['app.config.js', config.version], ['package-lock.json', lock.version], ['lock root', lock.packages[''].version]]) {
    assert.equal(value, version, `${name} 版本与 mobile/package.json 不一致`);
  }
  assert.ok(Number.isSafeInteger(config.android.versionCode) && config.android.versionCode > 0, 'Android versionCode 必须为正整数');
  return { version, versionCode: config.android.versionCode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const release = checkMobileVersion();
  console.log(`移动端版本一致性检查通过：${release.version} / ${release.versionCode}`);
}
