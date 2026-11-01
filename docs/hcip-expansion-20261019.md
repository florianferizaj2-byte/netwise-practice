# HCIP-Datacom 题库扩充与验收（2026-10-19）

本次把 HCIP-Datacom 两类证书从各 20 题扩充为按官方大纲章节权重、覆盖全部三级知识点的完整练习题库，
完成逐批取证、独立盲审、查重、接入和本地验收。题库为原创仿真练习，不是官方真题。

## 范围与结果

| 证书 | 考试代码 | 原题量 | 新增 | 现题量 | 目标 | 三级知识点 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| HCIP-Datacom 核心 | H12-821 | 20 | 82 | **102** | 102 | 51 / 51 覆盖 |
| HCIP-Datacom 高级路由交换 | H12-831 | 20 | 81 | **101** | 101 | 36 / 36 覆盖 |

- 章节题量按官方大纲“知识点占比”表分配（1% ≈ 1 题）；为保证每个三级知识点都有练习，
  对题量小于知识点数的 `路由基础`、`网络解决方案`、`以太网高级技术` 各补足 1 题，
  因此目标题量为 102 / 101。权重本身仍保持官方 100%。
- 全部新题 `single_choice`（A–D，单选）；答案位置已均匀分布：
  核心 A25/B27/C25/D25，高级 A25/B26/C25/D25。
- 难度：核心 easy 24 / medium 55 / hard 23；高级 easy 21 / medium 62 / hard 18。
- 已有 20 题保留原 ID 与内容，未重写已发布题目。

## 批次与证据

8 个隔离批次，每批 20–21 题，均位于 `tmp/content-batches/hcip-{core,adv}-b0{2..5}/`：

- `batch.json`（真实 authorContext）、`questions.json`、`provenance.json`（逐题来源与定位）、
  `sources.json`（42 个来源，含官方大纲与公开 RFC）、`reviews.json`（独立盲审）、
  `review-inputs.json`、`quality-report.json`。
- 每批新题先与全仓 7,106 道已有题及 8 个批次之间做 ID/题干/选项/数字变体/相似度查重，
  阻断项为 0；`0.78–0.9` 复核区间亦为 0。
- 独立盲审：由未参与创作的复核会话在隐藏答案与解析的盲审包上独立作答，
  163 题全部 `pass`，独立答案与候选答案 100% 一致；数值题均独立复算。
  第一轮盲审发现答案位置严重偏斜（多个批次全 A），已让作者重排选项并重新盲审。

## 接入文件

- `server/question-banks/hcip-datacom-core/`：`manifest.json`、`guide.json`、
  `questions/curated/hcip-datacom-core-*.json`、`hcip-core-b02..b05.json`、
  `reports/expansion-2026-10-19.json`。
- `server/question-banks/hcip-datacom-advanced/`：同上结构（`hcip-adv-b02..b05.json`）。
- 正式清单的 bank path 改为目录 `questions/curated`，仍保持单一来源
  `hcip_core_practice` / `hcip_advanced_practice`，不新增重复来源。
- 新增页面验收：`test/hcip-practice.e2e.js`（证书选择 → 练习判分 → 刷新恢复 → 20 题模拟组卷）。

## 实际验收结果（真实退出码）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 题库校验 | `node scripts/validate-question-banks.js` | 通过：7,269 道唯一内置题、8 类证书 |
| 覆盖报告 | `node scripts/report-bank-coverage.js` | 通过：两类 HCIP 模块缺口均为 0，无大纲外章节 |
| 批次复核 | `pipeline check --batch ...`（8 批） | 8/8 `ok:true`、`stage:integrated`、0 错误 |
| 组卷冒烟 | `pipeline exam-smoke --certificate ... --runs 10` | 两类证书均 `ok:true`，10 次 × 20 题无重复/题量错误 |
| 生产构建 | `node scripts/build.mjs` | 通过（`dist/app` 生成） |
| 全站浏览器回归 | `node test/e2e.js` | 通过 |
| HCIP 浏览器验收 | `node test/hcip-practice.e2e.js` | 通过（练习判分、刷新恢复、20 题模拟交卷） |
| 单元测试 | `npm test` | 294/298 通过；4 个失败均为本次改动前已有、与 HCIP 无关（见下） |

## 已知阻塞（不属于本次 HCIP 改动）

`npm test` 仍有 4 个既有失败，均与 HCIP 题库无关，且涉及其他未完成工作，本次未改动：

1. `test/api.test.js`、`test/mobile-release-policy.test.js`（2 个）：App 元数据 0.4.7 与
   已发布下载策略 0.4.6 不一致（见 [content-intake-handoff-20261018.md](content-intake-handoff-20261018.md) 第 34 行）。
2. `test/question-bank.test.js`：兽医题库 3,425 题与测试期望 7,888 题不一致，
   源于尚未复核的兽医清理（同文档第 20、32 行）。

因此 `pipeline verify` 在 test 关卡被阻塞（bank-validate 通过、git-diff-check 通过）；
这不影响 HCIP 题库加载、练习、组卷和构建，但整仓 CI 变绿需要先处理上述独立事项。

## 剩余局限

- 厂商设备行为题（路由策略、MQC、防火墙、堆叠、WLAN、割接流程等）部分只能引用官方大纲与
  公开标准/工程实践，未能取得可打开的华为产品文档正文；`provenance.locator` 已如实标注。
- 题库仍只有单选题；官方大纲未公布题型构成，本站题型比例不代表官方比例。
- 本批未推送、未部署；发布仍需按项目流程单独执行。
