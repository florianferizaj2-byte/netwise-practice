// Reviewed, server-only pilot. Quiz keys and wrong-option branches never enter public assets.
import { validateLesson } from "./protocol.js";

export const course = Object.freeze({
  id: "vlan-broadcast-domain",
  version: "20261011-v1",
  nodeId: "network-engineer:03.02.01",
  title: "VLAN 广播域",
  subtitle: "看懂广播怎么走，再用小测确认理解。",
  minutes: 8,
  concepts: [
    { id: "forwarding", title: "广播如何转发" },
    { id: "isolation", title: "VLAN 如何隔离" },
    { id: "access", title: "Access 端口归属" },
  ],
  sources: [
    {
      title: "考匠已审核课程 · VLAN 与交换端口",
      path: "network-engineer:03.02.01 / 03.02.02",
    },
    {
      title: "Cisco · VLAN 与广播域",
      url: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/lan-wan/lan-wan/m_lsw-conf-rout-vlan.html",
    },
    {
      title: "Cisco · 交换机广播转发",
      url: "https://www.cisco.com/c/en/us/support/docs/lan-switching/ethernet/12006-chapter22.html",
    },
  ],
});
const E = (id, title, paragraphs) => ({
  type: "ExplanationCard",
  id,
  title,
  paragraphs,
});
const K = (id, title, items) => ({ type: "KnowledgeCard", id, title, items });
const T = (id, title, columns, rows) => ({
  type: "ComparisonTable",
  id,
  title,
  columns,
  rows,
});
export function diagram(id, scenario, source = "A", vlans = [10, 10, 20, 20]) {
  return {
    type: "NetworkDiagram",
    id,
    scenario,
    source,
    title:
      scenario === "single-domain"
        ? "一台交换机，一个广播域"
        : scenario === "access-port"
          ? "从 Access 端口看 VLAN 归属"
          : "同一台交换机，两个广播域",
    caption:
      "示例中所有端口正常转发，无三层转发或特殊过滤；发出广播的主机不接收交换机的回发。",
    hosts: ["A", "B", "C", "D"].map((host, i) => ({
      id: host,
      port: i + 1,
      vlan: vlans[i],
    })),
  };
}

