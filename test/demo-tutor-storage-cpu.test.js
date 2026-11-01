import { test } from "node:test";
import assert from "node:assert/strict";
import { startSchema } from "../server/demo-tutor/protocol.js";
import { catalogue } from "../server/demo-tutor/registry.js";
import { allBundles, getBundle } from "../server/demo-tutor/registry.js";
const questions = allBundles().flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const answer = (id) => {
  const q = questions.find((q) => q.id === id);
  assert(q, id);
  return q.options.find((o) => o.id === q.answer).text;
};
test("capacity conversions and RAID sizes match independently calculated reference values", () => {
  for (const [id, value] of [
    ["storage-capacity-check", "4096字节"],
    ["storage-capacity-v1", "2048字节"],
    ["storage-capacity-v2", "1024字节"],
    ["storage-raid-capacity-check", "8TB"],
    ["storage-raid-capacity-v1", "8TB"],
    ["storage-raid-capacity-v2", "6TB"],
  ])
    assert.equal(answer(id), value);
  assert.equal(
    answer("storage-raid-faults-check"),
    "每个镜像组仍有副本，阵列可继续访问",
  );
  assert.equal(
    answer("storage-raid-faults-v1"),
    "A组全部副本丢失，不能保证阵列数据完整",
  );
  assert.equal(
    answer("storage-raid-faults-v2"),
    "不能，需独立的历史保护或备份机制",
  );
  // Check all possible two-drive failures on three mirrored pairs rather than treating every pair as safe.
  const pair = [0, 0, 1, 1, 2, 2];
  let safe = 0,
    unsafe = 0;
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++) {
      const survivors = [0, 0, 0];
      for (let i = 0; i < 6; i++) if (i !== a && i !== b) survivors[pair[i]]++;
      const available = survivors.every((n) => n > 0);
      assert.equal(available, pair[a] !== pair[b]);
      if (available) safe++;
      else unsafe++;
    }
  assert.equal(safe, 12);
  assert.equal(unsafe, 3);
});
test("storage boundaries distinguish volatility, cache miss, file and block interfaces", () => {
  const refs = [
    ["storage-dram-v1", "两者都不能保证保留原数据"],
    ["hierarchy-miss-check", "不需要，缓存可从较低层Cache或主存取块"],
    [
      "hierarchy-miss-v1",
      "Cache miss由缓存层处理；页不驻留的缺页可能需要操作系统调页",
    ],
    ["san-granularity-check", "NAS文件级访问"],
    ["san-granularity-v1", "主机使用块级存储接口"],
    ["san-granularity-v2", "NFS请求是文件访问，iSCSI卷是块访问"],
    ["san-transport-check", "在TCP/IP上承载块存储命令"],
    ["san-transport-v1", "FC HBA"],
    ["san-transport-v2", "既可采用FC，也可采用iSCSI等IP块存储方案"],
    [
      "san-choice-v1",
      "需要支持并发一致性的上层设计，不能默认普通文件系统共挂就安全",
    ],
  ];
  for (const [id, text] of refs) assert.equal(answer(id), text);
});
test("series, parallel and availability computations obey independent probability references", () => {
  for (const [id, value] of [
    ["reliability-series-check", "0.855"],
    ["reliability-series-v1", "0.68"],
    ["reliability-parallel-check", "0.985"],
    ["reliability-parallel-v1", "0.94"],
    ["reliability-availability-check", "99%"],
    ["reliability-availability-v1", "90%"],
  ])
    assert.equal(answer(id), value);
  assert.equal(
    answer("reliability-series-v2"),
    "不能，需检查相关失效与联合概率",
  );
  assert.equal(
    answer("reliability-parallel-v2"),
    "仍需计入控制器这个公共依赖的可靠性",
  );
  assert.equal(
    answer("reliability-availability-v2"),
    "服务可用率，而不能据此断言无故障可靠度提高",
  );
});
test("pipeline, bus units, weighted CPI and execution times match reviewed reference values", () => {
  for (const [id, value] of [
    ["pipeline-overlap-v1", "14"],
    ["pipeline-hazards-check", "数据相关"],
    ["pipeline-hazards-v1", "控制相关"],
    ["pipeline-hazards-v2", "结构相关"],
    ["bus-bandwidth-check", "400MB/s"],
    ["bus-bandwidth-v1", "800MB/s"],
    ["bus-bandwidth-v2", "800MB/s"],
    ["bus-address-check", "1048576字节"],
    ["bus-address-v1", "65536字节"],
    ["bus-address-v2", "524288字节"],
    ["performance-time-check", "4ms"],
    ["performance-time-v1", "9ms"],
    ["performance-time-v2", "A更短"],
    ["performance-weighted-check", "1.6"],
    ["performance-weighted-v1", "2.2"],
    ["performance-weighted-v2", "3.8"],
    ["performance-metrics-check", "1000MIPS"],
    ["performance-metrics-v1", "2.5GFLOPS"],
  ])
    assert.equal(answer(id), value);
  assert.equal(
    answer("pipeline-forwarding-v1"),
    "不能，数据可能仍晚于使用时机",
  );
  assert.equal(
    answer("pipeline-forwarding-v2"),
    "不能，结构资源不足需要资源或调度方面处理",
  );
});
test("addressing cases preserve value/address distinction and ISA caveats are explicit", () => {
  for (const [id, value] of [
    ["addressing-values-check", "立即寻址"],
    ["addressing-values-v1", "直接寻址"],
    ["addressing-values-v2", "间接寻址"],
    ["addressing-registers-check", "寄存器寻址"],
    ["addressing-registers-v1", "寄存器间接寻址"],
    ["addressing-registers-v2", "37"],
  ])
    assert.equal(answer(id), value);
  assert.equal(
    answer("isa-models-v1"),
    "可以混合16位压缩编码与32位指令，RISC标签不要求全部定长",
  );
  const course = getBundle("network-engineer:01.04.03");
  assert(JSON.stringify(course.teaching).includes("实际指令扩展"));
  assert(JSON.stringify(course.teaching).includes("16位"));
  assert.equal(
    answer("interrupt-context-v2"),
    "不能，中断也可以是正常的定时或外设事件",
  );
});

test("every one of the 147 catalogue identifiers is accepted by the start protocol, including OSI units", () => {
  for (const point of catalogue().knowledgePoints)
    assert(
      startSchema.safeParse({
        courseId: point.nodeId,
        foundation: "review",
        restart: false,
        requestId: "00000000-0000-4000-8000-000000000001",
      }).success,
      point.nodeId,
    );
  for (const courseId of [
    "network-engineer:../../../secret",
    "network-engineer:<script>",
    "other-certificate:01.01",
  ])
    assert(
      !startSchema.safeParse({
        courseId,
        foundation: "review",
        requestId: "00000000-0000-4000-8000-000000000001",
      }).success,
    );
});
