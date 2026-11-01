# NCRE 二级 C 语言题库扩充至 1800 题 · 交付文档

- **证书**：全国计算机等级考试二级 C 语言程序设计（`ncre-l2-c-programming`）
- **题库**：`ncre-l2-c-programming-20261016023127663`（来源 `ncre_l2_c_practice`，category `syllabus_practice`）
- **生产流程**：`kaojiang-content-pipeline`（init → 命题 → hash → 独立盲审 → check → prepare → 并入）
- **本次目标**：310 → **1800** 题（新增 1490），按考纲权重与知识点比例分配
- **本文档状态**：**进行中**。已交付第 1 批 50 题，剩余 1440 题待生产
- **生成时间**：2026-10-18

---

## 1. 交付摘要

| 项目 | 结果 |
|---|---|
| 目标题量 | 1800（12 模块 / 48 知识点全覆盖） |
| 当前题量 | **360**（原 310 + 本批 50） |
| 已交付新增 | **50**（批次 `ncre-c-1800-b01`） |
| 剩余待生产 | **1440**，约 33 批 |
| 本批题型 | 50 题全部 `single_choice` |
| 本批答案位置 | A 22.0% / B 26.0% / C 24.0% / D 28.0%（要求 22–28%） |
| 本批难度 | easy 30% / medium 50% / hard 20%（要求 30–35 / 45–50 / 20） |
| 独立盲审 | 50 题由独立上下文盲答，与答案键 **50/50 一致，0 分歧** |
| 逐批查重 | `check` **`ok: true`、`stage: integrated`、0 错误、0 重复命中** |
| `bank:validate` | ✅ exit 0（11191 题全库通过，本证书 360 题） |
| `npm test` | ⚠️ 291 项中 286 通过、5 失败，**均与题库无关**（见 5.2） |
| `npm run build` | ✅ exit 0（需可写 TEMP，见 5.3） |
| `npm run test:e2e` | ✅ exit 0 |
| 部署 / 线上验证 | ❌ 未执行（不在本次范围） |

---

## 2. 本批交付范围（b01）

50 题覆盖 5 个缺口最大的知识点，每点 10 题：

| 模块 | 知识点 | 题数 | 覆盖角度 |
|---|---|---|---|
| 指针 | 地址与指针变量 | 10 | 指针语义、`&*p` 等价、空指针、指针算术、指针相减、类型兼容、野指针、`*p++`、`&a` 类型 |
| 数据类型及其运算 | 基本数据类型与定义 | 10 | 字符/字符串常量、八进制转义、实型常量合法性、十六进制、补码范围、修饰符组合、`f` 后缀、`const`、ASCII、八进制常量 |
| 基本语句 | 输入输出函数与格式控制 | 10 | `%c` 与 `%d` 空白处理、`%3d` 宽度、`%s` 截断、`puts` 换行、`scanf` 返回值、`getchar`、`%c` 输出、格式串普通字符匹配、`printf` 返回值、`%c%c` 连读 |
| 选择与循环结构 | for 循环结构 | 10 | 表达式省略、`i*=2` 次数、无限循环识别、逗号表达式、条件为赋值、表达式1 执行次数、`i+=i` 次数、整除计数、执行顺序、条件累加 |
| 编译预处理 | 宏定义与调用 | 10 | 替换阶段、`x+1` 无括号展开、带参宏无类型检查、字符串内不替换、作用范围、命名约定、宏嵌套展开、`#undef`、空宏、嵌套定义顺序 |

**设计原则**：不换数字、不换同义词。每道题对应一个独立的推理路径（概念辨析 / 执行跟踪 / 边界条件 / 反向推理 / 错因诊断 / 代码改错），并刻意避开题库中已有题干的开头模板，以降低查重相似度。

**干扰项要求**：每个错误选项都对应一种具体误解，且按该误解**确实能算出该选项**。数值型题目在 `reviews.json` 的 `calculation` 字段留下复算过程（本批 15 题带数值复算）。

---

## 3. 1800 题配比设计

### 3.1 分配方法

`模块目标 = 该模块权重% × 1800`；模块内再按**现有题量比例**分摊到知识点，每个知识点保底 8 题。权重取自 `manifest.json` 的 `syllabus.modules[].weight`（合计 100%），属于**本站练习权重**，不代表官方命题比例。

