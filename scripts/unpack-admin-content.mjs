import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { batchSchema } from "../server/content-quality/contracts.js";
import { digest, questionPayload } from "../server/content-quality/quality.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2),
  flags = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (
    !["--file", "--out"].includes(args[i]) ||
    !args[i + 1] ||
    flags.has(args[i])
  )
    throw new Error(
      "用法：node scripts/unpack-admin-content.mjs --file <发布包.json> --out tmp/<隔离目录>",
    );
  flags.set(args[i], args[i + 1]);
}
if (!flags.has("--file") || !flags.has("--out"))
  throw new Error("必须指定 --file 和 --out");
const file = path.resolve(flags.get("--file"));
if (fs.statSync(file).size > 16 * 1024 * 1024)
  throw new Error("发布包超过 16MB");
const packet = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
if (
  packet.schemaVersion !== 1 ||
  packet.stage !== "prepared" ||
  packet.activeBankWritten !== false
)
  throw new Error("不是后台导出的待接入发布包");
const data = packet.auditInputs,
  batch = batchSchema.parse(data?.batch);
if (
  !Array.isArray(data.questions) ||
  !data.questions.length ||
  !Array.isArray(packet.files?.["questions.json"])
)
  throw new Error("缺少候选题和已准备题目");
if (
  digest(data.questions.map(questionPayload)) !==
  digest(packet.files["questions.json"].map(questionPayload))
)
  throw new Error("候选题与准备题目不一致，拒绝解包");
const requested = path.resolve(root, flags.get("--out"));
if (fs.existsSync(requested))
  throw new Error("目标目录已存在，请使用新的隔离目录");
let ancestor = path.dirname(requested);
const suffix = [path.basename(requested)];
while (!fs.existsSync(ancestor)) {
  suffix.unshift(path.basename(ancestor));
  ancestor = path.dirname(ancestor);
}
const actual = path.resolve(fs.realpathSync(ancestor), ...suffix),
  relative = path.relative(fs.realpathSync(root), actual);
if (
  path.isAbsolute(relative) ||
  relative.startsWith("..") ||
  !["tmp", "outputs"].includes(relative.split(path.sep)[0]) ||
  relative.split(path.sep).length < 2
)
  throw new Error("解包目标必须在本仓库 tmp/ 或 outputs/ 的新子目录中");
for (const name of ["questions.json", "manifest-bank.json", "integration.json"])
  if (!packet.files[name]) throw new Error("缺少 " + name);
fs.mkdirSync(actual, { recursive: true });
const write = (name, value) =>
  fs.writeFileSync(
    path.join(actual, name),
    JSON.stringify(value, null, 2) + "\n",
    { flag: "wx" },
  );
for (const name of [
  "batch",
  "questions",
  "sources",
  "provenance",
  "reviews",
  "blueprint",
])
  write(name + ".json", data[name] ?? (name === "blueprint" ? null : []));
if (data.manifest) write("manifest.proposed.json", data.manifest);
if (data.guide) write("guide.json", data.guide);
fs.mkdirSync(path.join(actual, "prepared"));
for (const name of ["questions.json", "manifest-bank.json", "integration.json"])
  write("prepared/" + name, packet.files[name]);
write(
  "quality-report.exported.json",
  packet.files["quality-report.json"] || {},
);
console.log(
  JSON.stringify(
    {
      ok: true,
      batch: batch.runId,
      directory: actual,
      activeBankWritten: false,
      next: [
        "运行现有 pipeline check 与 prepare，重新核对当前代码和题库下的结果。",
        "按 prepared/integration.json 接入，再执行 verify 与 exam-smoke。",
        "此步骤仅解包，不代表审核通过或线上生效。",
      ],
    },
    null,
    2,
  ),
);
