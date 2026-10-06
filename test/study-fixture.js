import { gradeStudyQuestion } from "../server/study-grading.js";

const blank = (id, answer, kind = "number", aliases = []) => ({ id, label: "答案", answer, aliases, kind, caseSensitive: false, unit: "", tolerance: 0 });
export const studyReference = "参考资料：二进制各位只用0和1，基数为2。各数位的权重称为位权，从右向左分别为1、2、4、8。二进制1101对应十进制13，1110对应14，101对应5。八进制17对应十进制15。出处：测试专用人工确认样例，不用于生产教材。";
export function fixtureStudyBundle() {
  return {
    lesson: {
      title: "进制互转", summary: "不同进制是同一个数的不同写法。转换时先看基数，再按每一位的权重计算，不需要死记全部结果。",
      points: ["二进制只用0和1，基数为2；从右到左，位权是1、2、4、8。", "把各位数字乘以对应的位权，再把结果相加，就得到十进制值。", "十进制转二进制，可以先找不超过它的最大位权，再逐项分解。"],
      example: "二进制1101中为1的数位对应8、4、1。把它们相加，8＋4＋1＝13，所以1101对应十进制13。十进制14则可以拆为8＋4＋2，对应二进制1110。",
      pitfall: "位权从最右边开始数；不要把二进制的1101直接当作十进制的一千一百零一。",
    },
    questions: [
      { id: "q1", stem: "二进制使用的数字符号只有0和{{b1}}。", stage: "基础", blanks: [blank("b1", "1")], explanation: "二进制只有0和1两种数字符号，遇到二时向高位进位。", hint: "想想二进制允许多少种数字符号。" },
      { id: "q2", stem: "二进制每一位对应的权重称为{{b1}}，其基数是{{b2}}。", stage: "基础", blanks: [blank("b1", "位权", "term", ["权值"]), blank("b2", "2")], explanation: "数位对应的权重叫位权。二进制只有两种数字符号，因此基数是2。", hint: "把表示数位权重的术语和进制的基数分开考虑。" },
      { id: "q3", stem: "二进制1101转换成十进制，其值是{{b1}}。", stage: "理解", blanks: [blank("b1", "13")], explanation: "1101对应的位权为8、4、2、1，把为1的位权相加得到8＋4＋1＝13。", hint: "从右到左标出位权，只加为1的那些位。" },
      { id: "q4", stem: "十进制13转换成二进制，结果是{{b1}}。", stage: "理解", blanks: [blank("b1", "1101", "exact")], explanation: "13可以拆为8＋4＋1，因此8、4、1的位置为1，2的位置为0，结果为1101。", hint: "先把这个数分解成几个不同的二进制位权。" },
      { id: "q5", stem: "十进制数14和5对应的二进制数分别是{{b1}}和{{b2}}。", stage: "应用", blanks: [blank("b1", "1110", "exact"), blank("b2", "101", "exact")], explanation: "14＝8＋4＋2，对应1110；5＝4＋1，对应101。两空分别独立计分。", hint: "分别分解这两个数，不要混用两个空的位权。" },
      { id: "q6", stem: "八进制数17转换成十进制，其值是{{b1}}。", stage: "应用", blanks: [blank("b1", "15")], explanation: "八进制17的十位位权为8，个位位权为1，所以1×8＋7×1＝15。", hint: "这里的基数改变了，重新确定各位的位权。" },
    ],
  };
}
export function fixtureStudyReview(bundle = fixtureStudyBundle()) {
  return { lesson: { valid: true, knowledgeCorrect: true, nodeAligned: true,
    reason: "核对定义、位权和计算示例，知识正确；讲解与进制互转知识点范围一致。" }, questions: bundle.questions.map((question) => ({ id: question.id,
    valid: true, nodeAligned: true, answerCorrect: true, explanationCorrect: true, hintSafe: true,
    reason: "考查内容符合进制互转知识点，题干可解，答案、解析与安全提示一致。" })) };
}
export function mockStudyAI() {
  const state = { generationCalls: 0, gradeCalls: 0, teacherCalls: 0, failGrade: false, failTeacher: false,
    rejectGeneration: false, rejectKnowledge: false, rejectAlignment: false };
  return Object.assign(state, {
    async generate(node) {
      state.generationCalls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      const bundle = fixtureStudyBundle(); bundle.lesson.title = node.name;
      const review = fixtureStudyReview(bundle);
      if (state.rejectGeneration) review.lesson.valid = false;
      if (state.rejectKnowledge) { review.lesson.knowledgeCorrect = false; review.lesson.reason = "讲解中的计算过程存在错误，请核对参考资料。"; }
      if (state.rejectAlignment) { review.lesson.nodeAligned = false; review.lesson.reason = "讲解包含不属于当前知识点的内容，请收窄范围。"; }
      return { bundle, review };
    },
    async grade(question, results) {
      state.gradeCalls++;
      if (state.failGrade) throw new Error("测试上游暂时不可用");
      return results.map((row) => row.verdict !== "uncertain" ? row : { ...row,
        verdict: row.response === "数位的权值" ? "correct" : /忽略|满分|不是/.test(row.response) ? "incorrect" : "uncertain",
        reason: row.response === "数位的权值" ? "与位权含义一致。" : "需要依据术语含义判定。" });
    },
    async teacher() {
      state.teacherCalls++;
      if (state.failTeacher) throw new Error("测试老师暂时不可用");
      return { conclusion: "先从最右边的一位开始看。", points: ["每往左一位，位权就乘以基数。", "把各位数字和位权相乘后求和。"], example: "可以先用两三位的小数练习。" };
    },
  });
}

// Exercises the real provider parsing/prompt path without a paid network call.
export function mockStudyFetch() {
  return async (_url, options) => {
    const { messages } = JSON.parse(options.body), instruction = messages[0].content;
    const input = JSON.parse(messages[1].content);
    let content;
    if (instruction.includes("独立复核短课")) content = fixtureStudyReview(input.bundle);
    else if (instruction.includes("生成一节从头讲解")) content = fixtureStudyBundle();
    else if (instruction.includes("按照固定评分标准")) content = { results: input.responses.map((row) => ({ blankId: row.blankId,
      verdict: row.response === "数位的权值" ? "correct" : "uncertain", reason: "结合固定评分标准判定。" })) };
    else content = { conclusion: "先按位权分解，再把结果相加。", points: ["从最右边开始确定每一位的权重。"], example: "先尝试只有两位的二进制数。" };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 300, completion_tokens: 200, total_tokens: 500 } }), { headers: { "Content-Type": "application/json" } });
  };
}
