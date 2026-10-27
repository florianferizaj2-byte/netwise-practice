import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { expect } from '@playwright/test';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { launchTestBrowser } from './helpers/browser.js';
import { completeFixtureProfile } from './helpers/mobile-profile.js';
const root = process.cwd(),
  out = path.resolve(
    process.env.VOICE_LIBRARY_CASE_DIR ||
      'tmp/admin-voice-library-20261027/browser',
  );
fs.mkdirSync(out, { recursive: true });
const parent = fs.realpathSync(os.tmpdir()),
  dir = fs.mkdtempSync(path.join(parent, 'admin-voice-browser-')),
  fixture = path.join(dir, '卢音测试');
fs.mkdirSync(fixture);
fs.copyFileSync(
  path.join(root, 'mobile/assets/sounds/answer-correct-soft.wav'),
  path.join(fixture, '你好.wav'),
);
fs.copyFileSync(
  path.join(root, 'mobile/assets/sounds/answer-correct-crisp.wav'),
  path.join(fixture, '真棒.wav'),
);
const store = createStore(path.join(dir, 'data')),
  admin = store.register('voice_ui_admin', 'fixture-password-123');
store.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(admin.id);
store.selectCertificate(admin.id, 'network-engineer');
completeFixtureProfile(store, admin);
const token = store.createAuthSession(admin.id);
const app = await createApp({
    store,
    withFrontend: true,
    production: true,
    authRequired: true,
  }),
  server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = 'http://127.0.0.1:' + server.address().port;
let browser, page;
const checks = [],
  errors = [];
