import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { questionSchema } from "../domain.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sourceId = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const guideSchema = z
  .object({
    schemaVersion: z.literal(1),
    verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    badge: z.string().min(2).max(40),
    title: z.string().min(2).max(100),
    subtitle: z.string().min(2).max(200),
    overview: z.string().min(20).max(1000),
    facts: z
      .array(
        z
          .object({
            label: z.string().min(1).max(30),
            value: z.string().min(1).max(100),
            note: z.string().min(1).max(300),
          })
          .strict(),
      )
      .min(4)
      .max(8),
    schedule: z
      .object({
        title: z.string().min(1).max(50),
        status: z.string().min(1).max(50),
        items: z
          .array(
            z
              .object({
                date: z.string().min(1).max(40),
                title: z.string().min(1).max(100),
                detail: z.string().min(1).max(500),
              })
              .strict(),
          )
          .min(1)
          .max(8),
        note: z.string().min(1).max(500),
      })
      .strict(),
    examDetails: z
      .array(
        z
          .object({
            label: z.string().min(1).max(40),
            value: z.string().min(1).max(120),
            detail: z.string().min(1).max(500).optional(),
          })
          .strict(),
      )
      .min(4)
      .max(12),
    knowledgeAreas: z
      .array(
        z
          .object({
            name: z.string().min(1).max(80),
            topics: z.array(z.string().min(1).max(80)).min(1).max(12),
          })
          .strict(),
      )
      .min(4)
      .max(24),
    career: z
      .object({
        positioning: z.string().min(10).max(500),
        bestFor: z.array(z.string().min(2).max(120)).min(2).max(10),
        roles: z.array(z.string().min(2).max(80)).min(2).max(12),
        value: z.array(z.string().min(2).max(200)).min(2).max(10),
        limitations: z.array(z.string().min(2).max(200)).min(1).max(10),
      })
      .strict(),
    mustKnow: z.array(z.string().min(5).max(300)).min(3).max(12),
    sources: z
      .array(
        z
          .object({
            name: z.string().min(2).max(100),
            url: z.string().url(),
            scope: z.string().min(2).max(200),
          })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();

function filesAt(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(root) + path.sep))
    throw new Error("题库路径不能超出 question-banks 目录");
  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [resolved];
  return fs
    .readdirSync(resolved, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesAt(path.join(resolved, entry.name))
        : entry.name.endsWith(".json")
          ? [path.join(resolved, entry.name)]
          : [],
    );
}

function validateManifest(manifest, directory) {
  if (
    manifest.schemaVersion !== 1 ||
    !slug.test(manifest.certificate?.id || "") ||
    !manifest.certificate?.name ||
    !manifest.certificate?.shortName ||
    !manifest.certificate?.description ||
    !Array.isArray(manifest.banks) ||
    !manifest.banks.length
  )
    throw new Error(`证书题库清单不合法：${directory}`);
  if (path.basename(directory) !== manifest.certificate.id)
    throw new Error(`题库目录名必须与证书 ID 一致：${directory}`);
  const sources = new Set();
  for (const bank of manifest.banks) {
    if (
      !slug.test(bank.id || "") ||
      !sourceId.test(bank.source || "") ||
      !bank.name ||
      !bank.path
    )
      throw new Error(`题库分组配置不合法：${directory}`);
    if (sources.has(bank.source))
      throw new Error(`题库来源重复：${bank.source}`);
    sources.add(bank.source);
  }
  if (manifest.syllabus) {
    const { version, scopeStatus, sourceUrls, modules } = manifest.syllabus;
    if (
      !version ||
      scopeStatus !== "officially_verified" ||
      !Array.isArray(sourceUrls) ||
      !sourceUrls.length ||
      !Array.isArray(modules) ||
      !modules.length
    )
      throw new Error(`考试大纲配置不合法：${directory}`);
    const moduleIds = new Set();
    const moduleNames = new Set();
    let totalWeight = 0;
    for (const module of modules) {
      if (
        !slug.test(module.id || "") ||
        !module.name ||
        !Number.isInteger(module.order) ||
        typeof module.weight !== "number" ||
        module.weight <= 0 ||
        !Number.isInteger(module.targetQuestionCount) ||
        module.targetQuestionCount <= 0 ||
        !Array.isArray(module.knowledgePoints) ||
        !module.knowledgePoints.length
      )
        throw new Error(`考试大纲模块配置不合法：${directory}`);
      if (moduleIds.has(module.id) || moduleNames.has(module.name))
        throw new Error(`考试大纲模块重复：${module.id}`);
      moduleIds.add(module.id);
      moduleNames.add(module.name);
      totalWeight += module.weight;
    }
    if (Math.abs(totalWeight - 100) > 0.001)
      throw new Error(`考试大纲练习权重之和必须为 100：${directory}`);
  }
}

const sharedQuestionMarker =
  /共享题干题\s*(?:【题干】)?|【题干】|[（(]共用题干[）)]/g;

function cleanSharedStem(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/^[\s:：,，。；;、-]+|[\s:：,，。；;、-]+$/g, "")
    .trim();
}

