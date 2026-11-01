import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  assertBuildProvenance,
  assertRuntimePath,
  assertTrackedReleaseInputs,
  buildInputs,
  filesBelow,
  runtimeSources,
  sourceSnapshot,
  writeBuildProvenance,
} from "../scripts/release-runtime.mjs";

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "ace-release-gates-"));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  for (const [file, content] of Object.entries({
    "package.json": '{"type":"module"}',
    "package-lock.json": "{}",
    "mobile/package.json": '{"version":"0.0.1"}',
    "src/main.jsx": "source",
    "server/index.js": "server",
    "dist/index.html": "desktop",
    "dist/app/index.html": "mobile",
    "dist/app/version.json": '{"version":"0.0.1","buildId":"fixture"}',
    "dist/assets/main.js": "compiled",
    "README.md": "readme",
    "docs/web-next-release.md": "release",
  }))
    write(file, content);
  t.after(() => {
    assert.equal(path.dirname(root), parent);
    assert(path.basename(root).startsWith("ace-release-gates-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, write };
}

test("packaging refuses untracked runtime modules, question banks and Web sources without blocking unrelated drafts", (t) => {
  const { root, write } = fixture(t);
  const tracked = [
    ...new Set([...buildInputs(root), ...runtimeSources(root, "0.0.1")]),
  ];
  write("server/question-banks/c/manifest.json", "{}");
  write("server/new-runtime.js", "required");
  write("src/new-view.jsx", "required");
  write("scripts/verify-web-blue.mjs", "required checks");
  write("test/helpers/local-http-only.js", "required network guard");
  write("server/question-banks/c/drafts/private.json", "unreviewed");
  write("public/demo/home-blue/private.json", "demo keys");
  write("outputs/personal.txt", "unrelated");
  write("mobile/modules/example/android/src/Module.kt", "native-only source");
  assert.throws(
    () => assertTrackedReleaseInputs(root, tracked, "0.0.1"),
    /尚未纳入版本记录/,
  );
  assert.throws(
    () =>
      assertTrackedReleaseInputs(
        root,
        [
          ...tracked,
          "server/question-banks/c/manifest.json",
          "server/new-runtime.js",
          "src/new-view.jsx",
        ],
        "0.0.1",
      ),
    /尚未纳入版本记录/,
  );
  assertTrackedReleaseInputs(
    root,
    [
      ...tracked,
      "server/question-banks/c/manifest.json",
      "server/new-runtime.js",
      "src/new-view.jsx",
      "scripts/verify-web-blue.mjs",
      "test/helpers/local-http-only.js",
    ],
    "0.0.1",
  );
  assert(
    !runtimeSources(root, "0.0.1").some((file) => file.includes("drafts")),
  );
  assert(!buildInputs(root).some((file) => file.includes("private.json")));
  assert(!buildInputs(root).some((file) => file.endsWith("Module.kt")));
});

test("full build provenance detects stale sources, changed assets, missing mobile output and changes during build", (t) => {
  const { root, write } = fixture(t);
  writeBuildProvenance(root, sourceSnapshot(root));
  assertBuildProvenance(root);
  write("src/main.jsx", "changed");
  assert.throws(() => assertBuildProvenance(root), /源码与构建记录不一致/);
  writeBuildProvenance(root, sourceSnapshot(root));
  write("dist/assets/main.js", "changed output");
  assert.throws(() => assertBuildProvenance(root), /构建产物已变化/);
  writeBuildProvenance(root, sourceSnapshot(root));
  fs.unlinkSync(path.join(root, "dist/app/index.html"));
  assert.throws(() => assertBuildProvenance(root), /构建产物缺失/);
  const before = sourceSnapshot(root);
  write("mobile/src/new.ts", "changed while building");
  assert.throws(
    () => writeBuildProvenance(root, before),
    /构建期间源码发生变化/,
  );
});

test("release rejects private artifacts, demo answers, traversal and symlink directories", (t) => {
  const { root, write } = fixture(t);
  for (const filename of [
    "dist/demo/home-blue/answers.json",
    "server/.env",
    "server/key.pem",
    "dist/data/backup.sqlite",
  ])
    assert.throws(() => assertRuntimePath(filename), /禁止打包/);
  assert.throws(() => filesBelow(root, "../outside"), /路径越界/);
  assert.throws(() => assertRuntimePath("dist/../answers.json"), /路径越界/);
  writeBuildProvenance(root, sourceSnapshot(root));
  write("dist/demo/home-blue/answers.json", "private answers");
  assert.throws(() => assertBuildProvenance(root), /禁止打包/);
  write("safe-target/value.js", "not a release file");
  fs.symlinkSync(
    path.join(root, "safe-target"),
    path.join(root, "server", "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(() => runtimeSources(root, "0.0.1"), /不允许符号链接/);
});

test("actual archive command requires committed sources and current artifacts, then carries every runtime file", (t) => {
  const { root, write } = fixture(t);
  for (const file of ["package-release.mjs", "release-runtime.mjs"])
    write(
      `scripts/${file}`,
      fs.readFileSync(new URL(`../scripts/${file}`, import.meta.url)),
    );
  write("docs/release-v0.0.1.md", "Fixture release only");
  write("docs/DEPLOY-v0.0.1.md", "Keep user data");
  write("public/question-images/fixture.svg", "<svg/>");
  const apk = "kaojiang-v0.0.1.apk",
    bytes = "Fixture bytes, not a real Android APK";
  const apkHash = crypto.createHash("sha256").update(bytes).digest("hex");
  for (const prefix of ["public/downloads", "dist/downloads"]) {
    write(`${prefix}/${apk}`, bytes);
    write(`${prefix}/${apk}.sha256`, `${apkHash}  ${apk}\n`);
  }
  write(".gitignore", "dist/\noutputs/\npublic/downloads/\n");
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "pipe" });
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Release Fixture",
      "-c",
      "user.email=release@example.test",
      "commit",
      "-m",
      "fixture",
    );
  };
  const command = () =>
    spawnSync(process.execPath, ["scripts/package-release.mjs"], {
      cwd: root,
      windowsHide: true,
      encoding: "utf8",
    });
  git("init", "--quiet");
  commit();
  writeBuildProvenance(root, sourceSnapshot(root));
  write("server/question-banks/new/manifest.json", "{}");
  let result = command();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /尚未纳入版本记录/);
  assert(!fs.existsSync(path.join(root, "outputs")));
  commit();
  result = command();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /源码与构建记录不一致/);
  writeBuildProvenance(root, sourceSnapshot(root));
  result = command();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mobileWebBuildId, "fixture");
  assert.match(report.webBuildId, /^[a-f0-9]{16}$/);
  const archive = report.assets.find((file) => file.endsWith(".tgz"));
  const actual = execFileSync("tar", ["-tzf", archive], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.match(actual, /server\/question-banks\/new\/manifest.json/);
  assert.match(actual, /dist\/build-provenance.json/);
  assert.match(actual, /docs\/DEPLOY-v0.0.1.md/);
  assert(!actual.includes("node_modules"));
  assert(!actual.includes("dist/demo"));
  const archiveHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(archive))
    .digest("hex");
  assert.equal(report.archiveSha256, archiveHash);
  assert(archive.includes(report.webBuildId));
  const duplicate = command();
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /更新包已存在/);
  // Desktop-only changes must produce a new archive while preserving the App build.
  write("src/main.jsx", "updated desktop source");
  write("dist/assets/main.js", "updated desktop output");
  commit();
  writeBuildProvenance(root, sourceSnapshot(root));
  const updated = command();
  assert.equal(updated.status, 0, updated.stderr);
  const newer = JSON.parse(updated.stdout);
  assert.notEqual(newer.webBuildId, report.webBuildId);
  assert.equal(newer.mobileWebBuildId, report.mobileWebBuildId);
  assert.notEqual(
    newer.assets.find((file) => file.endsWith(".tgz")),
    archive,
  );
  assert(fs.existsSync(archive), "The earlier checked archive is retained");
});
