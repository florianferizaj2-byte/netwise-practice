import fs from "node:fs";
import * as vlan from "./content.js";
import { numerals, floating } from "./banks/numerals.js";
import { integers } from "./banks/integers.js";
import { parity, hamming, crc } from "./banks/error-codes.js";
import { frameProbability, cache } from "./banks/memory-probability.js";
import { memoryRaid, hierarchy } from "./banks/storage.js";
import { reliability, san } from "./banks/reliability-san.js";
import { pipeline, bus } from "./banks/cpu.js";
import { instructions, performance } from "./banks/instructions-performance.js";
import { processes, virtualMemory } from "./banks/os.js";
import { development, testing } from "./banks/software.js";
import { physical, dataLink, network } from "./banks/osi-lower.js";
import {
  transport,
  session,
  presentation,
  application,
} from "./banks/osi-upper.js";
import { validateBundle } from "./authoring.js";
import { models, layering } from "./banks/layering.js";
import { coding, capacity } from "./banks/communications.js";
import { pcm } from "./banks/pcm.js";
import { arq, synchronization } from "./banks/link-control.js";
import { signalQuality } from "./banks/signal-quality.js";
import { ipv4Addresses, ipv4Ranges } from "./banks/ipv4-addresses.js";
import { vlsm, cidr } from "./banks/subnets-cidr.js";
const seed = JSON.parse(
  fs.readFileSync(
    new URL(
      "./curriculum-index.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const bundles = new Map([
  [
    vlan.course.id,
    {
      ...vlan,
      summary: [
        "广播：在同一 VLAN 内转发，排除入口端口。",
        "VLAN：逻辑划分广播域，同一交换机不等于同一 VLAN。",
        "Access：普通未标记帧按端口的 VLAN 配置归属。",
      ],
    },
  ],
]);
for (const record of [
  numerals,
  floating,
  integers,
  parity,
  hamming,
  crc,
  frameProbability,
  cache,
  memoryRaid,
  hierarchy,
  reliability,
  san,
  pipeline,
  bus,
  instructions,
  performance,
  processes,
  virtualMemory,
  development,
  testing,
  physical,
  dataLink,
  network,
  transport,
  session,
  presentation,
  application,
  models,
  layering,
  coding,
  capacity,
  pcm,
  arq,
  synchronization,
  signalQuality,
  ipv4Addresses,
  ipv4Ranges,
  vlsm,
  cidr,
]) {
  const node = seed.lessons.find((n) => n.id === record.course.nodeId);
  if (!node || node.version !== record.course.sourceVersion)
    throw new Error(`互动课与当前知识点版本不符: ${record.course.id}`);
  validateBundle(record);
  bundles.set(record.course.id, record);
}
export function getBundle(id = "vlan-broadcast-domain") {
  const record = bundles.get(id);
  if (!record)
    throw Object.assign(
      new Error("这个知识点的互动课正在制作，可以先分段阅读。"),
      { status: 404, code: "TUTOR_COURSE_NOT_AVAILABLE" },
    );
  return record;
}
export function catalogue() {
  const knowledgePoints = seed.lessons.map((n) => ({
    nodeId: n.id,
    title: n.name,
    chapter: n.chapter,
    section: n.section,
    sourceVersion: n.version,
    status: bundles.has(n.id)
      ? "ready"
      : n.id === vlan.course.nodeId
        ? "partial"
        : "pending",
    courseId: bundles.has(n.id)
      ? n.id
      : n.id === vlan.course.nodeId
        ? vlan.course.id
        : null,
  }));
  return {
    course: structuredClone(vlan.course),
    courses: [...bundles.values()].map((r) => structuredClone(r.course)),
    knowledgePoints,
    coverage: {
      certificateId: seed.course.id,
      total: knowledgePoints.length,
      ready: knowledgePoints.filter((n) => n.status === "ready").length,
      partial: knowledgePoints.filter((n) => n.status === "partial").length,
      pending: knowledgePoints.filter((n) => n.status === "pending").length,
    },
    mode: "reviewed-demo",
  };
}
export const allBundles = () => [...bundles.values()];