function analysisSharedStem(analysis) {
  const text = String(analysis || "");
  let match;
  let last = null;
  for (const candidate of text.matchAll(sharedQuestionMarker)) last = candidate;
  if (!last) return null;
  const stem = cleanSharedStem(text.slice(last.index + last[0].length));
  // A marker without material is common in imperfect recall-question
  // extraction. It is not safe to bind every following question to it.
  return stem.length >= 16 ? stem : null;
}

function questionSharedMarker(question) {
  const match = String(question || "").match(
    /^\s*题共用(题干|备选答案)\)\s*/,
  );
  if (!match) return null;
  return {
    kind: match[1] === "题干" ? "stem" : "options",
    text: String(question).slice(match[0].length).trim(),
  };
}

function sharedStreamKey(question, fallback) {
  const provenance = question.provenance?.[0];
  return [
    provenance?.file || question.sourceLabel || "unknown-source",
    provenance?.sha256 || "",
    question.source || fallback,
  ].join("\u001f");
}

function stableSharedId(kind, stream, anchor) {
  const digest = crypto
    .createHash("sha1")
    .update(`${kind}\u001f${stream}\u001f${anchor}`)
    .digest("hex")
    .slice(0, 16);
  return `vet-shared-${kind}-${digest}`;
}

function commonTextPrefix(values) {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let end = 0;
    while (end < prefix.length && end < value.length && prefix[end] === value[end])
      end += 1;
    prefix = prefix.slice(0, end);
    if (!prefix) break;
  }
  return cleanSharedStem(prefix);
}

function setSharedFields(question, fields) {
  if (question.sharedGroupId) return;
  Object.assign(question, fields);
}

const veterinaryPdfImages = {
  "vet-2026-recall-preventive-00032": {
    src: "/vet-images/dicrocoelium-egg.jpg",
    alt: "歧腔吸虫虫卵显微图",
    caption: "原题 PDF 配图：粪便检查所见虫卵",
  },
  "vet-2026-recall-preventive-00036": {
    src: "/vet-images/trypanosome.jpg",
    alt: "伊氏锥虫血液涂片图",
    caption: "原题 PDF 配图：末梢血液涂片所见虫体",
  },
  "vet-2026-recall-preventive-00038": {
    src: "/vet-images/dipylidium-egg.jpg",
    alt: "犬复孔绦虫虫卵显微图",
    caption: "原题 PDF 配图：犬粪便镜检所见虫卵",
  },
};

