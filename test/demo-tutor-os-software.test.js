import assert from "node:assert/strict";
import { test } from "node:test";
import { allBundles, catalogue } from "../server/demo-tutor/registry.js";
const questions = allBundles().flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const answer = (id) => {
  const q = questions.find((q) => q.id === id);
  assert(q, id);
  return q.options.find((o) => o.id === q.answer).text;
};
test("all twenty computer foundations nodes have full interactive coverage", () => {
  const chapter = catalogue().knowledgePoints.filter((n) =>
    n.nodeId.startsWith("network-engineer:01."),
  );
  assert.equal(chapter.length, 20);
  assert(chapter.every((n) => n.status === "ready" && n.courseId === n.nodeId));
});
test("thread, state and deadlock distinctions match trusted reference outcomes", () => {
  for (const [id, value] of [
    ["os-threads-check", "共享地址空间，各自维护执行栈与寄存器现场"],
    ["os-threads-v2", "不保证，共享更新仍需正确同步"],
    ["os-states-check", "阻塞态"],
    ["os-states-v1", "就绪态"],
    ["os-states-v2", "就绪态"],
    ["os-deadlock-check", "循环等待"],
    ["os-deadlock-v1", "循环等待"],
    ["os-deadlock-v2", "不能，可能涉及饥饿，需检查实际等待关系"],
  ])
    assert.equal(answer(id), value);
});
// Independent exhaustive order checking, instead of reusing lesson prose or a claimed safety result.
const canFinish = (total, allocation, max) => {
  let safe = false;
  for (const sequence of [
    [0, 1],
    [1, 0],
  ]) {
    let work = total - allocation.reduce((a, b) => a + b, 0);
    let ok = true;
    for (const i of sequence) {
      if (max[i] - allocation[i] > work) {
        ok = false;
        break;
      }
      work += allocation[i];
    }
    safe ||= ok;
  }
  return safe;
};
test("banker examples distinguish safe sequences, unsafe states and valid-but-unsafe requests", () => {
  assert(canFinish(4, [2, 1], [3, 3]));
  assert(!canFinish(5, [2, 2], [4, 4]));
  assert(!canFinish(4, [2, 2], [3, 3]));
  assert.equal(answer("os-banker-check"), "安全，存在P1→P2完成顺序");
  assert.equal(
    answer("os-banker-v1"),
    "不安全，无可保证的安全序列，但不能仅据此断言已死锁",
  );
  assert.equal(
    answer("os-banker-v2"),
    "不能，假分配后Available0、双方Need1，变成不安全",
  );
});
test("page translations preserve offsets and use page frame byte bases", () => {
  for (const [id, size, virtual, frame, expected] of [
    ["vm-paging-check", 1024, 2500, 7, 7620],
    ["vm-paging-v1", 4096, 9000, 3, 13096],
    ["vm-paging-v2", 512, 1300, 9, 4884],
  ]) {
    const physical = Number(answer(id));
    assert.equal(physical, expected);
    assert.equal(physical % size, virtual % size);
    assert.equal(Math.floor(physical / size), frame);
  }
  assert.equal(answer("vm-segments-v1"), "不在，合法偏移为0～999");
  assert.equal(answer("vm-segments-v2"), "外部碎片");
  assert.equal(
    answer("vm-faults-v1"),
    "不应，须按权限异常处理，调入不能取消访问控制",
  );
  assert.equal(answer("vm-faults-v2"), "缺页处理不必每次都从磁盘读取");
  assert.equal(answer("vm-replacement-check"), "A");
  assert.equal(answer("vm-replacement-v1"), "4");
});
test("integer three-value boundary sets cover the required neighbors without changing the domain", () => {
  for (const [id, low, high] of [
    ["testing-boundaries-check", 3, 8],
    ["testing-boundaries-v1", 20, 30],
    ["testing-boundaries-v2", 50, 60],
  ]) {
    const values = answer(id).split("、").map(Number);
    assert.equal(values.length, 6);
    for (const edge of [low, high])
      for (const delta of [-1, 0, 1]) assert(values.includes(edge + delta));
  }
  assert.equal(answer("testing-partitions-v1"), "−1、5、10");
  assert.equal(answer("testing-partitions-v2"), "19、25、31");
  assert.equal(
    answer("testing-combine-v2"),
    "这些用例按预期通过，仍不能证明所有输入绝无缺陷",
  );
});
test("requirements, prototype and model answers retain explicit delivery limits", () => {
  assert.equal(
    answer("software-requirements-check"),
    "澄清负载、响应目标与验证条件，再确认需求",
  );
  assert.equal(
    answer("software-prototype-v1"),
    "不能，需补齐并验证真实数据、权限及质量要求",
  );
  assert.equal(answer("software-models-check"), "瀑布模型");
  assert.equal(answer("software-models-v1"), "增量交付");
  assert.equal(answer("software-models-v2"), "螺旋模型的风险驱动迭代");
});
