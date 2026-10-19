import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { createConsoleStore, fail, stamp } from "./store.js";
import {
  consoleMetrics,
  consoleUsage,
  configStatus,
  contentRevision,
} from "./metrics.js";
import {
  digest,
  questionPayload,
  sameLoaded,
} from "../content-quality/quality.js";
import { batchSchema } from "../content-quality/contracts.js";
import { questionSchema } from "../domain.js";
import { certificates, questionForCertificate } from "../certificates.js";
import {
  bundledQuestions,
  bankManifestForCertificate,
} from "../question-banks/loader.js";
import { authorAiSettings } from "../ai-service.js";
import { catalogue, getBundle } from "../demo-tutor/registry.js";
import { validateLesson } from "../demo-tutor/protocol.js";
import { redact, encrypt, masterKey, validateBaseUrl } from "../security.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
};
const identifier = z.string().trim().min(1).max(200);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const documentInput = z
  .object({
    kind: z.enum(["batch", "revision", "certificate"]),
    certificateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(120),
    revision: revision.optional(),
    data: z
      .object({
        batch: z.record(z.string(), z.unknown()),
        questions: z.array(z.record(z.string(), z.unknown())).max(50),
        sources: z.array(z.unknown()).max(200),
        provenance: z.array(z.unknown()).max(50),
        reviews: z.array(z.unknown()).max(50),
        blueprint: z.unknown().nullable().optional(),
        manifest: z.record(z.string(), z.unknown()).optional(),
        guide: z.record(z.string(), z.unknown()).optional(),
        replacesQuestionId: identifier.optional(),
      })
      .strict(),
  })
  .strict();
export const draftQuestion = questionPayload;
// Linear glob matching avoids executing a user-supplied regular expression.
export function globMatch(text, pattern) {
  let i = 0,
    j = 0,
    star = -1,
    mark = 0;
  while (i < text.length) {
    if (j < pattern.length && (pattern[j] === "?" || pattern[j] === text[i])) {
      i++;
      j++;
    } else if (pattern[j] === "*") {
      star = j++;
      mark = i;
    } else if (star >= 0) {
      j = star + 1;
      i = ++mark;
    } else return false;
  }
  while (pattern[j] === "*") j++;
  return j === pattern.length;
}
const searched = (q, search) =>
  !search ||
  [
    q.id,
    q.question,
    q.chapter,
    q.knowledgePoint,
    q.analysis,
    ...Object.values(q.options || {}),
    ...(q.tags || []),
  ].some((v) =>
    globMatch(String(v || "").toLowerCase(), `*${search.toLowerCase()}*`),
  );

