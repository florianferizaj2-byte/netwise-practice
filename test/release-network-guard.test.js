import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("release HTTP guard permits loopback fixtures and rejects external URLs before forwarding", () => {
  const script = `
    import assert from 'node:assert/strict';
    let forwarded = 0;
    globalThis.fetch = async () => { forwarded++; return { fixture: true }; };
    await import('./test/helpers/local-http-only.js');
    for (const url of ['http://127.0.0.1:1234/api', 'http://localhost:2345/api', 'http://127.0.0.2/api', 'http://[::1]:3456/api'])
      assert.equal((await fetch(url)).fixture, true);
    for (const url of ['https://api.example.test/v1/chat/completions', 'https://localhost.example.test', 'http://127.0.0.1.example.test'])
      assert.throws(() => fetch(url), /refuses non-local/);
    assert.equal(forwarded, 4);
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
});
