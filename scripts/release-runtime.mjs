import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const slash = (value) => value.split(path.sep).join("/");
const privateFile =
  /(^|\/)(\.env[^/]*|node_modules|data|uploads|drafts|\.git)(\/|$)|\.(db|sqlite|sqlite3|jks|keystore|pem|key|properties)$/i;
const provenanceFile = "dist/build-provenance.json";

export function filesBelow(root, relative) {
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(path.resolve(root) + path.sep))
    throw new Error(`发布文件路径越界：${relative}`);
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink())
    throw new Error(`发布目录不允许符号链接：${relative}`);
  if (!stat.isDirectory()) return [slash(relative)];
  return fs
    .readdirSync(filename)
    .sort()
    .flatMap((name) => filesBelow(root, path.join(relative, name)));
}

export function isRuntimeSource(file, version) {
  return (
    !file.split("/").includes("drafts") &&
    (file.startsWith("server/") ||
      file.startsWith("public/question-images/") ||
      [
        "package.json",
        "package-lock.json",
        "README.md",
        `docs/release-v${version}.md`,
        `docs/DEPLOY-v${version}.md`,
        "docs/MOBILE-ADMIN-ANNOUNCEMENTS.md",
        "docs/ROUTE-PLAYER-INTEGRATION.md",
        "docs/reliability-improvements.md",
        "docs/author-ai-service.md",
        "docs/web-next-release.md",
        "docs/account-email-verification.md",
      ].includes(file))
  );
}

export function assertRuntimePath(file) {
  if (
    file.includes("\\") ||
    file.split("/").some((part) => part === ".." || part === ".") ||
    path.posix.isAbsolute(file)
  )
    throw new Error(`发布文件路径越界：${file}`);
  if (privateFile.test(file) || /^dist\/demo(?:\/|$)/i.test(file))
    throw new Error(`禁止打包私有或开发文件：${file}`);
  if (
    !/^(server\/|public\/question-images\/|dist\/|docs\/|package(?:-lock)?\.json$|README\.md$)/.test(
      file,
    )
  )
    throw new Error(`非运行时文件：${file}`);
}

function existingFiles(root, entries) {
  return entries.flatMap((entry) =>
    fs.existsSync(path.join(root, entry)) ? filesBelow(root, entry) : [],
  );
}

export function runtimeSources(root, version) {
  return existingFiles(root, [
    "server",
    "public/question-images",
    "docs",
    "package.json",
    "package-lock.json",
    "README.md",
  ])
    .filter((file) => isRuntimeSource(file, version))
    .sort();
}

export function runtimeArtifacts(root, version) {
  const apk = `kaojiang-v${version}.apk`;
  return filesBelow(root, "dist")
    .filter(
      (file) =>
        file !== provenanceFile &&
        (!file.startsWith("dist/downloads/") ||
          [apk, `${apk}.sha256`].includes(path.basename(file))),
    )
    .sort();
}

export function buildInputs(root) {
  // Only source consumed by the Web builds. Native build directories, caches,
  // local demo answer keys and downloaded APKs are deliberately not inputs.
  return existingFiles(root, [
    "src",
    "public",
    "server",
    "mobile/src",
    "mobile/assets",
    "mobile/public",
    "mobile/pwa",
    "mobile/modules",
    "mobile/plugins",
    "index.html",
    "vite.config.js",
    "package.json",
    "package-lock.json",
    "mobile/App.tsx",
    "mobile/index.ts",
    "mobile/app.config.js",
    "mobile/app.json",
    "mobile/package.json",
    "mobile/package-lock.json",
    "mobile/tsconfig.json",
    "scripts/build.mjs",
    "scripts/build-mobile-web.mjs",
    "scripts/check-mobile-version.mjs",
    "scripts/release-runtime.mjs",
    "scripts/package-release.mjs",
  ])
    .filter(
      (file) =>
        !privateFile.test(file) &&
        !/^public\/(demo|downloads)(\/|$)/.test(file) &&
        !/^mobile\/modules\/[^/]+\/(android|ios)(\/|$)/.test(file) &&
        !/^mobile\/(modules|plugins)\/.*\.(md|gradle|kt|java)$/i.test(file) &&
        !/^mobile\/modules\/[^/]+\/LICENSE$/.test(file),
    )
    .sort();
}

export function fingerprint(root, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    // JSON encoding separates path names and digests unambiguously.
    const digest = createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex");
    hash.update(JSON.stringify([file, digest]) + "\n");
  }
  return { sha256: hash.digest("hex"), files: files.length };
}

export function sourceSnapshot(root) {
  return fingerprint(root, buildInputs(root));
}

export function writeBuildProvenance(root, before) {
  const after = sourceSnapshot(root);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("构建期间源码发生变化，请重新完整构建");
  const { version } = JSON.parse(
    fs.readFileSync(path.join(root, "mobile/package.json"), "utf8"),
  );
  const artifacts = runtimeArtifacts(root, version);
  artifacts.forEach(assertRuntimePath);
  const manifest = {
    schemaVersion: 1,
    version,
    source: after,
    artifacts: fingerprint(root, artifacts),
  };
  fs.writeFileSync(
    path.join(root, provenanceFile),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

export function assertBuildProvenance(root) {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(root, "mobile/package.json"), "utf8"),
  );
  if (!fs.existsSync(path.join(root, provenanceFile)))
    throw new Error("缺少完整构建校验记录，请先运行 npm run build");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, provenanceFile), "utf8"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.version !== version ||
    JSON.stringify(manifest.source) !== JSON.stringify(sourceSnapshot(root))
  )
    throw new Error("源码与构建记录不一致，请先重新完整构建");
  const artifacts = runtimeArtifacts(root, version);
  artifacts.forEach(assertRuntimePath);
  for (const file of [
    "dist/index.html",
    "dist/app/index.html",
    "dist/app/version.json",
  ])
    if (!artifacts.includes(file)) throw new Error(`构建产物缺失：${file}`);
  if (
    JSON.stringify(manifest.artifacts) !==
    JSON.stringify(fingerprint(root, artifacts))
  )
    throw new Error("构建产物已变化或缺失，请先重新完整构建");
  return manifest;
}

export function assertTrackedReleaseInputs(root, tracked, version) {
  const required = new Set([
    ...buildInputs(root),
    ...runtimeSources(root, version),
    ...existingFiles(root, [
      "test",
      "scripts/verify.mjs",
      "scripts/verify-web-blue.mjs",
    ]),
  ]);
  const known = new Set(tracked);
  const missing = [...required].filter((file) => !known.has(file));
  if (missing.length)
    throw new Error(
      `发布所需文件尚未纳入版本记录（${missing.length} 个），请先逐项核对：\n${missing.slice(0, 12).join("\n")}`,
    );
  for (const file of runtimeSources(root, version)) assertRuntimePath(file);
}