export const teaching = [
  [
    E("forwarding-explain", "广播不是只找一台主机", [
      "以太网广播帧的目的 MAC 地址是 FF:FF:FF:FF:FF:FF。它想让同一广播域中的其他主机都收到这条消息。",
      "交换机收到广播后，会向同一 VLAN 中其他处于转发状态的端口复制转发；收到帧的入口端口不再回发。",
    ]),
    diagram("forwarding-diagram", "single-domain", "A", [10, 10, 10, 10]),
    K("forwarding-key", "记住两个范围", [
      "同一 VLAN 的其他转发端口。",
      "排除广播进入交换机的那个端口。",
    ]),
  ],
  [
    E("isolation-explain", "把广播限制在自己的 VLAN 内", [
      "VLAN 把一个物理交换网络划分为不同的逻辑广播域。主机 A、B 在 VLAN 10，主机 C、D 在 VLAN 20。",
      "A 发出广播时，B 可以收到；C 和 D 属于另一个 VLAN，不会收到这份二层广播。物理上接在同一台交换机，不等于属于同一广播域。",
    ]),
    diagram("isolation-diagram", "vlan-isolation"),
    T(
      "isolation-compare",
      "区分物理连接与逻辑归属",
      ["判断条件", "广播能否直接到达"],
      [
        ["同一 VLAN，其他正常转发端口", "可以"],
        ["同一交换机，不同 VLAN", "不可以"],
        ["需要跨 VLAN 通信", "通常需要三层转发"],
      ],
    ),
  ],
  [
    E("access-explain", "终端接入后，由端口确定归属", [
      "Access 端口通常用于连接电脑等终端，通常只属于一个 VLAN。普通终端发送未打 VLAN 标签的以太网帧。",
      "例如端口 1 配置为 Access VLAN 10：未标记帧进入后，交换机把它归入 VLAN 10。归属由端口配置决定，不由电脑名称或 IP 地址自动决定。",
    ]),
    diagram("access-diagram", "access-port"),
    K("access-key", "把这条路径串起来", [
      "终端发送未标记帧 → Access 端口按配置归入 VLAN → 只在对应 VLAN 内转发。",
      "Access 通常面向单个 VLAN；Trunk 用于承载多个 VLAN。此处只讨论普通终端接入。",
    ]),
  ],
];
export const foundations = [
  E("forwarding-foundation", "先认识两个词", [
    "帧：以太网中传输的一份数据。广播域：一份二层广播能够到达的范围。",
  ]),
  E("isolation-foundation", "VLAN 是逻辑分组", [
    "可以把 VLAN 想成交换网络中的不同房间。设备接在同一台交换机，也可以被分配到不同的房间。",
  ]),
  E("access-foundation", "什么是未标记帧", [
    "未标记帧没有携带 802.1Q VLAN 标签。交换机根据接入端口的配置判断它属于哪个 VLAN。",
  ]),
];
const Q = (id, prompt, entries, answer, branches, visual) => ({
  id,
  prompt,
  options: entries.map(([id, text]) => ({ id, text })),
  answer,
  branches,
  visual,
});
const branch = (errorType, title, explanation, hint) => ({
  errorType,
  title,
  explanation,
  hint,
});
const faults = {
  unicast: branch(
    "broadcast-as-unicast",
    "把广播当成了单播",
    "广播的目的地址不是某一台主机。即使交换机已经学习了各主机的 MAC 地址，也不会只把这份广播发给其中一台。",
    "先判断广播还是单播，再判断 VLAN 范围。",
  ),
  reflection: branch(
    "ingress-reflection",
    "忘记排除入口端口",
    "广播从哪个端口进入，就不再由那个端口回发。发送主机已经发出了这份帧，不需要交换机再复制一份给它。",
    "在同一 VLAN 的端口中，先划掉入口端口。",
  ),
  drop: branch(
    "broadcast-dropped",
    "误以为交换机会丢弃广播",
    "在本课正常转发、没有特殊过滤的条件下，二层交换机会转发广播；VLAN 控制它的范围。",
    "交换机限制范围，并不默认丢弃所有广播。",
  ),
  physical: branch(
    "physical-equals-domain",
    "把同一交换机当成同一广播域",
    "VLAN 是逻辑划分。A、B 的 VLAN 10 与 C、D 的 VLAN 20 即使共用一台物理交换机，也属于两个广播域。",
    "看端口所属 VLAN，不看交换机是不是同一台。",
  ),
  cross: branch(
    "broadcast-crosses-vlan",
    "认为广播可以越过 VLAN",
    "“广播”只表示在自己的广播域内扩散。VLAN 10 的二层广播不会被普通二层交换机转到 VLAN 20。",
    "先圈出发送主机的 VLAN，再排除入口端口。",
  ),
  ip: branch(
    "ip-determines-vlan",
    "把 IP 地址当成 VLAN 归属",
    "VLAN 是二层逻辑划分，IP 子网属于三层。普通 Access 端口收到未标记帧时，根据端口配置确定 VLAN，不会因为 IP 一样就让广播跨 VLAN。",
    "IP 地址与 VLAN ID 不是同一个判断依据。",
  ),
  tagging: branch(
    "host-must-tag",
    "以为电脑必须先打 VLAN 标签",
    "普通终端接 Access 端口时通常发送未标记帧。交换机在入口按 Access VLAN 配置为该帧确定归属。",
    "终端可以不带标签；端口配置提供 VLAN 归属。",
  ),
  trunk: branch(
    "access-as-trunk",
    "混淆了 Access 与 Trunk",
    "Access 端口通常只属于一个 VLAN，用于终端接入；Trunk 用于承载多个 VLAN。不能把普通 Access 端口当成所有 VLAN 的入口。",
    "先确认端口类型，再看它配置的 VLAN。",
  ),
};

