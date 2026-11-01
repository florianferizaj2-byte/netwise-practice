import fs from 'node:fs';
import path from 'node:path';
import { Config } from '@remotion/cli/config';

// Reuse Playwright's headless shell when present; the Remotion CDN download stalls on this network.
const localShell = path.join(
  process.env.LOCALAPPDATA ?? '',
  'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe',
);
if (fs.existsSync(localShell)) Config.setBrowserExecutable(localShell);

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(18);