function decorateDirectSharedGroups(rows, stream) {
  let active = null;
  const finish = () => {
    if (!active || active.rows.length < 2) return;
    const stem = active.kind === "stem"
      ? commonTextPrefix(active.rows.map((row) => row.marker.text))
      : "";
    active.rows.forEach((row, index) => {
      setSharedFields(row.question, {
        sharedGroupId: active.id,
        sharedKind: active.kind,
        ...(stem ? { sharedStem: stem } : {}),
        sharedOrder: index + 1,
      });
    });
  };

  rows.forEach((row) => {
    const marker = questionSharedMarker(row.question.question);
    if (!marker) {
      finish();
      active = null;
      return;
    }
    const signature = JSON.stringify(row.question.options || {});
    const compatible =
      active &&
      active.lastIndex === row.index - 1 &&
      active.kind === marker.kind &&
      (marker.kind === "options"
        ? active.signature === signature
        : commonTextPrefix([
            ...active.rows.map((item) => item.marker.text),
            marker.text,
          ]).length >= 16);
    if (!compatible) {
      finish();
      active = {
        id: stableSharedId(marker.kind, stream, row.anchor),
        kind: marker.kind,
        signature,
        rows: [],
        lastIndex: row.index,
        anchor: row.anchor,
      };
    }
    active.rows.push({ ...row, marker });
    active.lastIndex = row.index;
  });
  finish();
}

function decorateAnalysisSharedGroups(rows, stream) {
  let pending = null;
  rows.forEach((row) => {
    if (pending) {
      const sourceGap = row.anchor - pending.lastAnchor;
      const belongsToAnotherGroup =
        row.question.sharedGroupId && row.question.sharedGroupId !== pending.id;
      // In the extracted PDFs, the next case marker is stored at the end of
      // the last child question's analysis. Once a stem has been found, every
      // consecutive question before that next marker belongs to the case;
      // relying only on words such as “本病” incorrectly split questions like
      // “若进行腹腔穿刺……” and “防治本病的措施……”。
      if (
        pending.order <= 8 &&
        sourceGap === 1 &&
        !belongsToAnotherGroup
      ) {
        setSharedFields(row.question, {
          sharedGroupId: pending.id,
          sharedKind: "stem",
          sharedStem: pending.stem,
          sharedOrder: pending.order,
        });
        pending.order += 1;
        pending.lastAnchor = row.anchor;
      } else {
        pending = null;
      }
    }
    const stem = analysisSharedStem(row.question.analysis);
    if (stem) {
      pending = {
        id: stableSharedId("stem", stream, row.anchor),
        stem,
        order: 1,
        lastAnchor: row.anchor,
      };
    }
  });
}

function decorateVeterinarySharedGroups(questions) {
  const rowsByStream = new Map();
  questions.forEach((question, index) => {
    if (!question.certificates?.includes("veterinary-practitioner")) return;
    const provenance = question.provenance?.[0];
    const stream = sharedStreamKey(question, index);
    const sourceIndex = Number.isInteger(provenance?.sourceIndex)
      ? provenance.sourceIndex
      : Number.isInteger(provenance?.questionNumber)
        ? provenance.questionNumber
        : index;
    if (!rowsByStream.has(stream)) rowsByStream.set(stream, []);
    rowsByStream.get(stream).push({
      question,
      index,
      anchor: sourceIndex,
    });
  });

  for (const [stream, rows] of rowsByStream) {
    rows.sort((a, b) => a.anchor - b.anchor || a.index - b.index);
    decorateDirectSharedGroups(rows, stream);
    decorateAnalysisSharedGroups(rows, stream);
  }

  const groups = new Map();
  for (const question of questions) {
    if (!question.sharedGroupId) continue;
    if (!groups.has(question.sharedGroupId)) groups.set(question.sharedGroupId, []);
    groups.get(question.sharedGroupId).push(question);
  }
  // PDF chapter labels occasionally change in the middle of a case block.
  // Keep the whole case in one syllabus module so an exam cannot split it.
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const counts = new Map();
    for (const question of group)
      counts.set(question.chapter, (counts.get(question.chapter) || 0) + 1);
    const targetChapter = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (targetChapter) {
      for (const question of group) question.chapter = targetChapter;
    }
  }

  for (const [questionId, image] of Object.entries(veterinaryPdfImages)) {
    const question = questions.find((item) => item.id === questionId);
    if (!question) continue;
    const group = question.sharedGroupId
      ? groups.get(question.sharedGroupId) || [question]
      : [question];
    for (const item of group) {
      const images = Array.isArray(item.images) ? item.images : [];
      if (!images.some((entry) => entry?.src === image.src))
        item.images = [...images, image];
    }
  }
}