export const quizzes = [
  {
    main: Q(
      "forwarding-check",
      "图中四台主机都属于 VLAN 10。A 发出广播后，交换机应把帧转发给哪些主机？",
      [
        ["a", "只发给 B，按已知 MAC 地址单播"],
        ["b", "A、B、C、D 都收到"],
        ["c", "B、C、D 收到，不回发给 A"],
        ["d", "广播不能通过交换机，全部丢弃"],
      ],
      "c",
      { a: faults.unicast, b: faults.reflection, d: faults.drop },
    ),
    variants: [
      Q(
        "forwarding-variant-1",
        "换成 D 发出广播。四台主机仍在同一 VLAN，且端口正常转发。谁会收到交换机转发的帧？",
        [
          ["a", "A、B、C"],
          ["b", "只发给 A"],
          ["c", "A、B、C、D"],
          ["d", "没有任何主机收到"],
        ],
        "a",
        { b: faults.unicast, c: faults.reflection, d: faults.drop },
        diagram(
          "forwarding-variant-1-diagram",
          "single-domain",
          "D",
          [10, 10, 10, 10],
        ),
      ),
      Q(
        "forwarding-variant-2",
        "同一 VLAN 内，广播从主机 B 连接的端口 2 进入。正常情况下，应从哪些端口转发？",
        [
          ["a", "只从端口 1"],
          ["b", "端口 1、2、3、4"],
          ["c", "不从任何端口转发"],
          ["d", "端口 1、3、4"],
        ],
        "d",
        { a: faults.unicast, b: faults.reflection, c: faults.drop },
        diagram(
          "forwarding-variant-2-diagram",
          "single-domain",
          "B",
          [10, 10, 10, 10],
        ),
      ),
    ],
    correct: "广播向同一 VLAN 的其他转发端口扩散，入口端口不回发。",
  },
  {
    main: Q(
      "isolation-check",
      "A、B 属于 VLAN 10，C、D 属于 VLAN 20。未配置三层转发，A 发出的二层广播会到达哪里？",
      [
        ["a", "B、C、D；同一交换机就是一个广播域"],
        ["b", "只有 B"],
        ["c", "只有 C、D；广播会跨 VLAN 扩散"],
        ["d", "取决于各主机的 IP 地址是否相同"],
      ],
      "b",
      { a: faults.physical, c: faults.cross, d: faults.ip },
    ),
    variants: [
      Q(
        "isolation-variant-1",
        "现在由 VLAN 20 的 C 发出广播。端口配置不变且没有三层转发，哪台主机会收到？",
        [
          ["a", "A、B、D，因为在同一台交换机"],
          ["b", "A、B，因为广播会跨 VLAN"],
          ["c", "IP 地址相同的主机"],
          ["d", "只有 D"],
        ],
        "d",
        { a: faults.physical, b: faults.cross, c: faults.ip },
        diagram("isolation-variant-1-diagram", "vlan-isolation", "C"),
      ),
      Q(
        "isolation-variant-2",
        "将端口 4 改为 VLAN 10，端口 3 仍属于 VLAN 20。A 发出广播时，哪些主机会收到？",
        [
          ["a", "B、C、D，因为共用交换机"],
          ["b", "只有 C，因为广播跨 VLAN"],
          ["c", "B、D"],
          ["d", "IP 地址相同的主机"],
        ],
        "c",
        { a: faults.physical, b: faults.cross, d: faults.ip },
        diagram(
          "isolation-variant-2-diagram",
          "vlan-isolation",
          "A",
          [10, 10, 20, 10],
        ),
      ),
    ],
    correct:
      "先按发送端口的 VLAN 确定广播域，再排除入口端口；其他 VLAN 的主机不会收到这份二层广播。",
  },
  {
    main: Q(
      "access-check",
      "电脑向配置为 Access VLAN 10 的端口 1 发送未标记帧。交换机如何确定该帧的 VLAN 归属？",
      [
        ["a", "按端口 1 的 Access VLAN 配置，归入 VLAN 10"],
        ["b", "电脑必须先给帧添加 VLAN 10 标签"],
        ["c", "按电脑的 IP 地址自动选择 VLAN"],
        ["d", "Access 端口会让它进入所有 VLAN"],
      ],
      "a",
      { b: faults.tagging, c: faults.ip, d: faults.trunk },
    ),
    variants: [
      Q(
        "access-variant-1",
        "电脑 C 向配置为 Access VLAN 20 的端口 3 发送未标记帧。它会被归入哪个 VLAN？",
        [
          ["a", "必须由电脑添加标签才能确定"],
          ["b", "由电脑的 IP 地址决定"],
          ["c", "VLAN 20"],
          ["d", "所有 VLAN"],
        ],
        "c",
        { a: faults.tagging, b: faults.ip, d: faults.trunk },
        diagram("access-variant-1-diagram", "access-port", "C"),
      ),
      Q(
        "access-variant-2",
        "端口 1 保持 Access VLAN 10 配置。电脑 A 更换了 IP 地址，仍发送未标记帧；VLAN 归属会怎样？",
        [
          ["a", "随新 IP 自动改变"],
          ["b", "仍归入 VLAN 10"],
          ["c", "必须先由电脑添加 VLAN 标签"],
          ["d", "自动成为承载所有 VLAN 的 Trunk"],
        ],
        "b",
        { a: faults.ip, c: faults.tagging, d: faults.trunk },
      ),
    ],
    correct:
      "普通 Access 端口按配置把未标记帧归入对应 VLAN；主机名称和 IP 地址不会自动改变这个归属。",
  },
];

export function publicQuiz(question, kind) {
  return {
    type: "MiniQuiz",
    id: question.id,
    title: kind === "variant" ? "换个场景，再确认一次" : "停一下，检验理解",
    prompt: question.prompt,
    options: question.options,
    kind,
  };
}
export function remedialCards(fault, stage) {
  return [
    E(`${course.concepts[stage].id}-remedy-${fault.errorType}`, fault.title, [
      fault.explanation,
    ]),
    K(`${course.concepts[stage].id}-remedy-key`, "下次先这样判断", [
      fault.hint,
    ]),
  ];
}

// Cache only reviewed general teaching. Private attempts and feedback are built separately.
for (let i = 0; i < teaching.length; i++) {
  validateLesson(teaching[i]);
  validateLesson([foundations[i]]);
  for (const q of [quizzes[i].main, ...quizzes[i].variants]) {
    if (!q.options.some((o) => o.id === q.answer))
      throw new Error("标准答案不在选项中");
    if (q.options.some((o) => o.id !== q.answer && !q.branches[o.id]))
      throw new Error("缺少错项补课分支");
    validateLesson([publicQuiz(q, "check"), ...(q.visual ? [q.visual] : [])]);
    for (const fault of Object.values(q.branches))
      validateLesson(remedialCards(fault, i));
  }
}
