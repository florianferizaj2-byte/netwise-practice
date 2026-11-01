# 变式题生成与校验

这个目录让 AI 在**不改变考点**的前提下，从现有种子题派生出个性化新题。

- `blueprint.json`：机器可读的生成蓝图，逐个知识点给出变体轴、常见误解与干扰项、场景模板、种子题清单。
- `check-variants.mjs`：生成结果的校验器，接住重复、越界和格式错误。

## 为什么需要这两件东西

题库本身只能提供有限题量。真正决定"能不能持续出题"的是两件事：

1. **每个知识点都有足够多、角度不同的种子题**——否则 AI 只能反复改写同一句话；
2. **生成结果有可执行的验收标准**——否则变式题会不断引入重复、错分类和答案不唯一。

当前 60 个知识点各有 8–12 道种子题，覆盖概念辨析、操作路径、参数与边界、反向推理、场景应用、错因诊断六类设问角度，难度按 easy/medium/hard 分层。

## 生成流程

1. 打开 `blueprint.json`，按 `certificateId` 找到目标知识点（`modules[].leaves[]`）。
2. 读该知识点的 `scope`、`traps`、`scenarios`，以及所在模块的 `axes`。
3. 参照 `generationContract.mustChange`，至少改变两个变体轴，并换一个与种子题不同的设问角度。
4. 按题库 JSON 格式写出候选题目数组，`chapter / knowledgeSection / knowledgePoint` 必须与目标知识点逐字一致。
5. 跑校验：

```bash
node server/question-banks/ncre-ms-office/variants/check-variants.mjs 候选.json
```

退出码 0 才可并入；退出码 1 时按报告修正。

## 校验器拦什么

| 类型 | 判定 | 处理 |
| --- | --- | --- |
| 字段不合规 | 不符合 `server/domain.js` 的 `questionSchema` | 阻断 |
| 分类越界 | `chapter/knowledgeSection/knowledgePoint` 不在三级目录中 | 阻断 |
| 题号冲突 | 与题库已有题号或候选文件内其他题重复 | 阻断 |
| 高度相似 | 与题库任一题题干二元相似度 ≥ 0.9 | 阻断 |
| 疑似近似 | 相似度 0.78–0.9 | 提示，需人工确认设问角度不同 |
| 答案偏斜 | 单一批次正确项集中在同一位置超过 40% | 提示 |

相似度只比较题干，不比较选项和解析，因此它只能挡住"换汤不换药"的改写，无法判断语义重复。通过校验不等于题目正确，仍需人工或独立复核确认答案与解析。

## 并入题库

校验通过后，把题目追加到对应题库文件，然后重跑全库校验：

```bash
node scripts/validate-question-banks.js
```

新增文件需要在 `manifest.json` 的 `banks` 中登记，否则不会被加载。
