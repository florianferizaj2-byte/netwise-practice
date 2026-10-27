import { spawnSync } from 'node:child_process';
import { verificationEnvironment } from './verification-env.mjs';
const isolated = verificationEnvironment(process.env, {
  temporaryParent: 'tmp',
});
try {
  const env = { ...isolated.env };
  for (const key of ['VOICE_LIBRARY_REAL_DIRS', 'VOICE_LIBRARY_CASE_DIR'])
    if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      './test/helpers/local-http-only.js',
      'test/admin-voice-library.e2e.js',
    ],
    { env, stdio: 'inherit', windowsHide: true, timeout: 240000 },
  );
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  isolated.cleanup();
}