### 3.2 模块级目标

| 模块 | 权重 | 目标 | 现有 | 待补 | 批次数 |
|---|---|---|---|---|---|
| 公共基础知识 | 10% | 180 | 31 | 149 | 3 |
| C 语言程序结构 | 3% | 54 | 9 | 45 | 1 |
| 数据类型及其运算 | 11% | 198 | 44 | 154 | 4 |
| 基本语句 | 8% | 144 | 35 | 109 | 3 |
| 选择与循环结构 | 14% | 252 | 54 | 198 | 4 |
| 数组的定义和引用 | 11% | 198 | 34 | 164 | 4 |
| 函数 | 12% | 216 | 37 | 179 | 4 |
| 编译预处理 | 4% | 72 | 23 | 49 | 1 |
| 指针 | 14% | 252 | 53 | 199 | 4 |
| 结构体与共同体 | 7% | 126 | 22 | 104 | 3 |
| 位运算 | 3% | 54 | 9 | 45 | 1 |
| 文件操作 | 3% | 54 | 9 | 45 | 1 |
| **合计** | **100%** | **1800** | **360** | **1440** | **33** |

### 3.3 知识点级明细

48 个知识点的逐点配额（目标 / 现有 / 待补）已落在 `tmp/content-batches/ncre-c-1800-plan.json` 的 `rows` 字段，后续每批按该文件取数，不再临时决定。

---

## 4. 质量控制过程

每批固定 7 步，任一步不通过不得进入下一步：

1. **命题**：写入批次 `questions.json`（11 字段，UTF-8 无 BOM）
2. **自检**：字段数、选项数、选项重复、多答案、ID 唯一与前缀、解析长度、解析是否用字母指代选项、题干是否依赖图片、难度合法性 —— 本批全部为 0
3. **溯源**：逐题 `provenance.json`（sourceIds / locator / category / reuse / reuseBasis）
4. **摘要**：`pipeline.mjs hash` 生成 `review-inputs.json`，摘要绑定题目 + 来源 + 目录版本
5. **独立盲审**：另起**独立上下文**的复核者，**只提供题干与选项**，不提供答案与解析，先独立作答再对照
6. **硬检查**：`pipeline.mjs check` —— 跨证书查重 + 同批查重，相似度 ≥0.90 阻断、0.78–0.90 需逐对写实质差异
7. **导出与并入**：`prepare` 输出 loader 可读题目，确认 ID 无冲突后追加进 curated 题库

### 4.1 本批盲审结果

- 复核者：独立子代理（`agent-c308f000-ff22-4ade-849e-570f560e407c`），仅持有 `blind-pack.json`
- 结果：50 题全部作答，**与答案键完全一致**
- 提出 1 条 `concerns`：`ncre-cx1-io-005`（`scanf` 返回值）需区分「输入失败 → EOF」与「匹配失败 → 0」的术语。复核者自行判定题干用词与标准术语 `input failure` 一致，答案成立，**未修改题目**

### 4.2 查重

查重分两个时点，均通过：

| 时点 | 比较对象 | 结果 |
|---|---|---|
| 并入前 | 50 道候选 vs 题库 310 道存量 + 批内互相 | `duplicates: []`，0 相似命中（0.78 阈值下无候选） |
| 并入后 | 50 道 vs 题库 360 道（含自身副本） | `duplicates: []`，`integrated: 50/50` |

**并入后曾出现一次 `id_collision` 阻断，已定位并修复**：批次 `batch.json` 的 `bank.source` 是 `init` 自动生成的 `curated_ncre-l2-c-programming-20261018113728838`，而题目实际并入的是既有题库 `ncre_l2_c_practice`。`check` 的 `sameLoaded` 判定要求 `loaded.source === batch.bank.source`，两者不等导致自身副本被当成 ID 冲突（50 条，`score: 1`、内容完全相同）。将 `batch.bank` 对齐到实际题库后重跑，恢复 `ok: true`。

这不是内容重复，但属于会误导后续批次的登记错误——后续每批 `init` 后都应先把 `batch.bank` 改成目标题库的 `id`/`source` 再命题。

---

## 5. 验收证据

### 5.1 题库校验

```
> node scripts/validate-question-banks.js
ncre-l2-c-programming: 360 questions, 1 banks
Validated 11191 unique bundled questions across 6 certificates.
```
退出码 0。

