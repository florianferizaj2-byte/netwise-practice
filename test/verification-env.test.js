import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { verificationEnvironment } from "../scripts/verification-env.mjs";

test("release tests reject developer credentials and personal data and own their dotenv and compiler scratch directory", () => {
  const isolated = verificationEnvironment({
    PATH: "fixture-path",
    CI: "true",
    AI_SERVICE_API_KEY: "must-not-inherit",
    AUTHOR_API_KEY: "must-not-inherit",
    SMTP_PASS: "must-not-inherit",
    DATA_DIR: "personal-data",
    DOTENV_CONFIG_PATH: "private.env",
    AUTH_EMAIL_VERIFICATION_ENABLED: "1",
    NODE_OPTIONS: "--import=untrusted.js",
  });
  const directory = isolated.env.TEMP;
  try {
    for (const key of [
      "AI_SERVICE_API_KEY",
      "AUTHOR_API_KEY",
      "SMTP_PASS",
      "DATA_DIR",
      "NODE_OPTIONS",
    ])
      assert(!Object.hasOwn(isolated.env, key));
    assert.equal(isolated.env.PATH, "fixture-path");
    assert.equal(isolated.env.CI, "true");
    assert.equal(isolated.env.AUTH_EMAIL_VERIFICATION_ENABLED, "0");
    assert.equal(Buffer.from(isolated.env.AI_MASTER_KEY, "base64").length, 32);
    assert.equal(fs.readFileSync(isolated.env.DOTENV_CONFIG_PATH, "utf8"), "");
    assert.equal(path.dirname(isolated.env.DOTENV_CONFIG_PATH), directory);
    fs.writeFileSync(
      path.join(directory, "compiler-scratch.txt"),
      "temporary artifact",
    );
  } finally {
    isolated.cleanup();
  }
  assert(!fs.existsSync(directory));
  isolated.cleanup();
});

test("an explicit compiler scratch parent is honored and cleanup preserves its siblings", () => {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "ace-verification-test-"));
  fs.writeFileSync(path.join(root, "keep.txt"), "keep");
  try {
    const isolated = verificationEnvironment({}, { temporaryParent: root });
    assert.equal(path.dirname(isolated.env.TEMP), root);
    isolated.cleanup();
    assert.equal(fs.readFileSync(path.join(root, "keep.txt"), "utf8"), "keep");
  } finally {
    assert.equal(path.dirname(root), parent);
    assert(path.basename(root).startsWith("ace-verification-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
