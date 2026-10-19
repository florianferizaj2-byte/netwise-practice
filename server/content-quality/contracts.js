import { z } from "zod";

const text = z.string().trim().min(1);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "invalid calendar date");
export const batchSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: slug,
    certificateId: slug,
    createdAt: z.string().datetime(),
    authorContext: text,
    examVersion: text,
    newCertificate: z.boolean(),
    maxQuestions: z.number().int().min(1).max(50),
    bank: z
      .object({
        id: slug,
        source: z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
        name: text,
        category: z.enum([
          "official_sample",
          "verified_past_exam",
          "public_practice",
          "syllabus_practice",
          "unverified_collection",
        ]),
      })
      .strict(),
  })
  .strict();

export const sourcesSchema = z.array(
  z
    .object({
      id: text,
      title: text,
      url: z
        .string()
        .url()
        .refine((s) => new URL(s).protocol === "https:")
        .optional(),
      fileSha256: sha.optional(),
      authority: z.enum([
        "official",
        "official_mirror",
        "standard",
        "publisher",
        "third_party",
        "user",
      ]),
      access: z.enum(["opened", "unavailable", "search_only"]),
      checkedAt: date,
      examVersion: text,
      claims: z.array(
        z
          .object({
            kind: z.enum([
              "scope",
              "weights",
              "format",
              "question",
              "answer",
              "technical",
            ]),
            summary: z.string().min(8),
            locator: text,
          })
          .strict(),
      ),
      notes: z.string().optional(),
    })
    .strict()
    .refine((s) => s.url || s.fileSha256, "URL or local file SHA-256 required"),
);

export const provenanceSchema = z.array(
  z
    .object({
      questionId: slug,
      sourceIds: z.array(text).min(1),
      locator: text,
      category: z.enum([
        "official_sample",
        "verified_past_exam",
        "public_practice",
        "syllabus_practice",
        "unverified_collection",
      ]),
      reuse: z.enum([
        "original",
        "licensed",
        "user_authorized",
        "permission_recorded",
        "link_only",
      ]),
      reuseBasis: z.string().min(10),
      sourceQuestionId: text.optional(),
      examYear: z.number().int().min(1980).max(2100).optional(),
      groupQuestionCount: z.number().int().min(2).max(200).optional(),
      replacement: z
        .object({
          questionId: slug,
          certificateId: slug,
          digest: sha,
          reason: z.string().trim().min(20).max(1000),
        })
        .strict()
        .optional(),
    })
    .strict(),
);

export const reviewsSchema = z.array(
  z
    .object({
      questionId: slug,
      digest: sha,
      reviewerContext: text,
      verdict: z.enum(["pass", "reject", "needs_evidence"]),
      independentAnswer: z.array(z.enum(["A", "B", "C", "D", "E"])).optional(),
      independentExpectedAnswer: text.optional(),
      blindReasoning: z.string().min(20),
      checks: z
        .object({
          scope: z.literal(true),
          answer: z.literal(true),
          analysis: z.literal(true),
          distractors: z.literal(true),
          wording: z.literal(true),
          source: z.literal(true),
          classification: z.literal(true),
        })
        .strict(),
      calculation: z
        .object({
          applicable: z.boolean(),
          method: z.string().min(8),
          result: text,
          passed: z.literal(true),
        })
        .strict(),
      duplicates: z.array(
        z
          .object({
            otherId: text,
            otherDigest: sha,
            decision: z.literal("distinct"),
            reason: z.string().min(20),
          })
          .strict(),
      ),
    })
    .strict(),
);

export const blueprintSchema = z
  .object({
    schemaVersion: z.literal(1),
    certificateId: slug,
    syllabusVersion: text,
    basis: z.enum(["official", "past_papers", "platform"]),
    explanation: z.string().min(12),
    sourceIds: z.array(text).min(1),
    targetQuestionCount: z.number().int().min(1).max(100000),
    examQuestionCount: z.number().int().min(1).max(1000),
    modules: z
      .array(
        z
          .object({
            id: slug,
            name: text,
            weight: z.number().nonnegative().max(100).optional(),
            knowledgePoints: z
              .object({
                basis: z.enum(["official", "past_papers", "platform"]),
                explanation: z.string().min(12),
                sourceIds: z.array(text).min(1),
                points: z
                  .array(
                    z
                      .object({
                        code: text,
                        name: text,
                        weight: z.number().nonnegative().max(100),
                      })
                      .strict(),
                  )
                  .min(1),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1),
    papers: z
      .array(
        z
          .object({
            id: text,
            sourceId: text,
            year: z.number().int().min(1980).max(2100),
            syllabusVersion: text,
            complete: z.literal(true),
            totalPoints: z.number().positive(),
            sampleWeight: z.number().positive().default(1),
            questions: z
              .array(
                z
                  .object({
                    sourceQuestionId: text,
                    contentHash: sha,
                    moduleId: slug,
                    points: z.number().positive(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
