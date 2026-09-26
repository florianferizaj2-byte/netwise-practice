import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function mobileModules(t, storage) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-mobile-test-'));
  const files = [
    'api/resourceCache',
    'api/cachePolicy',
    'api/transport',
    'api/communityMessages',
    'api/client',
    'version',
  ];
  for (const file of files) {
    const source = fs.readFileSync(
      new URL(`../mobile/src/${file}.ts`, import.meta.url),
      'utf8',
    );
    const code = stripTypeScriptTypes(source, { mode: 'transform' })
      .replace(
        /from ['"]\.\.?\/([^'"]+)['"]/g,
        (_, name) => `from './${name.split('/').pop()}.mjs'`,
      )
      .replaceAll(
        "'@react-native-async-storage/async-storage'",
        "'./storage.mjs'",
      )
      .replaceAll(
        '"@react-native-async-storage/async-storage"',
        "'./storage.mjs'",
      )
      .replaceAll("'expo/fetch'", "'./stream.mjs'")
      .replaceAll('"expo/fetch"', "'./stream.mjs'");
    fs.writeFileSync(path.join(dir, `${file.split('/').pop()}.mjs`), code);
  }
  globalThis.__aceexamTestStorage = storage;
  fs.writeFileSync(
    path.join(dir, 'storage.mjs'),
    'export default globalThis.__aceexamTestStorage;',
  );
  fs.writeFileSync(
    path.join(dir, 'stream.mjs'),
    'export const fetch = (...args) => globalThis.fetch(...args);',
  );
  t.after(() => {
    if (
      path.dirname(dir) !== path.resolve(os.tmpdir()) ||
      !path.basename(dir).startsWith('aceexam-mobile-test-')
    )
      throw new Error('Unsafe test cleanup');
    fs.rmSync(dir, { recursive: true, force: true });
    delete globalThis.__aceexamTestStorage;
  });
  return async (name) =>
    import(pathToFileURL(path.join(dir, `${name}.mjs`)).href);
}

export function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    async multiRemove(keys) {
      keys.forEach((key) => values.delete(key));
    },
  };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export const tick = () => new Promise((resolve) => setImmediate(resolve));
