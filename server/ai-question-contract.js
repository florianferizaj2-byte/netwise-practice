import { normalizeQuestionDraft } from "./domain.js";

export const AI_QUESTION_GENERATOR_REVISION = "2026-10-29-question-contract-v2";
export const AI_QUESTION_REQUIRED_FIELDS = ["type","question","options","answer","analysis","chapter","knowledgePoint","difficulty","tags"];
const object = value => value && typeof value === "object" && !Array.isArray(value);
const stemKeys = ["question","题干","题目","stem","question_text","questionText","stem_text","stemText","题干内容","题目内容"];
const textStem = value => object(value) && stemKeys.some(key => typeof value[key] === "string");
export function normalizeGeneratedQuestion(raw, context = {}) {
  let source = raw;
  if (typeof source === "string" && source.trim().startsWith("{")) {
    try { source = JSON.parse(source); } catch { /* The unchanged validator will reject it. */ }
  }
  for (let depth=0; depth<2 && object(source) && !textStem(source); depth++) {
    const wrappers = ["question","item","data","questionData","question_data"].filter(key =>
      object(source[key]) && (textStem(source[key]) || key === "question" && ["text","content"].some(k => typeof source[key][k] === "string")));
    if (wrappers.length !== 1) break;
    const key=wrappers[0], inner={...source[key]}, outer={...source};
    delete outer[key];
    if (key === "question" && !textStem(inner)) inner.question = inner.text ?? inner.content;
    source={...outer,...inner};
  }
  if (object(source)) {
    source={...source};
    // Copy text only: never infer a missing stem from an answer, topic or seed.
    if (source.question == null && !["题干","题目","stem"].some(k => typeof source[k] === "string")) {
      const key=stemKeys.slice(4).find(k => typeof source[k] === "string");
      if (key) source.question=source[key];
    }
  }
  const metadata={...context};
  delete metadata.question; delete metadata.analysis; delete metadata.expectedAnswer;
  return normalizeQuestionDraft(source,metadata);
}
export function questionGenerationContract() {
  return `每个题目必须包含全部字段：type,question,options,answer,analysis,chapter,knowledgePoint,difficulty,tags。question 必须是10至2000字符的完整题干字符串，analysis 必须包含推导与结论，长度12至5000字符；不可用索引、摘要、审核意见、知识点名称代替题干，不可遗漏 question。完整结构是 {"questions":[{"type":"single_choice","question":"在这里写完整且可独立作答的题干","options":{"A":"选项一","B":"选项二","C":"选项三","D":"选项四"},"answer":["A"],"analysis":"在这里写解题依据、必要推导及结论","chapter":"本次指定章节","knowledgePoint":"本次指定知识点","difficulty":"easy","tags":["对应知识点"]}]}。示意内容必须替换成真实题目；只返回题目对象，不要在每项内再嵌套 question/data/item 对象。若有二级分类，保留 knowledgeSection。若 correction 指出字段缺失，必须按完整结构重新输出，不能只回补丁或缺失字段。`;
}
export function questionFailureFeedback(error) {
  if (Array.isArray(error?.issues)) {
    const fields=[...new Set(error.issues.slice(0,5).map(issue=>String(issue.path?.[0] || "题目")))];
    const label=fields.includes("question")?"题干 question":fields.join("、");
    return {code:"AI_QUESTION_SCHEMA_INVALID",correction:`生成格式不完整：请修正 ${label}。必须返回包含全部必填字段的完整题目对象，题干不得留空或复制参考题，答案与解析仍须独立正确。`,
      publicMessage:`生成数据的${label}字段缺失或格式不正确，当前题尚未交付。`};
  }
  return {code:"AI_QUESTION_QUALITY_REJECTED",correction:String(error?.message||"候选题未通过校验").replace(/\s+/g," ").slice(0,350),
    publicMessage:"候选题未通过内容检查，当前题尚未交付。"};
}
export function learningErrorPresentation(message, code, issues) {
  if (!message) return {message:null,code:code||null};
  const text=String(message);
  if (code==="AI_QUESTION_SCHEMA_INVALID" || Array.isArray(issues) ||
      /invalid_type|expected string|expected.*received undefined|字段、题型或答案不符合 Schema/i.test(text)) {
    const stem=/"question"|题干/.test(text);
    return {code:"AI_QUESTION_SCHEMA_INVALID",message:stem
      ?"生成数据缺少完整题干，已保留交付题目与作答；系统修复后可恢复剩余题目。"
      :"生成数据的必填字段不完整，已保留交付题目与作答；系统修复后可恢复剩余题目。"};
  }
  if (code==="AI_QUESTION_QUALITY_REJECTED")
    return {code,message:"候选题未通过内容审核，已保留交付题目与作答。本轮重试已暂停，请核对原因后继续。"};
  return {code:code||"AI_LEARNING_GENERATION_FAILED",message:text.replace(/\s+/g," ").slice(0,240)};
}