### 5.2 单元测试（需如实说明）

```
# tests 291
# pass 286
# fail 5
```

5 项失败**与本次改动无关**，且不在题库链路上：

| 失败项 | 原因归属 |
|---|---|
| mobile version endpoint blocks outdated clients and exposes the APK link | `mobile/*.apk` 已被删除（`git status` 显示 D） |
| shipped download policy matches the APK version and cannot be downgraded | 同上 |
| all older mobile clients receive a forced update and 426 | 同上 |
| actual archive command requires committed sources and current artifacts | 工作区存在大量未提交改动 |
| the course index contains no answer keys and the reviewed engine loads without any public demo directory | 课程索引 / demo 目录，与 C 语言题库无关 |

单独运行题库测试：`node --test test/question-bank.test.js` → **7/7 通过**。

### 5.3 生产构建

首次执行 `npm run build` **失败**：

```
[vite:esbuild-transpile] remove C:\Users\...\Temp\esbuild-...: Access is denied.
```

1684 个模块已成功转换，失败发生在 esbuild 删除自身临时文件时，属 Windows 临时目录权限问题。将 `TEMP`/`TMP` 指向仓库内可写目录后重跑，**exit 0**，产物 `dist/app`（考匠移动网页版 0.4.7，`9728b98ad5e21287`）。**代码与内容均未改动**。

### 5.4 端到端

```
> node test/e2e.js
Browser regression passed: guest trial, real authentication, practice, offline exam recovery,
cross-device conflict, non-empty membership table, lazy pages and responsive downloads.
```
退出码 0。

### 5.5 未执行项

- 部署、线上服务验证、浏览器端题库页面专项验收：**未执行**，本次目标不包含
- C 编译器实证：本机无 `gcc`/`cl`/`clang`，程序跟踪题的答案由**手工逐轮推导 + 独立复核者重算**双路得出，**未经编译器实际运行验证**

---

## 6. 改动文件清单

| 文件 | 改动 |
|---|---|
| `server/question-banks/ncre-l2-c-programming/questions/curated/ncre-l2-c-programming-20261016023127663.json` | 310 → **360** 题，追加 50 条（含 `provenance` 与 `sourceVerification`） |
| `tmp/content-batches/ncre-c-1800-b01/` | 本批全部过程资产：`questions.json`、`sources.json`、`provenance.json`、`blind-pack.json`、`blind-result.json`、`review-inputs.json`、`reviews.json`、`prepared/`；`batch.json` 的 `bank` 已对齐到实际并入的题库 |
| `tmp/content-batches/ncre-c-1800-plan.json` | 1800 题逐知识点配额与 34 批计划 |
| `docs/NCRE-C-LANGUAGE-EXPANSION-DELIVERY.md` | 本文档 |

未改动：`manifest.json`（模块目标题量保持原值，原因见 7.3）、`guide.json`、任何前端或服务端源码。

---

## 7. 已知限制与风险

### 7.1 题库目录尚未纳入版本库（最高优先级）

`git status` 显示 `?? server/question-banks/ncre-l2-c-programming/` —— 整个证书目录在当前分支 `desktop-workspace-downloads` 上是**未跟踪**状态；`git ls-tree main` 中同样**没有**该目录。

也就是说：**这 360 道题目前只存在于工作区**，任何 `git clean` 或误操作都会丢失，且合并到 main 时没有可对比的基线。建议在继续扩题前先确认其归属分支并提交一次，形成可回溯基线。

### 7.2 仅完成 3.4%

1490 道新增中已完成 50 道。本文档描述的是**进行中**状态，不是完成态；`verify` 未执行（该步骤要求批次已接入且全链路通过）。

### 7.3 `manifest.json` 的 `targetQuestionCount` 未调整

该字段当前仍为各模块 310 的旧值。原因：`server/syllabus.js` 用 `Math.min(1, total / targetQuestionCount)` 计算覆盖率，若现在改成 1800，app 上会立刻显示「覆盖 20%」，并可能触发内容不足相关提示。

**建议**：待题量接近目标时一次性调整到 3.2 表的目标值。注意 `scripts/validate-question-banks.js` 与 `test/question-bank.test.js` 均不校验该字段（后者断言的 220 属 hcia-datacom），因此延后调整不会导致校验失败。

