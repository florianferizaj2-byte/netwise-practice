import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (name) => JSON.parse(fs.readFileSync(new URL(name, root), "utf8"));
const mappings = {
  "sichuan-upgrading-computer": {
    "computer-foundations": "computer",
    "hardware-software": "chip",
    "office-automation": "office",
    "network-security": "network",
    "algorithms-programming": "code",
    "database-technology": "database",
    "emerging-technology": "technology",
  },
  "hcia-datacom": {
    "network-model": "layers",
    "huawei-network-os": "terminal",
    "ethernet-switching": "switch",
    vlan: "vlan",
    "spanning-tree": "tree",
    "link-aggregation": "aggregation",
    "ip-addressing": "address",
    "ip-routing": "routing",
    ospf: "ospf",
    ipv6: "ipv6",
    acl: "acl",
    aaa: "identity",
    "network-services": "services",
    nat: "nat",
    "data-center": "datacenter",
    "wlan-basics": "wireless",
    "wlan-architecture": "wlan-network",
    "wlan-operation": "wlan-config",
    "device-management": "management",
    automation: "automation",
    troubleshooting: "troubleshooting",
    "campus-design": "design",
  },
  "ncre-ms-office": {
    "public-foundations": "computer",
    "office-basics": "office",
    word: "word",
    excel: "excel",
    powerpoint: "powerpoint",
  },
  "ncre-l2-c-programming": {
    "public-foundations": "computer",
    "program-structure": "c-program",
    "data-types": "c-types",
    "basic-statements": "c-statements",
    "control-structures": "c-control",
    arrays: "c-array",
    functions: "c-function",
    preprocessor: "c-preprocessor",
    pointers: "c-pointer",
    "struct-union": "c-record",
    "bit-operations": "c-bits",
    "file-operations": "c-file",
  },
  "hcip-datacom-core": {
    "routing-basics": "routing",
    "ospf-core": "ospf",
    "isis-core": "routing",
    "bgp-core": "routing",
    "routing-control": "routing",
    "switching-basics": "switch",
    "multicast-basics": "network",
    "ipv6-core": "ipv6",
    "network-security": "security",
    reliability: "aggregation",
    "services-management": "management",
    "wlan-architecture": "wlan-network",
    solutions: "design",
  },
  "hcip-datacom-advanced": {
    "igp-advanced": "ospf",
    "bgp-advanced": "routing",
    "ipv6-routing": "ipv6",
    "ethernet-advanced": "aggregation",
    mpls: "layers",
    operations: "management",
    troubleshooting: "troubleshooting",
    cutover: "project",
  },
};
// Match titles, not array positions: reordering a syllabus must not swap artwork.
const networkKinds = {
  计算机基础知识: "computer",
  "网络体系结构与TCP/IP": "layers",
  局域网与交换技术: "switch",
  路由与广域网技术: "routing",
  网络安全: "security",
  服务器配置: "services",
  网络管理: "management",
  综合布线与网络规划: "design",
  项目管理与法律法规: "project",
  新技术: "technology",
};
const network = read("public/demo/home-blue/ai-content-network-engineer.json");
const networkManifest = read(
  "server/question-banks/network-engineer/manifest.json",
);
const records = [
  {
    id: "network-engineer",
    name: networkManifest.certificate.shortName,
    chapters: network.chapters.map((c) => {
      if (!networkKinds[c.name])
        throw new Error(`章节缺少图标映射：network-engineer/${c.name}`);
      return {
        id: c.id,
        title: c.name,
        kind: networkKinds[c.name],
        topics: c.sections,
      };
    }),
  },
];
for (const [id, mapping] of Object.entries(mappings)) {
  const manifest = read(`server/question-banks/${id}/manifest.json`);
  records.push({
    id,
    name: manifest.certificate.shortName,
    chapters: manifest.syllabus.modules.map((m) => {
      if (!mapping[m.id]) throw new Error(`章节缺少图标映射：${id}/${m.id}`);
      return {
        id: m.id,
        title: m.name,
        kind: mapping[m.id],
        topics: m.knowledgePoints.slice(0, 3),
      };
    }),
  });
}
if (records[0].chapters.length !== Object.keys(networkKinds).length)
  throw new Error("网络工程师目录已变化，请补齐章节图标映射");
const excluded = ["veterinary-practitioner"];
for (const entry of fs.readdirSync(new URL("server/question-banks/", root), {
  withFileTypes: true,
})) {
  if (
    !entry.isDirectory() ||
    excluded.includes(entry.name) ||
    !fs.existsSync(
      new URL(`server/question-banks/${entry.name}/manifest.json`, root),
    )
  )
    continue;
  if (!records.some((c) => c.id === entry.name))
    throw new Error(`证书缺少章节图标目录：${entry.name}`);
}
const output =
  "/* Public chapter titles and fixed illustration keys; no questions, answers or learner data. */\n" +
  "window.AceChapterVisualCatalog = Object.freeze(" +
  JSON.stringify(
    {
      schemaVersion: 1,
      excluded,
      certificates: records,
    },
    null,
    2,
  ) +
  ");\n";
const target = new URL("public/demo/home-blue/chapter-visual-catalog.js", root);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== output)
    throw new Error("章节图标目录与来源不一致，请重新导出");
} else fs.writeFileSync(target, output);
console.log(
  JSON.stringify({
    file: fileURLToPath(target),
    certificates: records.length,
    chapters: records.reduce((n, c) => n + c.chapters.length, 0),
  }),
);
