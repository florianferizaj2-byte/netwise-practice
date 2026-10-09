export function question(stem, answer, explanation, hint, options = {}) {
  return { stem, answer: String(answer), explanation, hint, ...options };
}

export function lesson(parentCode, slug, title, summary, points, example, pitfall, questions) {
  return { parentCode, slug, title, summary, points, example, pitfall, questions };
}

export const sources = {
  syllabus: 'https://zs.gingkoc.edu.cn/ueditor/php/upload/file/20240329/1711693941663940.pdf',
  formulas: 'https://support.microsoft.com/zh-cn/excel/get-started/overview-of-formulas-in-excel',
  functions: 'https://support.microsoft.com/zh-cn/excel/excel-functions-by-category',
  sections: 'https://support.microsoft.com/zh-cn/word/use-section-breaks-to-change-the-layout-or-formatting-in-one-section-of-your-word-document',
  master: 'https://support.microsoft.com/zh-cn/powerpoint/training/what-is-a-slide-master-in-powerpoint',
  cloud: 'https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-145.pdf',
};
