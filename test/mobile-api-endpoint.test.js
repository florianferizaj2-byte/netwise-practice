import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';

const source = fs.readFileSync('mobile/src/api/endpoint.ts', 'utf8');

function load({ env = {}, fetchImpl, web = false } = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    process: { env },
    fetch: fetchImpl ?? (async () => ({ status: 200 })),
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  };
  if (web) {
    context.document = {};
    context.window = { location: { origin: 'https://app.test' } };
  }
  vm.runInNewContext(code, context);
  return context.module.exports;
}

test('native builds prefer the IPv6 direct host and fall back to the public domain', () => {
  const api = load();
  assert.deepEqual([...api.API_BASES], [
    'https://direct.aceexam.top:8443/api',
    'https://aceexam.top/api',
  ]);
  assert.equal(api.API_BASE_URL, 'https://direct.aceexam.top:8443/api');
  assert.equal(api.API_FALLBACK_URL, 'https://aceexam.top/api');
});

test('web builds stay on the current origin and never probe another host', async () => {
  let calls = 0;
  const api = load({ web: true, fetchImpl: async () => { calls += 1; return { status: 200 }; } });
  assert.deepEqual([...api.API_BASES], ['https://app.test/api']);
  await api.ensureApiBase();
  assert.equal(calls, 0);
  assert.equal(api.resolveApiUrl('https://app.test/api/questions'), 'https://app.test/api/questions');
});

test('an unreachable IPv6 host switches the session to the fallback base', async () => {
  const api = load({
    fetchImpl: async (url) => {
      if (url.startsWith('https://direct.aceexam.top:8443/api')) throw new TypeError('no route to host');
      return { status: 200 };
    },
  });
  await api.ensureApiBase();
  assert.equal(api.activeApiBase(), 'https://aceexam.top/api');
  assert.equal(
    api.resolveApiUrl('https://direct.aceexam.top:8443/api/questions?bankOnly=1'),
    'https://aceexam.top/api/questions?bankOnly=1',
  );
  assert.equal(api.apiAssetOrigin(), 'https://aceexam.top');
});

test('a reachable IPv6 host keeps every request on the direct base', async () => {
  const api = load({ fetchImpl: async () => ({ status: 200 }) });
  await api.ensureApiBase();
  assert.equal(api.activeApiBase(), 'https://direct.aceexam.top:8443/api');
  assert.equal(
    api.resolveApiUrl('https://direct.aceexam.top:8443/api/mobile/version'),
    'https://direct.aceexam.top:8443/api/mobile/version',
  );
  assert.equal(api.apiAssetOrigin(), 'https://direct.aceexam.top:8443');
});

test('fallback never rewrites URLs that do not belong to the API base', () => {
  const api = load({ fetchImpl: async () => ({ status: 200 }) });
  api.preferApiBase('https://direct.aceexam.top:8443/api');
  assert.equal(api.activeApiBase(), 'https://aceexam.top/api');
  assert.equal(api.resolveApiUrl('https://cdn.test/a.png'), 'https://cdn.test/a.png');
});