let screenshots = 0;
const get = async (route) => {
  const r = await fetch(base + '/api' + route, {
    headers: { Authorization: 'Bearer ' + token },
  });
  assert.equal(r.status, 200);
  return r.json();
};
async function shot(name) {
  await page.screenshot({
    path: path.join(out, name + '.jpg'),
    type: 'jpeg',
    quality: 75,
  });
  screenshots++;
}
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    { name: 'netwise_session', value: token, url: base },
  ]);
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base + '/?desktop=1#admin/voice-packs');
  const welcome = page.getByRole('button', {
    name: '知道了，开始学习',
    exact: true,
  });
  if (await welcome.isVisible()) await welcome.click();
  await expect(
    page.getByRole('heading', { name: '让每一次进步，都有回应', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '导入文件夹', exact: true }),
  ).toBeVisible();
  await shot('01-empty-library');
  checks.push(
    'real admin navigation exposes an empty voice library without autoplay',
  );

  const filterLayout = await page
    .locator('.ac-voice-filters')
    .evaluate((element) => {
      const search = element.querySelector('.ac-voice-search'),
        icon = search.querySelector('svg').getBoundingClientRect(),
        input = search.querySelector('input').getBoundingClientRect();
      return {
        midpointDelta: Math.abs(
          icon.top + icon.height / 2 - (input.top + input.height / 2),
        ),
        selectWidth: element.querySelector('select').getBoundingClientRect()
          .width,
        contentWidth: element.getBoundingClientRect().width,
        panelPadding: parseFloat(
          getComputedStyle(element.closest('.ac-panel')).paddingLeft,
        ),
      };
    });
  assert.ok(
    filterLayout.midpointDelta <= 3,
    'search icon and input stay on the same row',
  );
  assert.ok(
    filterLayout.selectWidth < filterLayout.contentWidth / 2,
    'state filter does not force a full-width row on desktop',
  );
  assert.ok(
    filterLayout.panelPadding >= 16,
    'material content keeps comfortable inset spacing',
  );

  const real = process.env.VOICE_LIBRARY_REAL_DIRS
    ? JSON.parse(process.env.VOICE_LIBRARY_REAL_DIRS)
    : null;
  const sourceHashes = new Map();
  if (real)
    for (const folder of real)
      for (const name of fs.readdirSync(folder)) {
        const file = path.join(folder, name);
        if (fs.statSync(file).isFile())
          sourceHashes.set(
            file,
            crypto
              .createHash('sha256')
              .update(fs.readFileSync(file))
              .digest('hex'),
          );
      }
  const folders = real ?? [fixture];
  let expected = 0;
  for (const folder of folders) {
    expected += fs
      .readdirSync(folder)
      .filter((name) => /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(name)).length;
    await page.getByTestId('voice-folder-input').setInputFiles(folder);
    await expect
      .poll(async () => (await get('/admin/voice-packs')).assets.length, {
        timeout: 60000,
      })
      .toBe(expected);
    await expect(
      page.getByRole('button', { name: '停止导入', exact: true }),
    ).toHaveCount(0, { timeout: 60000 });
  }
  let catalog = await get('/admin/voice-packs');
  assert.equal(catalog.assets.length, expected);
  assert.ok(catalog.assets.every((row) => row.state === 'pending'));
  assert.ok(catalog.assets.every((row) => row.durationMs > 0));
  assert.ok(catalog.assets.every((row) => row.collection));
  checks.push(
    'folder import reads duration, preserves source files, groups materials and leaves all pending',
  );
  const sample =
      catalog.assets.find((row) => /^你好\./.test(row.name)) ??
      catalog.assets[0],
    second =
      catalog.assets.find(
        (row) => row.id !== sample.id && row.durationMs <= 3000,
      ) ?? catalog.assets[1];
  const input = page.getByRole('textbox', {
    name: '搜索语音素材',
    exact: true,
  });
  await input.fill(sample.name);
  await expect(page.getByTestId('voice-asset-' + sample.id)).toBeVisible();
  await page
    .getByRole('button', { name: '试听 ' + sample.name, exact: true })
    .click();
  const player = page.getByLabel('语音素材试听播放器', { exact: true });
  await expect
    .poll(() => player.evaluate((audio) => audio.readyState), {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(2);
  assert.match(
    await player.evaluate((audio) => audio.currentSrc),
    new RegExp(sample.id),
  );
  await page.getByRole('button', { name: '停止试听', exact: true }).click();
  assert.equal(await player.evaluate((audio) => audio.paused), true);
  checks.push(
    'authenticated unpublished audio is really loaded/decoded; single-player stop works',
  );
  await page
    .getByRole('button', { name: '编辑 ' + sample.name, exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: '素材显示名称', exact: true })
    .fill('入场你好');
  await dialog
    .getByRole('textbox', { name: '素材标签', exact: true })
    .fill('入场，鼓励');
  await dialog
    .getByRole('button', { name: '保存素材信息', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await input.fill('入场你好');
  await expect(page.getByTestId('voice-asset-' + sample.id)).toBeVisible();
  await page.getByRole('button', { name: '新建', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: '新语音包名称', exact: true })
    .fill('卢音练习包');
  await dialog.getByRole('button', { name: '创建并编排', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const packId = await page
    .getByRole('combobox', { name: '选择语音包', exact: true })
    .inputValue();
  await page
    .getByRole('button', { name: '添加 入场你好 到 进入刷题', exact: true })
    .click();
  await page.getByRole('button', { name: /^普通答对/ }).click();
  await input.fill(second.name);
  await page
    .getByRole('button', {
      name: '添加 ' + second.name + ' 到 普通答对',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: /^连对 2 次/ }).click();
  await input.fill('入场你好');
  await page
    .getByRole('button', { name: '添加 入场你好 到 连对 2 次', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '发布语音包', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect
    .poll(async () => (await get('/admin/voice-packs')).drafts.length)
    .toBe(1);
  assert.equal((await get('/voice-packs')).packs.length, 0);
  checks.push(
    'asset rename/tags/search and multi-scene draft save work without premature publication',
  );
  for (const name of ['入场你好', second.name]) {
    await input.fill(name);
    await page
      .getByRole('checkbox', { name: '选择 ' + name, exact: true })
      .check();
  }
  await page.getByRole('button', { name: '标记已试听', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '发布语音包', exact: true }),
  ).toBeEnabled();
  await input.fill('');
  await page.getByRole('button', { name: '进入刷题', exact: true }).click();
  await expect
    .poll(() => player.evaluate((audio) => audio.currentSrc))
    .toContain(sample.id);
  await page
    .getByRole('button', { name: '答对 · 连对＋1', exact: true })
    .click();
  await expect(page.getByText('1 连对', { exact: true })).toBeVisible();
  await expect
    .poll(() => player.evaluate((audio) => audio.currentSrc))
    .toContain(second.id);
  await page
    .getByRole('button', { name: '答对 · 连对＋1', exact: true })
    .click();
  await expect(page.getByText('2 连对', { exact: true })).toBeVisible();
  await expect
    .poll(() => player.evaluate((audio) => audio.currentSrc))
    .toContain(sample.id);
  await page.getByRole('button', { name: '答错清零', exact: true }).click();
  await expect(page.getByText('0 连对', { exact: true })).toBeVisible();
  assert.equal(await player.evaluate((audio) => audio.paused), true);
  checks.push(
    'simulator uses distinct entry/correct/streak cues and wrong answer resets without stacking audio',
  );
  await page.getByRole('button', { name: '发布语音包', exact: true }).click();
  await expect
    .poll(async () => (await get('/voice-packs')).packs.length)
    .toBe(1);
  await page.getByRole('button', { name: '设为默认包', exact: true }).click();
  await expect
    .poll(async () => (await get('/voice-packs')).defaultPackId)
    .toBe(packId);
  await expect(page.locator('.ac-voice-stats > div:last-child strong')).toHaveText('卢音练习包');
  await expect(page.getByRole('button', {name:'刷新',exact:true})).toBeEnabled();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('.ac-voice-editor').scrollTop = 0;
  });
  await shot('02-published-editor');
  await page
    .getByRole('textbox', { name: '语音包名称', exact: true })
    .fill('下一版卢音包');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect
    .poll(async () => (await get('/admin/voice-packs')).drafts[0]?.name)
    .toBe('下一版卢音包');
  assert.equal(
    (await get('/voice-packs/' + packId + '/manifest')).name,
    '卢音练习包',
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '让每一次进步，都有回应', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: '选择语音包', exact: true })
    .selectOption(packId);
  await expect(
    page.getByRole('textbox', { name: '语音包名称', exact: true }),
  ).toHaveValue('下一版卢音包');
  checks.push(
    'published default and independent draft remain distinct and survive reload',
  );
  await input.fill('入场你好');
  await page
    .getByRole('button', { name: '编辑 入场你好', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '停用素材', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('正在已发布');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  checks.push(
    'in-use material cannot be disabled accidentally and modal surfaces the server conflict',
  );
  for (const width of [1280, 1024, 760]) {
    await page.setViewportSize({ width, height: 900 });
    await shot('03-layout-' + width);
    const bounds = await page.locator('.ac-voice-library').evaluate((e) => ({
      width: e.clientWidth,
      scroll: e.scrollWidth,
      body: document.body.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(bounds.body <= bounds.viewport + 1, JSON.stringify(bounds));
  }
  checks.push(
    'blue admin layout remains usable at wide and narrow desktop widths',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId('voice-file-input').setInputFiles({
    name: '坏音频.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('<html>invalid audio</html>'),
  });
  await expect(page.getByText(/坏音频.mp3：/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重试失败文件', exact: true }),
  ).toBeVisible();
  checks.push(
    'bad audio remains a visible per-file failure with retry, not a fake success',
  );
  await page.getByRole('button', { name: '重试失败文件', exact: true }).click();
  await expect(page.getByText(/坏音频.mp3：/)).toBeVisible();
  assert.equal((await get('/admin/voice-packs')).assets.length, expected);
  let retryAttempts = 0;
  await page.route('**/api/admin/voice-packs/assets?*', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('name') ===
        '重试测试.wav' &&
      retryAttempts++ === 0
    )
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '合成暂时错误，请重试' }),
      });
    return route.continue();
  });
  await page.getByTestId('voice-file-input').setInputFiles({
    name: '重试测试.wav',
    mimeType: 'audio/wav',
    buffer: fs.readFileSync(
      path.join(root, 'mobile/assets/sounds/answer-correct-warm.wav'),
    ),
  });
  await expect(page.getByText(/合成暂时错误/)).toBeVisible();
  await page.getByRole('button', { name: '重试失败文件', exact: true }).click();
  await expect
    .poll(async () => (await get('/admin/voice-packs')).assets.length)
    .toBe(expected + 1);
  await expect(
    page.getByRole('button', { name: '停止导入', exact: true }),
  ).toHaveCount(0);
  await page.unroute('**/api/admin/voice-packs/assets?*');
  checks.push(
    'transient upload errors retry the same file successfully without duplicated assets',
  );
  let release, intercepted;
  const reached = new Promise((resolve) => (intercepted = resolve)),
    hold = new Promise((resolve) => (release = resolve)),
    cancelNames = [];
  await page.route('**/api/admin/voice-packs/assets?*', async (route) => {
    cancelNames.push(new URL(route.request().url()).searchParams.get('name'));
    if (cancelNames.length === 2) intercepted();
    await hold;
    await route.continue().catch(() => {});
  });
  const cancelFiles = [1, 2, 3].map((i) => {
    const buffer = Buffer.from(
      fs.readFileSync(
        path.join(root, 'mobile/assets/sounds/answer-correct-crisp.wav'),
      ),
    );
    buffer[buffer.length - 1] ^= i;
    return { name: '取消测试' + i + '.wav', mimeType: 'audio/wav', buffer };
  });
  await page.getByTestId('voice-file-input').setInputFiles(cancelFiles);
  await reached;
  await page.getByRole('button', { name: '停止导入', exact: true }).click();
  release();
  await expect(
    page.getByRole('button', { name: '停止导入', exact: true }),
  ).toHaveCount(0);
  await page.unroute('**/api/admin/voice-packs/assets?*');
  assert.equal(
    cancelNames.length,
    2,
    'queued third file is never sent after cancellation',
  );
  await expect(page.getByText(/在途文件可能已入库/).first()).toBeVisible();
  const afterCancel = (await get('/admin/voice-packs')).assets.length;
  assert.ok(
    afterCancel >= expected + 1 && afterCancel <= expected + 3,
    'an aborted in-flight request may already have committed, but queued work stops',
  );
  await page.getByRole('button', { name: '重试失败文件', exact: true }).click();
  await expect
    .poll(async () => (await get('/admin/voice-packs')).assets.length)
    .toBe(expected + 4);
  await expect(
    page.getByRole('button', { name: '停止导入', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '重试失败文件', exact: true }),
  ).toHaveCount(0);
  assert.equal(
    (await get('/admin/voice-packs')).assets.length,
    expected + 4,
    'retry reuses any completed SHA256 upload rather than duplicating it',
  );
  checks.push(
    'cancelling stops queued files, explains possible in-flight commits and retries safely without duplicate content',
  );

  for (const [file, hash] of sourceHashes)
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      hash,
      'original Music file stays unchanged',
    );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, 'result.json'),
    JSON.stringify(
      {
        checks,
        errors,
        assetCount: expected,
        realAudio: !!real,
        screenshots,
        productionDataModified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Admin voice browser checks: ' +
      checks.length +
      '; assets imported: ' +
      expected +
      '; actual decode verified; no production data touched',
  );
} catch (error) {
  if (page) {
    fs.writeFileSync(
      path.join(out, 'failure-dom.txt'),
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    );
    await shot('failure').catch(() => {});
  }
  fs.writeFileSync(
    path.join(out, 'failure.json'),
    JSON.stringify({ error: error.stack, checks, errors }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  await app.locals.stop();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(fs.realpathSync(dir)), parent);
  assert.ok(path.basename(dir).startsWith('admin-voice-browser-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
