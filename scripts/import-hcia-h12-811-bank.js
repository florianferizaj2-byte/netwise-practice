import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const inputPath =
  process.argv[2] || "C:/Users/周凯鑫/Desktop/HCIA-Datacom_H12-811_题库.json";
const destination = path.join(workspace, "server/question-banks/hcia-datacom");
const sourceBytes = fs.readFileSync(inputPath);
const source = JSON.parse(sourceBytes.toString("utf8"));

const ranges = (text) =>
  text.split(",").flatMap((part) => {
    const [start, end = start] = part.split("-").map(Number);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
const ids = (text) => new Set(ranges(text));
const inSet = (id, text) => ids(text).has(id);

function moduleFor(question) {
  const text = `${question.question} ${question.explanation || ""}`;
  const id = question.id;
  if (question.chapter === "WLAN技术基础") {
    if (inSet(id, "76,152,159")) return "WLAN 组网架构";
    if (inSet(id, "154,156,157")) return "WLAN 工作原理与配置";
    return "WLAN 技术基础";
  }
  if (question.chapter === "数据中心与园区网络")
    return inSet(id, "172,176-178,180")
      ? "园区网络典型组网方案"
      : "数据中心网络基础";
  if (/控制器.*南向|南向开放接口|NETCONF|YANG|REST API/.test(text))
    return "网络编程自动化";
  if (/OSPF|\bABR\b|Area ?0/.test(text)) return "OSPF 原理与配置";
  if (/IPv6|EUI-64|RA报文|RS报文|Anycast|任播/.test(text))
    return "IPv6 地址与配置";
  if (/ACL|traffic-filter/.test(text)) return "ACL 原理与配置";
  if (/\bNAT|Easy IP|NAPT/.test(text)) return "NAT 原理与配置";
  if (/AAA/.test(text)) return "AAA 原理与配置";
  if (/STP|RSTP|MSTP|BPDU|根桥|桥优先级|Blocking|Forwarding/.test(text))
    return "生成树原理与配置";
  if (/VLAN|802\.1Q|PVID|Hybrid/.test(text)) return "VLAN 原理与配置";
  if (/Eth-Trunk|LACP|链路聚合/.test(text)) return "以太网链路聚合";
  if (/VXLAN|Spine-Leaf|数据中心|NFV|MANO/.test(text))
    return "数据中心网络基础";
  if (/CloudCampus|园区|iStack|CSS|堆叠/.test(text))
    return "园区网络典型组网方案";
  if (/WLAN|Wi-Fi|无线|SSID|802\.11/.test(text)) {
    if (/FIT AP|\bAC\b|CAPWAP|转发模式/.test(text)) return "WLAN 组网架构";
    if (/漫游|认证|STA/.test(text)) return "WLAN 工作原理与配置";
    return "WLAN 技术基础";
  }
  if (/SNMP|Trap|Telnet|SSH|VTY|远程管理|日志|display interface/.test(text))
    return "网络设备管理";
  if (/DHCP|DNS|FTP|TFTP|NTP/.test(text)) return "网络服务与应用";
  if (/tracert|\bping\b|排查|排障|故障/.test(text)) return "网络故障排除";
  if (
    inSet(id, "62,80-85,88,160-165") ||
    /command-privilege|系统视图|当前配置|历史命令|mkdir|delete \/unreserved|保存当前配置/.test(
      text,
    )
  )
    return "华为网络设备操作系统";
  if (/静态路由|默认路由|直连路由|RIP|路由表|ECMP|路由器主要依据/.test(text))
    return "IP 路由基础";
  if (id === 59) return "IP 路由基础";
  if (/IPv4|ARP|ICMP|TTL|子网|掩码|广播地址|网关|IP地址/.test(text))
    return "IP 地址与配置";
  if (/广播域/.test(text)) return "以太网交换基础";
  if (/MAC|交换机|线缆|光纤|CSMA\/CD|以太网/.test(text))
    return "以太网交换基础";
  if (/HTTP|TCP|UDP|OSI|TCP\/IP|网络通信/.test(text)) return "网络参考模型";
  throw new Error(`无法映射 HCIA 模块：${id} ${question.question}`);
}

function knowledgePointFor(chapter, question) {
  const text = `${question.question} ${question.explanation || ""}`;
  const has = (pattern) => pattern.test(text);
  const points = {
    网络参考模型: has(/TCP|UDP|HTTP/) ? "TCP 与 UDP" : "OSI 与 TCP/IP 模型",
    华为网络设备操作系统: has(/save|配置|delete|mkdir/)
      ? "配置保存"
      : "命令行视图",
    以太网交换基础: has(/MAC/) ? "MAC 地址表" : "交换机转发",
    "VLAN 原理与配置": has(/Trunk/) ? "Trunk 接口" : "802.1Q",
    生成树原理与配置: has(/RSTP|MSTP/) ? "STP/RSTP" : "根桥选举",
    以太网链路聚合: has(/LACP/) ? "LACP" : "Eth-Trunk",
    "IP 地址与配置": has(/ARP/)
      ? "ARP"
      : has(/ICMP|TTL|ping/)
        ? "ICMP"
        : "子网划分",
    "IP 路由基础": has(/静态|默认/) ? "静态路由" : "路由表",
    "OSPF 原理与配置": has(/DR|BDR/)
      ? "DR/BDR"
      : has(/邻居|FULL|LSDB/)
        ? "邻居状态"
        : "单区域 OSPF",
    "IPv6 地址与配置": has(/RA|RS/) ? "邻居发现" : "IPv6 地址类型",
    "ACL 原理与配置": has(/高级/) ? "高级 ACL" : "基本 ACL",
    "AAA 原理与配置": "认证",
    网络服务与应用: has(/DHCP/) ? "DHCP" : "FTP/TFTP",
    "NAT 原理与配置": has(/Easy IP/) ? "Easy IP" : "动态 NAT",
    数据中心网络基础: has(/VXLAN/) ? "Underlay 与 Overlay" : "Leaf-Spine",
    "WLAN 技术基础": has(/802\.11|Wi-Fi/) ? "802.11" : "射频基础",
    "WLAN 组网架构": has(/CAPWAP/) ? "CAPWAP" : "AC 与 AP",
    "WLAN 工作原理与配置": has(/漫游/) ? "漫游" : "WLAN 安全",
    网络设备管理: has(/SNMP|Trap/) ? "SNMP" : "远程管理",
    网络编程自动化: "REST API",
    网络故障排除: "连通性检查",
    园区网络典型组网方案: has(/网关/) ? "网关部署" : "接入/汇聚/核心",
  };
  return points[chapter];
}

function normalizeType(question) {
  if (
    question.answer === "True" ||
    question.answer === "False" ||
    !question.options
  )
    return "true_false";
  const answers = question.answer.split(",").filter(Boolean);
  return question.type === "多选" && answers.length > 1
    ? "multiple_choice"
    : "single_choice";
}

function normalizeQuestion(question) {
  const type = normalizeType(question);
  const chapter = moduleFor(question);
  const prompt =
    question.id === 156 ? "在 WLAN 中，无线漫游是指什么？" : question.question;
  const answer =
    type === "true_false"
      ? [question.answer === "True" ? "A" : "B"]
      : question.answer.split(",").filter(Boolean);
  const options =
    type === "true_false"
      ? { A: "正确", B: "错误" }
      : Object.fromEntries(
          Object.entries(question.options).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        );
  const set = question.source_type === "网络回忆题" ? "recall" : "simulation";
  const structuralCorrection =
    type !==
    ({ 单选: "single_choice", 多选: "multiple_choice", 判断: "true_false" }[
      question.type
    ] || question.type)
      ? {
          originalType: question.type,
          normalizedType: type,
          reason:
            type === "true_false"
              ? "原记录的答案为 True/False 或缺少选项，按判断题导入"
              : "原记录题型与选项及答案数量不一致，按实际结构导入",
        }
      : null;
  return {
    id: `hcia-h12-811-${set}-${String(question.id).padStart(3, "0")}`,
    type,
    question: prompt,
    options,
    answer,
    analysis: question.explanation,
    chapter,
    knowledgePoint: knowledgePointFor(chapter, question),
    difficulty:
      type === "true_false"
        ? "easy"
        : /如下|部分配置|Cost|网段|EUI-64|子网/.test(question.question)
          ? "hard"
          : "medium",
    tags: ["HCIA-Datacom", "H12-811", chapter],
    provenance: [
      {
        originalQuestionId: question.id,
        originalChapter: question.chapter,
        sourceUrl: question.source_url,
        ...(question.note ? { note: question.note } : {}),
        ...(structuralCorrection ? { structuralCorrection } : {}),
      },
    ],
  };
}

if (!Array.isArray(source.questions) || source.questions.length !== 180)
  throw new Error("输入文件不是预期的 180 道 HCIA-Datacom 题库");

const normalized = source.questions.map(normalizeQuestion);
const recalls = normalized.filter((question) =>
  question.id.includes("-recall-"),
);
const simulations = normalized.filter((question) =>
  question.id.includes("-simulation-"),
);
if (recalls.length !== 89 || simulations.length !== 91)
  throw new Error("题源分组数量不符合输入文件元数据");

const structuralCorrections = normalized
  .filter((question) => question.provenance[0].structuralCorrection)
  .map((question) => ({
    id: question.id,
    originalQuestionId: question.provenance[0].originalQuestionId,
    ...question.provenance[0].structuralCorrection,
  }));
const report = {
  importedAt: new Date().toISOString(),
  input: {
    fileName: path.basename(inputPath),
    sha256: crypto.createHash("sha256").update(sourceBytes).digest("hex"),
    meta: source.meta,
  },
  counts: {
    total: normalized.length,
    userProvidedPublicRecalls: recalls.length,
    userProvidedOriginalSimulations: simulations.length,
    types: normalized.reduce((all, question) => {
      all[question.type] = (all[question.type] || 0) + 1;
      return all;
    }, {}),
  },
  sourceStatement:
    "按用户提供文件的说明导入：公开回忆题和原创模拟题均非华为官方真题；原始链接仅用于追溯来源，不代表本站认可其准确性。",
  sourceUrls: [
    ...new Set(source.questions.map((question) => question.source_url)),
  ],
  chapterMapping: normalized.reduce((all, question) => {
    const original = question.provenance[0].originalChapter;
    all[original] = all[original] || {};
    all[original][question.chapter] =
      (all[original][question.chapter] || 0) + 1;
    return all;
  }, {}),
  structuralCorrections,
  notedQuestions: source.questions
    .filter((question) => question.note)
    .map((question) => ({ id: question.id, note: question.note })),
};

for (const [folder, questions] of [
  ["user-provided-recalls", recalls],
  ["user-provided-simulations", simulations],
]) {
  const output = path.join(destination, "questions", folder);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "questions.json"),
    `${JSON.stringify(questions, null, 2)}\n`,
    "utf8",
  );
}
fs.mkdirSync(path.join(destination, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(destination, "reports", "h12-811-user-provided.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(
  `Imported ${recalls.length} public recall questions and ${simulations.length} original simulation questions.`,
);
