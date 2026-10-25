import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verificationEnvironment } from './verification-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const isolated = verificationEnvironment(process.env, { temporaryParent: path.join(root, 'tmp') });
const tests = [
  'mobile-backend-contract', 'ai-points-api', 'ai-points-receipt', 'ai-points-migration',
  'ai-points-account', 'ai-points-services', 'ai-points', 'ai-points-runtime',
  'ai-service-channels', 'account-security', 'account-email-toggle', 'account-recovery',
  'location-learning', 'mobile-profile', 'mobile-release-policy', 'admin-console',
];
let result;
try {
  result = spawnSync(process.execPath, [
    '--import', './test/helpers/local-http-only.js', '--test', '--test-concurrency=4', '--test-timeout=120000',
    ...tests.map(name => `test/${name}.test.js`),
  ], { cwd: root, env: isolated.env, stdio: 'inherit', windowsHide: true, timeout: 600000 });
} finally {
  isolated.cleanup();
}
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
