import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const version = JSON.parse(fs.readFileSync(new URL('../server/mobile-release.json', import.meta.url), 'utf8')).latestVersion;
const capabilities = ['points-v1', 'account-security-v1', 'learning-gate-v1'];

export async function checkDeployment({ baseUrl, sessionToken, apk, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  assert(!base.username && !base.password && !base.search && !base.hash, '站点地址不能包含凭据、查询或锚点');
  assert(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)), '远程站点必须使用 HTTPS');
  const json = async (route, authenticated = false) => {
    const response = await fetchImpl(new URL('/api' + route, base), { redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', 'X-Client': 'mobile', 'X-App-Version': version,
        ...(authenticated ? { Authorization: 'Bearer ' + sessionToken } : {}) } });
    assert.equal(response.status, 200, `${route} 返回 ${response.status}`);
    return response.json();
  };
  const release = await json('/mobile/version?version=' + version);
  assert.equal(release.forceUpdate, false, '服务器要求比当前安装包更高的版本');
  assert(release.backend?.apiRevision >= 1, '服务器尚未部署 v1.0 接口契约');
  assert(capabilities.every(name => release.backend.capabilities?.includes(name)), '配套接口未全部挂载');
  assert(Number.isSafeInteger(release.apkBytes) && release.apkBytes > 1024, '安装包大小信息未发布');
  assert(/^[a-f0-9]{64}$/i.test(release.apkSha256 || ''), '安装包 SHA-256 未发布');
  assert(/^[a-f0-9]{32}$/i.test(release.apkMd5 || ''), '安装包完整性信息未发布');
  const download = new URL(release.downloadUrl, base);
  assert(!download.username && !download.password, '安装包地址不能包含凭据');
  const response = await fetchImpl(download, { headers: { Range: 'bytes=0-7' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (response.status !== 206) { await response.body?.cancel(); throw new Error(`安装包分段下载失败：${response.status}`); }
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, 8); assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], '下载内容不是 APK/ZIP');
  assert(response.headers.get('content-range')?.endsWith('/' + release.apkBytes), '下载文件大小与版本信息不符');
  const checked = [];
  if (sessionToken) {
    for (const [route, valid] of [
      ['/account/points/wallet', data => Number.isSafeInteger(data.wallet?.availableUnits) && data.wallet.scale === 1000],
      ['/account/points/services', data => data.billingMode === 'actual-usage' && Array.isArray(data.models)],
      ['/account/points/operations?limit=1', data => Array.isArray(data.rows) && Array.isArray(data.calls)],
      ['/account/entitlements', data => data.billingMode === 'points' && !!data.points],
      ['/auth/security', data => !!data && typeof data === 'object'],
      ['/practice/catalog?summary=1', data => Number.isInteger(data.total)],
      ['/exams/catalog', data => !!data && typeof data === 'object'],
      ['/location-learning', data => !!data && typeof data === 'object'],
    ]) { assert(valid(await json(route, true)), `${route} 返回格式不匹配`); checked.push(route); }
  }
  if (apk) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'), release.apkSha256.toLowerCase(), '本地 APK 与已发布版本不符');
  return { ok: true, appVersion: version, backendVersion: release.backend.version, capabilities: release.backend.capabilities,
    apkRangeDownload: true, wholeApkHashChecked: !!apk, authenticatedApis: sessionToken ? 'passed' : '未执行：设置 ACEEXAM_SESSION_TOKEN 后重跑',
    authenticatedChecks: checked.length, externalModelCalls: 0, userDataChanged: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { url: { type: 'string' }, apk: { type: 'string' } } });
  assert(values.url, '用法：node scripts/check-v1-deployment.mjs --url https://你的站点 [--apk 安装包路径]');
  console.log(JSON.stringify(await checkDeployment({ baseUrl: values.url, sessionToken: process.env.ACEEXAM_SESSION_TOKEN, apk: values.apk }), null, 2));
}
