import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const mobile = path.join(root, 'mobile');
const output = path.join(root, 'dist', 'app');
const cli = path.join(mobile, 'node_modules', 'expo', 'bin', 'cli');
if (!fs.existsSync(cli)) throw new Error('缺少移动端构建依赖，请先运行 npm ci --prefix mobile');
const exported = spawnSync(process.execPath, [cli, 'export', '--platform', 'web', '--output-dir', output], {
  cwd: mobile, stdio: 'inherit', windowsHide: true,
  // Release builds always use the hosting site's API, never a developer's .env URL.
  env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1', EXPO_PUBLIC_API_URL: '', EXPO_WEB_BASE_PATH: '/app' },
});
if (exported.error) throw exported.error;
if (exported.status !== 0) process.exit(exported.status ?? 1);
// Use the native app icon as the single source for all platform icon sizes.
const { generateImageAsync } = createRequire(path.join(mobile, 'package.json'))('@expo/image-utils');
const { expo } = JSON.parse(fs.readFileSync(path.join(mobile, 'app.json'), 'utf8'));
for (const [file, size] of [['apple-touch-icon.png', 180], ['kaojiang-logo-192.png', 192], ['kaojiang-logo-512.png', 512]]) {
  const { source } = await generateImageAsync({ projectRoot: mobile, cacheType: 'pwa-icons' }, {
    src: path.resolve(mobile, expo.icon), name: file, width: size, height: size, resizeMode: 'contain',
  });
  fs.writeFileSync(path.join(output, file), source);
}
function filesAt(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? filesAt(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const files = filesAt(output).filter((file) => /\.(html|js|css|png|jpg|jpeg|svg|webp|ico|wav|mp3|ttf|woff2?|webmanifest)$/i.test(file))
  .filter((file) => path.basename(file) !== 'sw.js').sort();
const workerTemplate = fs.readFileSync(path.join(mobile, 'pwa', 'sw.js'), 'utf8');
const hash = createHash('sha256').update(workerTemplate);
for (const file of files) hash.update(path.relative(output, file)).update(fs.readFileSync(file));
const buildId = hash.digest('hex').slice(0, 16);
const precache = files.map((file) => `/app/${path.relative(output, file).split(path.sep).join('/')}`);
fs.writeFileSync(path.join(output, 'sw.js'), workerTemplate.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(precache)));
const { version } = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify({ version, buildId }) + '\n');
console.log(`考匠移动网页版 ${version} 已生成到 dist/app（${buildId}）`);
