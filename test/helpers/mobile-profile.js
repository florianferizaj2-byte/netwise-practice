import fs from 'node:fs';
import { createMobileProfileService } from '../../server/mobile-profile.js';
export const avatarBytes = fs.readFileSync(new URL('../fixtures/avatar.png', import.meta.url));
export const avatarImage = { mimeType: 'image/png', data: avatarBytes.toString('base64') };
export function completeFixtureProfile(store, user) {
  return createMobileProfileService(store).save(user.id, { name: (user.communityName || user.username).slice(0, 24), image: avatarImage });
}
export async function finishProfileForm(page, name) {
  await page.getByRole('textbox', { name: '名字', exact: true }).fill(name);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择头像', exact: true }).click();
  await (await chooser).setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: avatarBytes });
  await page.getByRole('button', { name: '选择头像', exact: true }).locator('img').waitFor({ state: 'attached' });
  const saved = page.waitForResponse((response) => response.url().endsWith('/api/auth/profile') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存并继续', exact: true }).click();
  const response = await saved;
  if (!response.ok()) throw new Error('Profile fixture save failed: ' + response.status());
}

export async function dismissLaunchAnnouncement(page) {
  await page.getByTestId('announcement-ready').waitFor({ state: 'attached' });
  const notice = page.getByTestId('launch-announcement');
  if (await notice.isVisible()) {
    await notice.getByRole('button', { name: '关闭公告', exact: true }).click();
    await notice.waitFor({ state: 'detached' });
  }
}
