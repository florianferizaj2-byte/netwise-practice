import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
const mobile = JSON.parse(
  fs.readFileSync(path.join(root, "mobile/package.json"), "utf8"),
);
const build = JSON.parse(
  fs.readFileSync(path.join(root, "dist/app/version.json"), "utf8"),
);
if (build.version !== mobile.version)
  throw new Error("移动网页构建版本与源码不一致，请先重新构建");
const version = mobile.version;
const commit = git("rev-parse", "HEAD");
if (git("status", "--porcelain", "--untracked-files=no"))
  throw new Error("请先提交已核对的发布源码，再制作更新包");
const apkName = `kaojiang-v${version}.apk`;
const apk = path.join(root, "public/downloads", apkName);
const apkHash = createHash("sha256").update(fs.readFileSync(apk)).digest("hex");
if (fs.readFileSync(`${apk}.sha256`, "utf8").split(/\s+/)[0] !== apkHash)
  throw new Error("APK 校验文件不匹配");
if (
  !fs
    .readFileSync(path.join(root, "dist/downloads", apkName))
    .equals(fs.readFileSync(apk))
)
  throw new Error("网页中的 APK 与正式安装包不一致");
const output = path.join(root, "outputs/releases", `v${version}`);
fs.mkdirSync(output, { recursive: true });
const staging = fs.mkdtempSync(path.join(output, "runtime-"));
const filesAt = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`发布目录不允许符号链接：${entry.name}`);
    return entry.isDirectory() ? filesAt(filename) : [filename];
  });
try {
  const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
  const runtimeSources = tracked.filter(
    (file) =>
      file.startsWith("server/") ||
      file.startsWith("public/question-images/") ||
      [
        "package.json",
        "package-lock.json",
        "README.md",
        `docs/release-v${version}.md`,
        "docs/reliability-improvements.md",
        "docs/author-ai-service.md",
      ].includes(file),
  );
  const compiled = filesAt(path.join(root, "dist"))
    .map((file) => path.relative(root, file).split(path.sep).join("/"))
    .filter(
      (file) =>
        !file.startsWith("dist/downloads/") ||
        [apkName, `${apkName}.sha256`].includes(path.basename(file)),
    );
  const forbidden =
    /(^|\/)(\.env[^/]*|node_modules|data|uploads|drafts|\.git)(\/|$)|\.(db|sqlite|sqlite3|jks|keystore|pem|key|properties)$/i;
  for (const file of [...runtimeSources, ...compiled]) {
    if (forbidden.test(file))
      throw new Error(`禁止打包私有或开发文件：${file}`);
    if (
      !/^(server\/|public\/question-images\/|dist\/|docs\/|package(?:-lock)?\.json$|README\.md$)/.test(
        file,
      )
    )
      throw new Error(`非运行时文件：${file}`);
    const destination = path.resolve(staging, file);
    if (!destination.startsWith(path.resolve(staging) + path.sep))
      throw new Error("发布文件路径越界");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  fs.writeFileSync(
    path.join(staging, "release-manifest.json"),
    JSON.stringify(
      {
        version,
        commit,
        webBuildId: build.buildId,
        apkSha256: apkHash,
        createdAt: new Date().toISOString(),
        deployment:
          "Merge into the existing project, preserve .env, DATA_DIR and user uploads, install production dependencies, then restart.",
      },
      null,
      2,
    ) + "\n",
  );
  const files = filesAt(staging)
    .map((file) => path.relative(staging, file).split(path.sep).join("/"))
    .sort();
  const archiveName = `kaojiang-server-v${version}-${build.buildId}.tgz`;
  const archive = path.join(output, archiveName);
  if (fs.existsSync(archive))
    throw new Error("同版本更新包已存在，请核对后再处理");
  execFileSync("tar", ["-czf", archive, "-C", staging, "."], {
    windowsHide: true,
  });
  const entries = execFileSync("tar", ["-tzf", archive], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
    .split(/\r?\n/)
    .filter((entry) => entry && !entry.endsWith("/"))
    .map((entry) => entry.replace(/^\.\//, ""))
    .sort();
  if (JSON.stringify(entries) !== JSON.stringify(files))
    throw new Error("更新包内容与文件清单不一致");
  const checksum = createHash("sha256")
    .update(fs.readFileSync(archive))
    .digest("hex");
  fs.writeFileSync(`${archive}.sha256`, `${checksum}  ${archiveName}\n`);
  fs.writeFileSync(`${archive}.files.txt`, files.join("\n") + "\n");
  fs.copyFileSync(apk, path.join(output, apkName));
  fs.copyFileSync(`${apk}.sha256`, path.join(output, `${apkName}.sha256`));
  const notes = path.join(output, `release-v${version}.md`);
  fs.copyFileSync(path.join(root, `docs/release-v${version}.md`), notes);
  const manifest = {
    version,
    commit,
    webBuildId: build.buildId,
    notes,
    assets: [
      path.join(output, apkName),
      path.join(output, `${apkName}.sha256`),
      archive,
      `${archive}.sha256`,
      `${archive}.files.txt`,
      notes,
    ],
    archiveSha256: checksum,
    apkSha256: apkHash,
  };
  fs.writeFileSync(
    path.join(output, "upload-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        ...manifest,
        runtimeFiles: files.length,
        archiveBytes: fs.statSync(archive).size,
        apkBytes: fs.statSync(apk).size,
      },
      null,
      2,
    ),
  );
} finally {
  const absolute = path.resolve(staging);
  if (
    path.dirname(absolute) !== path.resolve(output) ||
    !path.basename(absolute).startsWith("runtime-")
  )
    throw new Error("临时发布目录校验失败");
  fs.rmSync(absolute, { recursive: true, force: true });
}