### 7.4 ID 前缀与历史序列不一致

仓库既有批次用 `ncre-c-`、`ncre-c2-` … `ncre-c8-`；本批按扩充说明书使用 `ncre-cx1-`（下一轮 `ncre-cx2-`）。不会与存量 ID 冲突，但等于并行两套命名。若要统一，现在改成本最低。

### 7.5 合库后难度分布略偏

合库后（360 题）：easy 122（33.9%）、medium 161（**44.7%**）、hard 77（21.4%）。medium 略低于 45% 下限。后续批次应略微偏向 medium，否则总量到 1800 时可能越界。

答案位置合库后为 A 24.7% / B 28.3% / C 24.2% / D 22.8%，均在区间内，但 B 已贴近上限、D 贴近下限，后续批次需偏向 C、D。

### 7.6 剩余 1440 题的查重压力

48 个知识点已被 360 题覆盖，查重阈值 0.78（复核候选）/ 0.90（阻断）。剩余题量是存量的 4 倍，**同知识点下必须持续更换句式结构**，只换数字或变量名会稳定触发相似度命中。

### 7.7 工作区不干净

仓库存在大量与本任务无关的未提交改动（mobile、miniprogram、README 等）。本次仅触碰题库文件与 `tmp/`、`docs/`，但提交时需要精确 `git add` 指定路径，避免带入他人改动。

---

## 8. 后续动作

### 8.1 批次计划

33 批，按模块推进，每批 ≤50 题（流水线单批上限）：

| 批次 | 模块 | 题数 |
|---|---|---|
| b02–b04 | 公共基础知识 | 50 / 50 / 49 |
| b05 | C 语言程序结构 | 45 |
| b06–b09 | 数据类型及其运算 | 50 / 50 / 50 / 4 |
| b10–b12 | 基本语句 | 50 / 50 / 9 |
| b13–b16 | 选择与循环结构 | 50 / 50 / 50 / 48 |
| b17–b20 | 数组的定义和引用 | 50 / 50 / 50 / 14 |
| b21–b24 | 函数 | 50 / 50 / 50 / 29 |
| b25 | 编译预处理 | 49 |
| b26–b29 | 指针 | 50 / 50 / 50 / 49 |
| b30–b32 | 结构体与共同体 | 50 / 50 / 4 |
| b33 | 位运算 | 45 |
| b34 | 文件操作 | 45 |

每批重复第 4 节的 7 步，批次号与题量以 `ncre-c-1800-plan.json` 为准。

### 8.2 建议顺序

1. **先提交一次基线**（7.1），再做后续 33 批
2. 决定 ID 前缀是否统一（7.4）
3. 按计划推进批次，每批完成后更新 `ncre-c-1800-plan.json` 的 `status`
4. 全部完成后：把 `manifest.json` 的 12 个模块目标调到 3.2 表数值 → 跑 `verify` → 单独执行部署与线上验证

---

## 附：证据文件索引

| 证据 | 路径 |
|---|---|
| 本批题目正文 | `tmp/content-batches/ncre-c-1800-b01/questions.json` |
| 本批来源登记 | `tmp/content-batches/ncre-c-1800-b01/sources.json` |
| 本批逐题溯源 | `tmp/content-batches/ncre-c-1800-b01/provenance.json` |
| 盲审输入（无答案） | `tmp/content-batches/ncre-c-1800-b01/blind-pack.json` |
| 盲审结果 | `tmp/content-batches/ncre-c-1800-b01/blind-result.json` |
| 审核摘要 | `tmp/content-batches/ncre-c-1800-b01/review-inputs.json` |
| 逐题复核记录 | `tmp/content-batches/ncre-c-1800-b01/reviews.json` |
| 导出（loader 可读） | `tmp/content-batches/ncre-c-1800-b01/prepared/` |
| 1800 题配额与批次计划 | `tmp/content-batches/ncre-c-1800-plan.json` |
| 题库正文 | `server/question-banks/ncre-l2-c-programming/questions/curated/ncre-l2-c-programming-20261016023127663.json` |
| 上一轮 310 题交付报告 | `server/question-banks/ncre-l2-c-programming/reports/DELIVERY-REPORT.md` |
| 扩充任务说明书 | `docs/NCRE-C-LANGUAGE-EXPANSION-BRIEF.md` |