export function registerAdminConsole({
  route,
  store,
  requireAdmin,
  provider,
  ai,
}) {
  const db = store.db,
    content = createConsoleStore(store),
    workers = new Set();
  let active = false,
    stopped = false;
  const publicRows = () =>
    store.allQ(true).filter((q) => q.source !== "ai_generated");
  const scoped = (q, id) => questionForCertificate(q, id);
  const certificate = (id) => certificates.find((c) => c.id === id);
  const hiddenMap = () =>
    new Map(store.questionVisibility().map((r) => [r.questionId, r]));
  const questionView = (q, id, map = hiddenMap()) => {
    const { ownerUserId, aiGroupId, ...safe } = scoped(q, id);
    const visibility = map.get(q.id) || { hidden: 0 };
    return {
      ...safe,
      hidden: !!visibility.hidden,
      visibilityReason: visibility.reason || "",
      revision: digest({ q, visibility }),
    };
  };
  const getQuestion = (id) => {
    const q = store.getQ(id);
    if (!q || q.source === "ai_generated")
      throw fail("公共题库中没有这道题", 404);
    return q;
  };
  const getDocument = (id) => {
    const d = content.document(id);
    if (!d) throw fail("草稿不存在", 404);
    return d;
  };
  const runWorker = (kind, data, certId) =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.js", import.meta.url), {
        workerData: {
          kind,
          data,
          existing: publicRows(),
          certificate: certificate(certId),
        },
      });
      workers.add(worker);
      const timeout = setTimeout(() => {
        void worker.terminate();
        reject(fail("检查超时，请拆分批次重试", 504));
      }, 120000);
      worker.once("message", (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
      worker.once("error", reject);
      worker.once("exit", (code) => {
        clearTimeout(timeout);
        workers.delete(worker);
        if (code !== 0) reject(fail("任务已停止，可手动重试", 409));
      });
      worker.consoleJobId = data.consoleJobId;
    });
  const blankBatch = (actor, certId, questions = [], title = "新内容批次") => {
    const runId = "console-" + crypto.randomUUID();
    return {
      kind: "batch",
      certificateId: certId,
      title,
      data: {
        batch: {
          schemaVersion: 1,
          runId,
          certificateId: certId,
          createdAt: stamp(),
          authorContext: `admin:${actor}:${runId}`,
          examVersion: certificate(certId)?.syllabus?.version || "待核实版本",
          newCertificate: !certificate(certId),
          maxQuestions: 50,
          bank: {
            id: runId,
            source: runId.replaceAll("-", "_"),
            name: title,
            category: "syllabus_practice",
          },
        },
        questions,
        sources: [],
        provenance: [],
        reviews: [],
        blueprint: null,
      },
    };
  };
  const stageRevision = (actor, original, certId, proposed) => {
    const baseline = draftQuestion(scoped(original, certId));
    const question = {
      ...(proposed || baseline),
      id: original.id + "-r-" + crypto.randomBytes(4).toString("hex"),
    };
    const input = blankBatch(
      actor,
      certId,
      [question],
      "修订：" + original.question.slice(0, 30),
    );
    input.kind = "revision";
    input.data.replacesQuestionId = original.id;
    input.data.provenance = [
      {
        questionId: question.id,
        sourceIds: [],
        locator: "",
        category: "syllabus_practice",
        reuse: "original",
        reuseBasis: "修订现有题目；需补齐真实来源、具体纠错依据与独立复核。",
        replacement: {
          questionId: original.id,
          certificateId: certId,
          digest: digest(baseline),
          reason: "",
        },
      },
    ];
    return content.saveDocument(actor, input);
  };
  const work = async (job) => {
    if (job.kind === "check") {
      const d = getDocument(job.input.documentId);
      if (d.revision !== job.input.revision)
        throw fail("草稿已变更，请重新检查", 409);
      const report = await runWorker(
        "check",
        { ...d.data, consoleJobId: job.id },
        d.certificateId,
      );
      if (getDocument(d.id).revision !== d.revision)
        throw fail("检查期间草稿发生变化，本结果已失效", 409);
      return {
        ...report,
        documentId: d.id,
        inputRevision: d.revision,
        catalogRevision: contentRevision(store),
      };
    }
    if (job.kind === "scan") {
      const existing = publicRows().filter(
        (q) =>
          !job.input.certificateId ||
          q.certificates?.includes(job.input.certificateId),
      );
      // Only public records are sent to the isolated worker, never private drafts or conversations.
      const worker = new Worker(new URL("./worker.js", import.meta.url), {
        workerData: { kind: "scan", data: job.input, existing },
      });
      workers.add(worker);
      worker.consoleJobId = job.id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(fail("扫描超时，请缩小范围", 504));
        }, 120000);
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) => {
          clearTimeout(timer);
          workers.delete(worker);
          if (code !== 0) reject(fail("扫描已取消", 409));
        });
      });
    }
    if (job.kind === "generate") {
      const input = job.input,
        settings =
          authorAiSettings(store) || store.adminSettings(job.createdBy);
      if (!settings?.apiKey && !settings?.keyCipher)
        throw fail("请先配置 AI 服务");
      const source = publicRows()
        .map((q) => scoped(q, input.certificateId))
        .find(
          (q) =>
            q.certificates?.includes(input.certificateId) &&
            q.chapter === input.chapter,
        );
      if (!source) throw fail("当前章节没有可参考题目");
      const generated = await ai(job.createdBy, () =>
        provider.generateBankExpansion(
          { ...source, knowledgePoint: input.knowledgePoint },
          input.count,
          {
            userId: job.createdBy,
            certificateId: input.certificateId,
            settings,
            existing: publicRows(),
            difficulty: input.difficulty,
          },
        ),
      );
      const questions = generated.map((q) => ({
        ...draftQuestion(q),
        id: "admin-" + crypto.randomUUID(),
        chapter: input.chapter,
        ...(input.knowledgeSection
          ? { knowledgeSection: input.knowledgeSection }
          : {}),
        knowledgePoint: input.knowledgePoint,
      }));
      const document = content.saveDocument(
        job.createdBy,
        blankBatch(
          job.createdBy,
          input.certificateId,
          questions,
          "AI 生成待审批次",
        ),
      );
      return {
        documentId: document.id,
        inserted: 0,
        pending: questions.length,
        message: "生成结果已存入待审批次，尚未发布",
      };
    }
    throw fail("未知任务类型");
  };
  const drain = async () => {
    if (active || stopped) return;
    const next = db
      .prepare(
        "SELECT id FROM admin_console_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1",
      )
      .get();
    if (!next) return;
    active = true;
    const job = content.updateJob(next.id, "running");
    try {
      const result = await work(job);
      if (!stopped && db.isOpen && content.job(job.id).status === "running")
        content.updateJob(job.id, "completed", result);
    } catch (e) {
      if (!stopped && db.isOpen && content.job(job.id).status === "running")
        content.updateJob(
          job.id,
          "failed",
          null,
          redact(e.message).slice(0, 500),
        );
    } finally {
      active = false;
      if (!stopped) setImmediate(drain);
    }
  };
  const enqueue = (id, actor, kind, input) => {
    const job = content.enqueue(id, actor, kind, input);
    setImmediate(drain);
    return job;
  };
  const r = (method, url, handler) =>
    route(method, "/api/admin/console" + url, (req) => {
      requireAdmin(req);
      return handler(req);
    });
  r("get", "/overview", (req) => {
    const days = z.coerce
      .number()
      .pipe(z.union([z.literal(7), z.literal(30)]))
      .parse(req.query.days || 7);
    const documents = content.documents(),
      jobs = content.jobs();
    return {
      ...consoleMetrics(store, days),
      pending: {
        drafts: documents.filter((d) => !d.exportedAt).length,
        feedback: db
          .prepare(
            "SELECT COUNT(*) AS n FROM question_feedback f LEFT JOIN admin_feedback_cases c ON c.user_id=f.user_id AND c.question_id=f.question_id WHERE f.kind<>'helpful' AND (c.status IS NULL OR c.status IN ('open','processing'))",
          )
          .get().n,
        failedJobs: jobs.filter((j) =>
          ["failed", "interrupted"].includes(j.status),
        ).length,
      },
      config: configStatus(store),
    };
  });
  r("get", "/catalog", () => {
    const all = publicRows(),
      hidden = hiddenMap();
    return {
      updatedAt: stamp(),
      contentRevision: contentRevision(store),
      certificates: certificates.map((c) => {
        const rows = all
          .filter((q) => q.certificates?.includes(c.id))
          .map((q) => scoped(q, c.id));
        return {
          id: c.id,
          name: c.name,
          shortName: c.shortName,
          syllabusVersion: c.syllabus?.version || null,
          weightType: c.syllabus?.weightType || null,
          questions: rows.length,
          active: rows.filter((q) => !hidden.get(q.id)?.hidden).length,
          sourceUrls: c.syllabus?.sourceUrls || [],
          taxonomy: c.taxonomy || null,
          chapters: (
            c.taxonomy?.modules ||
            c.syllabus?.modules ||
            [...new Set(rows.map((q) => q.chapter))].map((name) => ({ name }))
          ).map((m) => ({
            id: m.id,
            name: m.name,
            weight: m.weight,
            target: m.targetQuestionCount,
            count: rows.filter((q) => q.chapter === m.name).length,
            sections: (m.sections || []).map((s) => ({
              ...s,
              knowledgePoints: s.knowledgePoints.map((p) => ({
                ...p,
                count: rows.filter(
                  (q) =>
                    q.chapter === m.name &&
                    q.knowledgeSection === s.name &&
                    q.knowledgePoint === p.name,
                ).length,
              })),
            })),
          })),
          manifest: bankManifestForCertificate(c.id),
          guide: c.guide || null,
          loadedDigest: digest(rows.map((q) => draftQuestion(q))),
          bundled: bundledQuestions().filter((q) =>
            q.certificates?.includes(c.id),
          ).length,
        };
      }),
    };
  });
  r("get", "/questions", (req) => {
    const input = z
      .object({
        ...pagination,
        certificateId: z.string().default(""),
        search: z.string().max(200).default(""),
        chapter: z.string().default(""),
        knowledgeSection: z.string().default(""),
        knowledgePoint: z.string().default(""),
        source: z.string().default(""),
        type: z.string().default(""),
        status: z.enum(["all", "active", "hidden"]).default("all"),
        sort: z.enum(["id", "chapter"]).default("id"),
      })
      .strict()
      .parse(req.query);
    const map = hiddenMap();
    const rows = publicRows()
      .filter(
        (q) =>
          !input.certificateId || q.certificates?.includes(input.certificateId),
      )
      .map((q) => questionView(q, input.certificateId, map))
      .filter(
        (q) =>
          (!input.chapter || q.chapter === input.chapter) &&
          (!input.knowledgeSection ||
            q.knowledgeSection === input.knowledgeSection) &&
          (!input.knowledgePoint ||
            q.knowledgePoint === input.knowledgePoint) &&
          (!input.source || q.source === input.source) &&
          (!input.type || q.type === input.type) &&
          (input.status === "all" ||
            q.hidden === (input.status === "hidden")) &&
          searched(q, input.search),
      )
      .sort(
        (a, b) =>
          String(a[input.sort]).localeCompare(String(b[input.sort]), "zh-CN") ||
          a.id.localeCompare(b.id),
      );
    return {
      ...input,
      total: rows.length,
      rows: rows.slice(input.offset, input.offset + input.limit),
    };
  });
  r("get", "/questions/:id", (req) => ({
    question: questionView(getQuestion(req.params.id), req.query.certificateId),
  }));
  r("post", "/questions/export", (req) => {
    const { ids } = z
      .object({ ids: z.array(identifier).min(1).max(100) })
      .strict()
      .parse(req.body);
    const rows = ids.map((id) =>
      questionView(getQuestion(id), req.body.certificateId),
    );
    store.audit(
      req.user.id,
      "console_questions_exported",
      "question_selection",
      null,
      { count: rows.length },
    );
    return {
      schemaVersion: 1,
      kind: "inspection-only",
      publishable: false,
      exportedAt: stamp(),
      questions: rows.map((q) => draftQuestion(q)),
    };
  });
  const visibilityInput = z
    .object({
      items: z
        .array(z.object({ id: identifier, revision }).strict())
        .min(1)
        .max(100),
      hidden: z.boolean(),
      reason: z.string().trim().min(2).max(200),
    })
    .strict();
  const preview = (body) => {
    const input = visibilityInput.parse(body);
    if (new Set(input.items.map((i) => i.id)).size !== input.items.length)
      throw fail("题目选择重复");
    const items = input.items.map((i) => {
      const view = questionView(getQuestion(i.id));
      if (view.revision !== i.revision)
        throw fail("题目已更新，请刷新后重新操作", 409);
      return { id: i.id, question: view.question, hidden: view.hidden };
    });
    return { items, count: items.length, preview: digest(input), input };
  };
  r("post", "/visibility/preview", (req) => preview(req.body));
  db.exec(
    "CREATE TABLE IF NOT EXISTS admin_console_mutations (id TEXT PRIMARY KEY,actor TEXT NOT NULL,input_hash TEXT NOT NULL,result TEXT NOT NULL)",
  );
  r("post", "/visibility", (req) => {
    const {
      requestId,
      preview: token,
      ...body
    } = z
      .object({
        ...visibilityInput.shape,
        requestId: z.string().uuid(),
        preview: revision,
      })
      .strict()
      .parse(req.body);
    const inputHash = digest(body),
      old = db
        .prepare("SELECT * FROM admin_console_mutations WHERE id=?")
        .get(requestId);
    if (old) {
      if (old.actor !== req.user.id || old.input_hash !== inputHash)
        throw fail("请求编号已使用", 409);
      return JSON.parse(old.result);
    }
    const checked = preview(body);
    if (checked.preview !== token) throw fail("预览已失效，请重新预览", 409);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of body.items) {
        store.setQuestionVisibility(
          item.id,
          body.hidden,
          body.reason,
          req.user.id,
        );
        store.audit(
          req.user.id,
          body.hidden ? "question_hidden" : "question_restored",
          "question",
          item.id,
          { reason: body.reason },
        );
      }
      const result = { saved: true, count: checked.count };
      db.prepare("INSERT INTO admin_console_mutations VALUES (?,?,?,?)").run(
        requestId,
        req.user.id,
        inputHash,
        JSON.stringify(result),
      );
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  r("post", "/questions/:id/draft", (req) => {
    const { certificateId, revision: expected } = z
      .object({ certificateId: identifier, revision })
      .strict()
      .parse(req.body);
    const q = getQuestion(req.params.id);
    if (!q.certificates?.includes(certificateId)) throw fail("证书不匹配");
    if (questionView(q, certificateId).revision !== expected)
      throw fail("题目已更新，请重新读取", 409);
    return { document: stageRevision(req.user.id, q, certificateId) };
  });
  r("get", "/documents", (req) => {
    const filters = z
      .object({
        ...pagination,
        certificateId: z.string().default(""),
        search: z.string().max(100).default(""),
      })
      .strict()
      .parse(req.query);
    const rows = content
      .documents()
      .filter(
        (d) =>
          (!filters.certificateId ||
            d.certificateId === filters.certificateId) &&
          d.title.toLowerCase().includes(filters.search.toLowerCase()),
      );
    return {
      ...filters,
      total: rows.length,
      rows: rows
        .slice(filters.offset, filters.offset + filters.limit)
        .map((d) => {
          const doc = getDocument(d.id),
            integrated =
              doc.data.questions.length > 0 &&
              doc.data.questions.every((q) =>
                sameLoaded(q, store.getQ(q.id), doc.data.batch),
              );
          return {
            ...d,
            stage: integrated
              ? "integrated"
              : d.exportedAt
                ? "exported"
                : "draft",
          };
        }),
    };
  });
  r("get", "/documents/:id", (req) => {
    const document = getDocument(req.params.id);
    const check = db
      .prepare(
        "SELECT id FROM admin_console_jobs WHERE kind='check' AND json_extract(input,'$.documentId')=? AND json_extract(input,'$.revision')=? ORDER BY created_at DESC,id DESC LIMIT 1",
      )
      .get(document.id, document.revision);
    const oldId = document.data.replacesQuestionId,
      old = oldId && store.getQ(oldId);
    const baseline = old
      ? draftQuestion(scoped(old, document.certificateId))
      : null;
    return {
      document,
      checkJob: check ? content.job(check.id) : null,
      baseline,
    };
  });
  r("post", "/documents", (req) => {
    const input = documentInput.parse(req.body);
    if (input.certificateId !== input.data.batch.certificateId)
      throw fail("草稿与批次证书不一致");
    return { document: content.saveDocument(req.user.id, input) };
  });
  r("put", "/documents/:id", (req) => {
    const input = documentInput.parse(req.body);
    if (!input.revision) throw fail("缺少草稿版本");
    if (input.certificateId !== input.data.batch.certificateId)
      throw fail("草稿与批次证书不一致");
    return {
      document: content.saveDocument(req.user.id, input, req.params.id),
    };
  });
  r("post", "/documents/:id/check", (req) => {
    const body = z
        .object({ requestId: z.string().uuid(), revision })
        .strict()
        .parse(req.body),
      d = getDocument(req.params.id);
    if (d.revision !== body.revision) throw fail("草稿已更新", 409);
    return {
      job: enqueue(body.requestId, req.user.id, "check", {
        documentId: d.id,
        revision: d.revision,
      }),
    };
  });
  r("post", "/documents/:id/export", async (req) => {
    const body = z.object({ revision }).strict().parse(req.body),
      d = getDocument(req.params.id);
    if (body.revision !== d.revision) throw fail("草稿已更新", 409);
    const report = await runWorker("check", d.data, d.certificateId);
    if (!report.ok) throw fail("内容未通过质量检查，不能导出发布包", 409);
    if (getDocument(d.id).revision !== d.revision)
      throw fail("检查期间草稿已更新", 409);
    const batch = batchSchema.parse(d.data.batch),
      questions = d.data.questions.map((q) => ({
        ...q,
        provenance: {
          ...d.data.provenance.find((p) => p.questionId === q.id),
          reviewDigest: report.reviewInputs.find((r) => r.questionId === q.id)
            .digest,
        },
        sourceVerification: `${batch.bank.category}；已记录逐题来源与复核，非专家认证。`,
      }));
    const target = `questions/curated/${batch.runId}.json`,
      bank = {
        ...batch.bank,
        description: "依据批次公开来源及逐题复核接入",
        path: target,
      };
    const files = {
      "questions.json": questions,
      "manifest-bank.json": bank,
      "quality-report.json": report,
      "sources.json": d.data.sources,
      "provenance.json": d.data.provenance,
      "reviews.json": d.data.reviews,
      "batch.json": batch,
      "integration.json": {
        certificateId: d.certificateId,
        target: `server/question-banks/${d.certificateId}/${target}`,
        bank,
        inputDigest: digest(d.data),
        replacements: report.replacements || [],
        assets: [
          ...new Set(
            questions.flatMap((q) => (q.images || []).map((i) => i.src)),
          ),
        ],
        steps: [
          "核对题目、来源和复核证据，按 target 合并题库及 bank 声明。",
          "同步三级目录、guide、派生计数和各端映射；保留已发布题号。",
          "执行现有内容 pipeline verify、exam-smoke 和浏览器验收。",
          "随代码部署，保留 DATA_DIR；部署后核对运行库题量及摘要。",
        ],
      },
    };
    if (d.data.manifest) files["manifest.proposed.json"] = d.data.manifest;
    if (d.data.guide) files["guide.json"] = d.data.guide;
    content.markExported(d.id);
    store.audit(
      req.user.id,
      "console_release_exported",
      "content_batch",
      d.id,
      { count: questions.length },
    );
    return {
      schemaVersion: 1,
      stage: "prepared",
      activeBankWritten: false,
      auditInputs: d.data,
      files,
    };
  });
  r("get", "/jobs", () => ({
    rows: content.jobs().map(({ input, ...job }) => ({
      ...job,
      documentId: input.documentId || job.result?.documentId,
      canCancel:
        job.status === "queued" ||
        (job.status === "running" && job.kind !== "generate"),
      canRetry: ["failed", "interrupted", "cancelled"].includes(job.status),
    })),
    studyJobs: db
      .prepare(
        "SELECT id,node_id,status,stage,error,created_at FROM study_generation_jobs ORDER BY created_at DESC LIMIT 50",
      )
      .all(),
  }));
  r("get", "/jobs/:id", (req) => {
    const job = content.job(req.params.id);
    if (!job) throw fail("任务不存在", 404);
    return { job };
  });
  r("post", "/jobs/:id/cancel", async (req) => {
    const job = content.job(req.params.id);
    if (!job) throw fail("任务不存在", 404);
    if (job.status === "running" && job.kind === "generate")
      throw fail("生成正在执行，请等待结果，避免重复计费", 409);
    if (!["queued", "running"].includes(job.status)) return { job };
    content.updateJob(job.id, "cancelled");
    for (const w of workers) if (w.consoleJobId === job.id) await w.terminate();
    store.audit(req.user.id, "console_task_cancelled", "task", job.id);
    return { job: content.job(job.id) };
  });
  r("post", "/jobs/:id/retry", (req) => {
    const { requestId } = z
        .object({ requestId: z.string().uuid() })
        .strict()
        .parse(req.body),
      job = content.job(req.params.id);
    if (!job || !["failed", "cancelled", "interrupted"].includes(job.status))
      throw fail("此任务不能重试", 409);
    const input = { ...job.input };
    if (job.kind === "check")
      input.revision = getDocument(input.documentId).revision;
    return { job: enqueue(requestId, req.user.id, job.kind, input) };
  });
  const createGeneration = (actor, body) => {
    const input = z
      .object({
        requestId: z.string().uuid().optional(),
        certificateId: identifier,
        chapter: identifier,
        knowledgeSection: identifier.optional(),
        knowledgePoint: identifier,
        count: z.number().int().min(1).max(20),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      })
      .strict()
      .parse(body);
    const c = certificate(input.certificateId);
    if (!c) throw fail("证书不存在");
    if (c.taxonomy) {
      const m = c.taxonomy.modules.find((m) => m.name === input.chapter),
        s = m?.sections.find((s) => s.name === input.knowledgeSection);
      if (!s?.knowledgePoints.some((p) => p.name === input.knowledgePoint))
        throw fail("请选择当前证书的章节、二级分类和知识点");
    }
    const { requestId = crypto.randomUUID(), ...selection } = input;
    return enqueue(requestId, actor, "generate", selection);
  };
  r("post", "/generation", (req) => ({
    job: createGeneration(req.user.id, req.body),
  }));
  r("post", "/quality/scan", (req) => {
    const { requestId, ...input } = z
      .object({
        requestId: z.string().uuid(),
        certificateId: z.string().default(""),
        threshold: z.number().min(0.5).max(0.99).default(0.78),
      })
      .strict()
      .parse(req.body);
    if (input.certificateId && !certificate(input.certificateId))
      throw fail("证书不存在");
    return { job: enqueue(requestId, req.user.id, "scan", input) };
  });
  r("get", "/feedback", (req) => {
    const input = z
      .object({
        ...pagination,
        certificateId: z.string().default(""),
        status: z
          .enum(["all", "open", "processing", "resolved", "ignored"])
          .default("all"),
      })
      .strict()
      .parse(req.query);
    const cases = new Map(
      db
        .prepare("SELECT * FROM admin_feedback_cases")
        .all()
        .map((c) => [c.user_id + "\n" + c.question_id, c]),
    );
    const rows = store
      .questionFeedbackRows()
      .filter(
        (f) =>
          f.question.source !== "ai_generated" &&
          (!input.certificateId ||
            f.question.certificates?.includes(input.certificateId)),
      )
      .map((f) => {
        const c = cases.get(f.userId + "\n" + f.questionId);
        return {
          ...f,
          question: questionView(f.question, input.certificateId),
          status: c?.status || "open",
          note: f.note || "",
          resolution: c?.note || "",
          documentId: c?.document_id || "",
          revision:
            c?.revision ||
            digest({
              userId: f.userId,
              questionId: f.questionId,
              createdAt: f.createdAt,
            }),
        };
      })
      .filter((f) => input.status === "all" || f.status === input.status);
    return {
      ...input,
      total: rows.length,
      rows: rows.slice(input.offset, input.offset + input.limit),
    };
  });
  r("put", "/feedback", (req) => {
    const body = z
      .object({
        userId: identifier,
        questionId: identifier,
        revision,
        status: z.enum(["open", "processing", "resolved", "ignored"]),
        note: z.string().trim().min(2).max(500),
        documentId: z.string().uuid().nullable(),
      })
      .strict()
      .parse(req.body);
    const f = store
      .questionFeedbackRows()
      .find(
        (f) => f.userId === body.userId && f.questionId === body.questionId,
      );
    if (!f) throw fail("反馈不存在", 404);
    const old = db
      .prepare(
        "SELECT * FROM admin_feedback_cases WHERE user_id=? AND question_id=?",
      )
      .get(body.userId, body.questionId);
    if (
      body.revision !==
      (old?.revision ||
        digest({
          userId: f.userId,
          questionId: f.questionId,
          createdAt: f.createdAt,
        }))
    )
      throw fail("反馈已被更新，请刷新", 409);
    if (body.documentId) getDocument(body.documentId);
    const next = digest({ ...body, updatedAt: stamp() });
    db.prepare(
      "INSERT OR REPLACE INTO admin_feedback_cases VALUES (?,?,?,?,?,?,?)",
    ).run(
      body.userId,
      body.questionId,
      body.status,
      body.note,
      body.documentId,
      next,
      stamp(),
    );
    store.audit(
      req.user.id,
      "console_feedback_resolved",
      "question",
      body.questionId,
      { status: body.status, documentId: body.documentId },
    );
    return { saved: true, revision: next };
  });
  r("get", "/usage", (req) =>
    consoleUsage(
      store,
      z
        .object({
          ...pagination,
          days: z.coerce.number().int().min(1).max(365).default(30),
          search: z.string().max(100).default(""),
        })
        .strict()
        .parse(req.query),
    ),
  );
  r("get", "/audit", (req) => {
    const input = z
      .object({
        ...pagination,
        search: z.string().max(100).default(""),
        action: z.string().max(100).default(""),
      })
      .strict()
      .parse(req.query);
    const where =
      " WHERE (?='' OR a.action=?) AND (COALESCE(u.username,'') LIKE ? ESCAPE '\\' OR a.action LIKE ? ESCAPE '\\' OR COALESCE(a.target_id,'') LIKE ? ESCAPE '\\')";
    const like = "%" + input.search.replace(/[\\%_]/g, (c) => "\\" + c) + "%",
      args = [input.action, input.action, like, like, like];
    const from =
      " FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_user_id";
    return {
      ...input,
      total: db.prepare("SELECT COUNT(*) AS n" + from + where).get(...args).n,
      rows: db
        .prepare(
          "SELECT a.*,u.username" +
            from +
            where +
            " ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?",
        )
        .all(...args, input.limit, input.offset)
        .map((r) => ({ ...r, data: JSON.parse(r.data) })),
    };
  });
  r("get", "/system", () => ({
    updatedAt: stamp(),
    node: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      questions: publicRows().length,
      hidden: store.questionVisibility().filter((q) => q.hidden).length,
      documents: db
        .prepare("SELECT COUNT(*) AS n FROM admin_console_documents")
        .get().n,
    },
    config: configStatus(store),
    contentRevision: contentRevision(store),
    certificates: certificates.length,
    schemaVersion: 1,
    publicationMode: "review-export-code-release",
  }));
  r("get", "/teaching", () => catalogue());
  r("get", "/teaching/:id", (req) => {
    const bundle = getBundle(req.params.id);
    return {
      course: bundle.course,
      lessons: bundle.teaching.map((cards) => validateLesson(cards)),
    };
  });
  const configuration = (actor) => {
    const original = store.adminSettings(actor),
      { keyCipher, ...saved } = original;
    let encryptionReady = true;
    try {
      masterKey();
    } catch {
      encryptionReady = false;
    }
    return {
      ...configStatus(store),
      saved: {
        ...saved,
        hasKey: !!keyCipher,
        encryptionReady,
        revision: digest(original),
      },
    };
  };
  r("get", "/config", (req) => configuration(req.user.id));
  r("put", "/config", (req) => {
    const body = z
      .object({
        revision,
        baseUrl: z.string().max(1000),
        model: z.string().trim().min(1).max(100),
        temperature: z.number().min(0).max(2),
        apiKey: z.string().trim().min(1).max(4096).optional(),
      })
      .strict()
      .parse(req.body);
    const previous = store.adminSettings(req.user.id);
    if (body.revision !== digest(previous))
      throw fail("AI 配置已在其他页面修改，请重新读取", 409);
    const next = {
      ...previous,
      baseUrl: validateBaseUrl(body.baseUrl),
      model: body.model,
      temperature: body.temperature,
      ...(body.apiKey ? { keyCipher: encrypt(body.apiKey) } : {}),
    };
    store.saveAdminSettings(req.user.id, next);
    store.audit(
      req.user.id,
      "admin_settings_saved",
      "admin_settings",
      req.user.id,
      { baseUrl: next.baseUrl, model: next.model, keyChanged: !!body.apiKey },
    );
    return configuration(req.user.id);
  });
  r("delete", "/config/key", (req) => {
    const body = z.object({ revision }).strict().parse(req.body),
      settings = store.adminSettings(req.user.id);
    if (body.revision !== digest(settings))
      throw fail("AI 配置已变更，请重新读取", 409);
    delete settings.keyCipher;
    store.saveAdminSettings(req.user.id, settings);
    store.audit(
      req.user.id,
      "admin_settings_key_deleted",
      "admin_settings",
      req.user.id,
    );
    return configuration(req.user.id);
  });
  r("post", "/config/test", (req) =>
    ai(req.user.id, async () => {
      const settings = authorAiSettings(store);
      if (!settings) throw fail("尚未配置有效 AI 服务");
      await provider.call(
        [{ role: "user", content: "Reply with OK." }],
        settings,
        { userId: req.user.id, taskType: "admin-connection-test" },
      );
      store.audit(req.user.id, "console_ai_test", "ai_config", null, {
        model: settings.model,
      });
      return { message: "当前有效 AI 服务连接成功" };
    }),
  );
  return {
    content,
    createGeneration,
    stageRevision,
    async stop() {
      stopped = true;
      await Promise.allSettled([...workers].map((w) => w.terminate()));
      if (!db.isOpen) return;
      db.prepare(
        "UPDATE admin_console_jobs SET status='interrupted',updated_at=?,error='服务已停止，请手动重试' WHERE status IN ('queued','running')",
      ).run(stamp());
    },
  };
}
