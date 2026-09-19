import test from "node:test";
import assert from "node:assert/strict";
import { questionSimilarity } from "../server/question-similarity.js";

test("相同泛化题干但选项不同不会被判为完全重复", () => {
  const left = {
    question: "下列叙述中正确的是（ ）。",
    options: {
      A: "算法的时间复杂度与算法程序中的语句条数成正比",
      B: "算法的时间复杂度与计算机的运行速度有关",
      C: "算法的时间复杂度与运行算法时特定的输入有关",
      D: "算法的时间复杂度与算法程序编制者的水平有关",
    },
    answer: ["C"],
  };
  const right = {
    question: "下列叙述中正确的是（ ）。",
    options: {
      A: "程序执行的效率与数据的存储结构密切相关",
      B: "程序执行的效率只取决于程序的控制结构",
      C: "程序执行的效率只取决于所处理的数据量",
      D: "以上说法均错误",
    },
    answer: ["A"],
  };
  assert.ok(questionSimilarity(left, right) < 0.8);
});

test("不同数字参数的变式题不会被判为完全重复", () => {
  const left = {
    question: "主机 172.1.10.35/25 所在子网的广播地址是什么？",
    options: { A: "172.1.10.0", B: "172.1.10.1", C: "172.1.10.126", D: "172.1.10.127" },
    answer: ["D"],
  };
  const right = {
    question: "主机 10.0.0.34/28 所在子网的广播地址是什么？",
    options: { A: "10.0.0.31", B: "10.0.0.46", C: "10.0.0.63", D: "10.0.0.47" },
    answer: ["D"],
  };
  assert.ok(questionSimilarity(left, right) < 0.99);
});
