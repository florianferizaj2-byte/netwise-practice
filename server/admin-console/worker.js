import { parentPort, workerData } from "node:worker_threads";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditBatch } from "../content-quality/quality.js";
import { questionSchema, verifyCalculation } from "../domain.js";
import {
  createTaxonomyIndex,
  assertQuestionTaxonomy,
} from "../question-banks/taxonomy.js";
import { validateManifest, guideSchema } from "../question-banks/loader.js";
import { findSimilarQuestions } from "../question-similarity.js";
import { questionForCertificate } from "../question-banks/scopes.js";

try {
  const { kind, data, existing, certificate } = workerData;
  if (kind === "scan") {
    parentPort.postMessage({
      pairs: findSimilarQuestions(existing, {
        threshold: data.threshold,
        limit: 200,
      }),
      note: "相似度用于发现候选，不代表完成语义或答案审核。",
    });
  } else {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    let target = certificate;
    const extra = [];
    if (data.manifest) {
      try {
        validateManifest(
          data.manifest,
          path.join(root, "server/question-banks", data.batch.certificateId),
        );
        if (data.manifest.certificate.id !== data.batch.certificateId)
          throw new Error("证书 ID 不一致");
        for (const bank of data.manifest.banks) {
          if (
            !/^questions\/[a-zA-Z0-9_\-/]+\.json$/.test(bank.path) ||
            bank.path.includes("..")
          )
            throw new Error("题库路径必须是安全的 questions/ 相对 JSON 路径");
        }
        if (!certificate && !data.batch.newCertificate)
          throw new Error("新增证书必须标记 newCertificate 并提供完整指南");
        if (data.batch.newCertificate || !certificate)
          guideSchema.parse(data.guide);
        target = {
          ...data.manifest.certificate,
          taxonomy: data.manifest.taxonomy,
          syllabus: data.manifest.syllabus,
        };
        if (certificate && target.taxonomy) {
          const index = createTaxonomyIndex(target.taxonomy);
          for (const q of existing.filter((q) =>
            q.certificates?.includes(certificate.id),
          ))
            assertQuestionTaxonomy(
              questionForCertificate(q, certificate.id),
              index,
            );
        }
      } catch (e) {
        extra.push({ code: "manifest", message: e.message });
      }
    } else if (data.batch?.newCertificate)
      extra.push({
        code: "manifest",
        message: "新证书需要完整 manifest 和 guide",
      });
    const report = auditBatch(data, {
      existing,
      certificate: target,
      questionSchema,
      verifyCalculation,
      createTaxonomyIndex,
      assertQuestionTaxonomy,
      questionForCertificate,
      checkImages(q) {
        for (const image of q.images || []) {
          if (
            !/^\/question-images\/[a-zA-Z0-9_\-/]+\.(png|jpg|jpeg|webp|gif)$/.test(
              image.src,
            ) ||
            image.src.includes("..")
          )
            throw new Error("需要已审核的本地 /question-images/ 图片");
          if (!fs.existsSync(path.join(root, "public", image.src)))
            throw new Error(`缺少图片：${image.src}`);
        }
      },
    });
    report.errors.push(...extra);
    report.ok = report.errors.length === 0;
    if (!report.ok) report.stage = "blocked";
    parentPort.postMessage(report);
  }
} catch (e) {
  parentPort.postMessage({
    ok: false,
    stage: "blocked",
    errors: [{ code: "input", message: e.message }],
    duplicates: [],
    reviewInputs: [],
  });
}
