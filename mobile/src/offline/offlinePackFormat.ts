import type { Question } from '../api/client';

export const OFFLINE_PACK_SCHEMA = 1;
export const MAX_OFFLINE_PACK_BYTES = 48 * 1024 * 1024;
export type OfflinePackManifest = {
  schemaVersion: 1; certificateId: string; version: string; sha256: string;
  bytes: number; questionCount: number; mediaCount: number;
};
export type OfflineQuestion = Question & {
  answer: string[];
  analysis: string;
  sharedGroupId?: string;
  sharedKind?: 'stem' | 'options';
  sharedOrder?: number;
};
export type OfflinePack = {
  schemaVersion: 1;
  certificate: { id: string; name: string; shortName?: string };
  questions: OfflineQuestion[];
  exam: {
    catalog: { chapters: { name: string; questionCount: number; knowledgePoints: {
      id: string; name: string; section: string; questionCount: number;
    }[] }[] };
    modules: { id: string; name: string; order: number; weight: number }[];
    blueprint: { mode: 'fixed_module'; questionCount: number; questionsPerModule: number;
      passingScore: number; durationMinutes: number } | null;
    secondsPerQuestion: number;
  };
  media: Record<string, { mimeType: string; base64: string }>;
};

const fail = () => new Error('离线学习包不完整或版本不兼容，请重新下载。');
const certId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const digest = /^[a-f0-9]{64}$/;
const localAsset = /^\/(?:question-images|vet-images)\/(?:[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/;
const assetMimes = /^image\/(?:png|jpeg|webp|gif)$/;
const types = new Set(['single_choice', 'multiple_choice', 'true_false', 'short_answer']);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const integer = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;

export function parseOfflineManifest(value: unknown, certificateId: string): OfflinePackManifest {
  if (!isObject(value) || !certId.test(certificateId) || value.certificateId !== certificateId ||
    value.schemaVersion !== OFFLINE_PACK_SCHEMA || typeof value.sha256 !== 'string' ||
    !digest.test(value.sha256) || value.version !== value.sha256 ||
    !integer(value.bytes, 1, MAX_OFFLINE_PACK_BYTES) || !integer(value.questionCount, 1, 100_000) ||
    !integer(value.mediaCount, 0, 10_000)) throw fail();
  return value as OfflinePackManifest;
}

export async function decodeOfflinePack(
  manifest: OfflinePackManifest,
  text: string,
  actualBytes: number,
  sha256: (text: string) => Promise<string>,
): Promise<OfflinePack> {
  if (actualBytes !== manifest.bytes || await sha256(text) !== manifest.sha256) throw fail();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw fail(); }
  if (!isObject(data) || data.schemaVersion !== OFFLINE_PACK_SCHEMA ||
    !isObject(data.certificate) || data.certificate.id !== manifest.certificateId ||
    !isText(data.certificate.name) || !Array.isArray(data.questions) ||
    data.questions.length !== manifest.questionCount || !isObject(data.media) ||
    Object.keys(data.media).length !== manifest.mediaCount || !isObject(data.exam)) throw fail();

  const exam = data.exam;
  if (!isObject(exam.catalog) || !Array.isArray(exam.catalog.chapters) ||
    !Array.isArray(exam.modules) || !integer(exam.secondsPerQuestion, 1, 3600)) throw fail();
  for (const chapter of exam.catalog.chapters) {
    if (!isObject(chapter) || !isText(chapter.name) || !integer(chapter.questionCount, 1, 100_000) ||
      !Array.isArray(chapter.knowledgePoints)) throw fail();
    for (const point of chapter.knowledgePoints) {
      if (!isObject(point) || !isText(point.id) || !isText(point.name) || typeof point.section !== 'string' ||
        !integer(point.questionCount, 1, 100_000)) throw fail();
    }
  }
  for (const module of exam.modules) {
    if (!isObject(module) || !isText(module.id) || !isText(module.name) ||
      !integer(module.order, 0, 10_000) || typeof module.weight !== 'number' ||
      !Number.isFinite(module.weight) || module.weight < 0) throw fail();
  }
  const blueprint = exam.blueprint;
  if (blueprint !== null && (!isObject(blueprint) || blueprint.mode !== 'fixed_module' ||
    !integer(blueprint.questionCount, 1, 1000) || !integer(blueprint.questionsPerModule, 1, 1000) ||
    !integer(blueprint.durationMinutes, 1, 1440) ||
    !integer(blueprint.passingScore, 1, blueprint.questionCount))) throw fail();

  const media = data.media;
  for (const [key, value] of Object.entries(media)) {
    if (!localAsset.test(key) || !isObject(value) || !isText(value.mimeType) ||
      !assetMimes.test(value.mimeType) || !isText(value.base64) ||
      value.base64.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(value.base64)) throw fail();
  }
  const ids = new Set<string>();
  for (const question of data.questions) {
    if (!isObject(question) || !isText(question.id) || ids.has(question.id) ||
      !isText(question.question) || !isText(question.type) || !types.has(question.type) ||
      !isText(question.analysis) || !isObject(question.options) || !Array.isArray(question.answer) ||
      question.source === 'ai_generated' || question.source === 'user_submitted') throw fail();
    const options = question.options;
    if (question.type === 'short_answer' ? question.answer.length !== 0 || !isText(question.expectedAnswer) :
      !question.answer.length || question.answer.some((key: unknown) =>
        typeof key !== 'string' || !/^[A-E]$/.test(key) || !isText(options[key]))) throw fail();
    if (question.images !== undefined && (!Array.isArray(question.images) ||
      question.images.some((image: unknown) => !isObject(image) ||
        typeof image.src !== 'string' || !Object.hasOwn(media, image.src)))) throw fail();
    ids.add(question.id);
  }
  return data as unknown as OfflinePack;
}