function loadCatalog() {
  const manifests = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => {
      const directory = path.join(root, entry.name);
      const manifest = json(path.join(directory, "manifest.json"));
      validateManifest(manifest, directory);
      let guide = null;
      if (manifest.guidePath) {
        const guideFile = path.resolve(directory, manifest.guidePath);
        if (!guideFile.startsWith(path.resolve(directory) + path.sep))
          throw new Error(`证书指南路径不能超出证书目录：${directory}`);
        guide = guideSchema.parse(json(guideFile));
      }
      return { directory, ...manifest, guide };
    })
    .sort(
      (a, b) => (a.certificate.order || 999) - (b.certificate.order || 999),
    );

  const questions = new Map();
  for (const manifest of manifests) {
    const syllabusChapters = new Set(
      manifest.syllabus?.modules.map((module) => module.name) || [],
    );
    const allowUnmappedChapters = Boolean(
      manifest.syllabus?.allowUnmappedChapters,
    );
    for (const bank of manifest.banks) {
      for (const file of filesAt(path.join(manifest.directory, bank.path))) {
        const rows = json(file);
        if (!Array.isArray(rows))
          throw new Error(`题库文件必须是数组：${file}`);
        for (const row of rows) {
          const candidate = {
            ...bank.defaults,
            ...row,
            source: bank.source,
            sourceLabel: bank.name,
            certificates: [manifest.certificate.id],
          };
          const {
            id,
            source,
            sourceLabel,
            provenance,
            sourceVerification,
            certificates,
            ...raw
          } = candidate;
          if (!id || !slug.test(id)) throw new Error(`题目 ID 不合法：${file}`);
          questionSchema.parse({ ...raw, certificates });
          if (
            syllabusChapters.size &&
            !syllabusChapters.has(raw.chapter) &&
            !allowUnmappedChapters
          )
            throw new Error(
              `题目章节不在 ${manifest.certificate.shortName} ${manifest.syllabus.version} 大纲中：${id} / ${raw.chapter}`,
            );
          const prior = questions.get(id);
          if (prior) {
            const comparable = (value) => {
              const { certificates: ignored, ...rest } = value;
              return JSON.stringify(rest);
            };
            if (comparable(prior) !== comparable(candidate))
              throw new Error(`不同证书中的同 ID 题目内容不一致：${id}`);
            prior.certificates = [
              ...new Set([...prior.certificates, manifest.certificate.id]),
            ];
          } else questions.set(id, candidate);
        }
      }
    }
  }
  decorateVeterinarySharedGroups([...questions.values()]);
  return {
    manifests,
    certificates: manifests.map((entry) => ({
      ...entry.certificate,
      syllabus: entry.syllabus ? structuredClone(entry.syllabus) : null,
      guide: entry.guide ? structuredClone(entry.guide) : null,
    })),
    questions: [...questions.values()],
  };
}

const catalog = loadCatalog();

export const certificates = catalog.certificates;
export const bundledQuestions = () =>
  catalog.questions.map((q) => structuredClone(q));
export const hasCertificateQuestion = (question, certificateId) =>
  question.certificates?.includes(certificateId) || false;
export const banksForCertificate = (certificateId) => {
  const entry = catalog.manifests.find(
    (item) => item.certificate.id === certificateId,
  );
  return (
    entry?.banks.map(
      ({
        id,
        source,
        name,
        description,
        category,
        verification,
        sourceUrl,
      }) => ({
        id,
        source,
        name,
        description,
        category,
        verification,
        sourceUrl,
      }),
    ) || []
  );
};
export const syllabusForCertificate = (certificateId) => {
  const entry = catalog.manifests.find(
    (item) => item.certificate.id === certificateId,
  );
  return entry?.syllabus ? structuredClone(entry.syllabus) : null;
};
