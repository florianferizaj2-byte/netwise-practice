export const reviewVerdict = {
  valid: true,
  relevant: true,
  singleAnswerCorrect: true,
  contradictions: [],
  reason: "Fixture review accepted",
};
const stems = [
  "广播网络规划时，若要求一台 OSPF 路由器始终不参与 DR 和 BDR 选举，应如何设置其接口优先级？",
  "三台路由器同时开始 OSPF 选举，怎样让其中一台设备不具备 DR 或 BDR 候选资格？",
  "维护人员只希望一台新接入路由器学习 OSPF 路由而不竞选 DR，应该使用哪种配置？",
  "某路由器能正常交换 OSPF 路由，却从未作为 DR 候选，以下哪种接口配置可能解释该现象？",
  "在需要固定 DR 候选范围的园区网络中，对非候选 OSPF 路由器应采取哪种接口设置？",
  "分支升级后，需要让 OSPF 设备保留邻接关系但退出候选范围，应设置哪项参数？",
  "排查广播网络选举结果时，管理员希望测试排除候选的配置，应怎样修改 OSPF 接口？",
  "灾备设备需同步 OSPF 路由，但不应被选为 DR 或 BDR，应该采用哪种配置策略？",
  "实验室要验证 OSPF 候选资格与接口优先级之间的关系，下列哪项设置会取消候选资格？",
  "设计共享网段时，如何配置只负责路由交换而不参与 DR 竞选的 OSPF 路由器？",
];
export function fixtureQuestion(
  i = 0,
  spec = { stage: "基础理解", difficulty: "easy" },
) {
  return {
    type: "single_choice",
    question: stems[i % stems.length],
    options: {
      A: "将接口优先级设置为 0",
      B: "将接口优先级设置为 100",
      C: "将接口优先级设置为 200",
      D: "将接口优先级设置为 255",
    },
    answer: ["A"],
    analysis:
      "接口优先级为 0 表示不参与 DR/BDR 选举，但不妨碍建立邻接关系和交换 OSPF 路由。",
    chapter: "路由协议",
    knowledgePoint: "OSPF 选举资格",
    difficulty: spec.difficulty,
    stage: spec.stage,
    tags: ["OSPF", "AI针对练习"],
  };
}
export function mockAI() {
  let generated = 0;
  return async (_url, options) => {
    const { messages } = JSON.parse(options.body),
      system = messages[0].content;
    const payload = messages.length > 1 ? JSON.parse(messages[1].content) : {};
    let content;
    if (system.includes("Reply with OK")) content = "OK";
    else if (system.includes("逐题独立审核"))
      content = {
        reviews: payload.items.map(({ index }) => ({
          index,
          ...reviewVerdict,
        })),
      };
    else if (system.includes("独立审核")) content = reviewVerdict;
    else if (system.includes("审核苏格拉底")) content = { safe: true };
    else if (system.includes("分析用户具体错误"))
      content = {
        mistakeType: "dr_eligibility",
        weakKnowledge: "OSPF 选举资格与优先级",
        reason:
          "用户可能将路由交换能力与 DR 候选资格混为一谈，需要先判断选举资格。",
      };
    else if (system.includes("一次生成"))
      content = {
        questions: payload.specs.map((spec) =>
          fixtureQuestion(generated++, spec),
        ),
      };
    else if (system.includes("今日30题"))
      content = {
        summary: "今天重点复习 OSPF 选举、子网广播地址与 ACL 规则顺序。",
        weaknesses: [
          {
            knowledgePoint: "OSPF DR/BDR",
            reason: "先判断候选资格，再判断选举顺序。",
          },
        ],
        tasks: [
          {
            knowledgePoint: "OSPF DR/BDR",
            count: 10,
            focus: "选举资格与非抢占规则",
          },
          {
            knowledgePoint: "子网广播地址",
            count: 10,
            focus: "广播地址与主机边界",
          },
          { knowledgePoint: "ACL 匹配顺序", count: 10, focus: "首条匹配原则" },
        ],
      };
    else if (system.includes("苏格拉底式提示"))
      content = {
        text: "先想一想候选资格与选举次序是否属于同一个判断步骤，暂时不要比较地址大小。",
      };
    else
      content = {
        text: "选举资格决定设备能否成为候选者；只有具备资格后，才继续比较优先级和 Router ID。",
      };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                typeof content === "string" ? content : JSON.stringify(content),
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}
