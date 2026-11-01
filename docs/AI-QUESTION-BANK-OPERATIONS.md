# AI 题库与证书扩展操作规范

> 本文件是给后续 AI 编程代理使用的执行规范。任何修改 server/question-banks、证书清单、题目 JSON 或导入报告的任务，必须先完整阅读本文件，再开始修改。

## 1. 目标与边界

本项目有两类题目，必须分开处理：

1. **内置题库**：保存在 Git 仓库的 server/question-banks，随代码部署，由服务器启动时同步到 SQLite。
2. **用户生成的 AI 题**：保存在 DATA_DIR/netwise.sqlite，通过共享 AI 题库给同证书用户使用，不应手动复制进 Git 题库。

本文件指导内置证书和内置题库扩展。除非用户明确要求，不得删除或重置数据库，不得清理用户答题记录，不得把 AI 生成题伪装成官方题目。

## 2. 不可违反的规则

- 不得执行 git reset --hard、git clean -fd、强制推送或覆盖远程历史。
- 修改前先执行 git status --short；已有用户改动必须保留。
- 已发布题目如果答案、题干逻辑或解析发生实质变化，优先新建 ID，并记录新旧题关系。
- 题目 ID 在所有证书中全局唯一。跨证书复用 ID 时，内容和来源元数据必须完全一致。
- 不得把第三方回忆题、网络汇编题或 AI 生成题标记为官方真题。
- 不确定来源、答案或解析时停止发布，放入 reports/ 待核对，不要猜测补全。
- 不得提交 .env、data/、netwise.sqlite、日志、API Key、私人原始资料或临时压缩包。
- JSON 必须是 UTF-8、合法 JSON，顶层必须是数组。
- 修改后必须运行题库校验、自动化测试和生产构建；没有运行就不能声称完成。

## 3. 开始前检查

~~~powershell
git status --short
git branch --show-current
Get-ChildItem -LiteralPath server/question-banks -Directory
npm run bank:validate
~~~

先判断任务类型：

| 任务 | 修改位置 | 通常是否需要改源码 |
| --- | --- | --- |
| 给已有证书补题 | 该证书的 questions/ | 不需要 |
| 新增证书 | 新证书目录、manifest.json、guide.json | 不需要 |
| Word/资料导入 | 题目目录和 reports/ | 通常不需要 |
| 用户 AI 训练题 | 网页和 AI 流程 | 不应手写内置 JSON |
| 改变校验或加载逻辑 | server/ 和测试 | 必须单独评估 |

如果用户只要求扩展题库，禁止顺手重构前端、登录、安全、AI Provider 或数据库结构。

## 4. 目录和自动发现

~~~text
server/question-banks/
├─ loader.js
├─ network-engineer/
│  ├─ manifest.json
│  ├─ guide.json
│  ├─ questions/
│  └─ reports/
└─ hcia-datacom/
   ├─ manifest.json
   ├─ guide.json
   ├─ questions/
   └─ reports/
~~~

服务启动时会自动扫描每个证书目录。新增证书通常不需要修改 server/certificates.js、API 路由、前端证书数组或 SQLite 表结构。不要把新证书写死到 React 页面；如果证书不显示，先检查清单和启动日志。

## 5. 给已有证书增加题目

优先在已有题库分组对应的路径增加 JSON 文件，例如：

~~~text
server/question-banks/hcia-datacom/questions/syllabus-practice/23-extra.json
~~~

manifest.json 的 banks[].path 可以指向单个 JSON 文件或目录，目录会递归读取 .json 文件。文件名只影响维护顺序，不决定题目 ID。

每个 JSON 文件顶层必须是数组。单题模板：

~~~json
{
  "id": "hcia-v2-vlan-extra-001",
  "type": "single_choice",
  "question": "题干内容",
  "options": { "A": "选项 A", "B": "选项 B", "C": "选项 C", "D": "选项 D" },
  "answer": ["A"],
  "analysis": "解释正确答案，并说明其他选项为什么不成立。",
  "chapter": "VLAN 原理与配置",
  "knowledgePoint": "Trunk 接口",
  "difficulty": "medium",
  "tags": ["VLAN", "Trunk"]
}
~~~

字段规则：

- id：全局唯一的小写 slug，例如 hcia-v2-vlan-extra-001。
- type：只能是 single_choice、multiple_choice、true_false。
- question：必须自包含，不能依赖未提供的图片、表格或上下文。
- 单选和多选至少包含 A-D，可增加 E；判断题固定使用 A=正确、B=错误。
- answer 必须是选项字母数组；单选只能一个答案，多选至少两个，判断题只能 A 或 B。
- analysis 必须解释结论和推理，不能只写“答案是 A”。
- chapter 必须是该证书允许的章节；有大纲时必须与模块 name 完全一致。
- knowledgePoint 必须属于该章节，不能写成无关内容。
- difficulty 只能是 easy、medium、hard。
- tags 是稳定的字符串数组，便于筛选和维护。

题目 JSON 不要填写 source、sourceLabel 或 certificates，加载器会从清单自动补充。除非已确认加载器支持，否则不要增加自定义字段。

## 6. 新增证书

推荐复制最接近的现有证书作为模板，再逐项替换：

~~~powershell
Copy-Item -Recurse server/question-banks/network-engineer server/question-banks/new-certificate
~~~

最小目录：

~~~text
server/question-banks/new-certificate/
├─ manifest.json
├─ guide.json
├─ questions/
└─ reports/
~~~

manifest.json 最小结构：

~~~json
{
  "schemaVersion": 1,
  "certificate": {
    "id": "new-certificate",
    "name": "新证书完整名称",
    "shortName": "新证书",
    "description": "证书覆盖范围",
    "order": 3
  },
  "guidePath": "guide.json",
  "banks": [
    {
      "id": "original-practice",
      "name": "原创练习题",
      "description": "本站原创练习题",
      "source": "original_practice",
      "path": "questions/original.json"
    }
  ]
}
~~~

清单规则：

- certificate.id 必须与目录名完全一致。
- ID 只能使用小写字母、数字和连字符。
- 同一清单中的 banks[].source 不能重复。
- path 必须位于证书目录内，不能使用 ..。
- order 用于显示顺序，不要覆盖现有证书顺序。

如果设置 guidePath，guide.json 必须完整包含 schemaVersion、verifiedAt、标题、概览、facts、schedule、examDetails、knowledgeAreas、career、mustKnow 和 sources。facts 至少 4 项，examDetails 至少 4 项，knowledgeAreas 至少 4 项，sources 至少 2 个 HTTPS 来源。没有可靠来源时不能编造考试日期、费用或规则。

## 7. 考试大纲

只有存在可靠公开范围来源时才添加 syllabus。必须满足：

- scopeStatus 必须是 officially_verified。
- sourceUrls 至少有一个真实来源。
- modules 非空，每个模块有合法的 id、name、order、weight、targetQuestionCount、knowledgePoints。
- 所有模块 weight 总和必须等于 100。
- 每道题的 chapter 必须和模块 name 完全相等，空格和大小写都不能随意改。
- weight 是本站练习和模拟考试抽题权重，不能在没有官方依据时称为官方考试占比。

## 8. 来源和重复题

题库分组使用能准确表达来源的分类：

- official_sample：官方公开样题。
- verified_past_exam：有可靠来源并已核验的历年考试题。
- public_practice：公开练习题，但不是官方真题。
- syllabus_practice：依据官方范围原创编写的仿真题。
- unverified_collection：出处无法完全核实的第三方汇编。

用户提供的回忆题必须保留原始题号、文件或 URL、导入修正原因和待核对信息，写入对应 reports/。来源不确定时宁可少发布，不要编造官方出处。

新增 ID 前全仓库搜索：

~~~powershell
rg -n '"id":\s*"hcia-v2-vlan-extra-001"' server/question-banks
~~~

新增题不能只是换数字或换几个同义词。必须检查题干、选项、答案、知识点和推理角度是否真正不同。不要批量重新编号已发布题目。相同 ID 跨证书复用时，内容和来源元数据必须完全一致，否则加载器会阻止启动。

## 9. 标准执行流程

### A. 盘点

~~~powershell
git status --short
Get-Content -LiteralPath server/question-banks/README.md -Encoding UTF8
npm run bank:validate
~~~

读取目标证书的 manifest.json，确认已有来源、章节、模块名称和题目数量。

### B. 修改

只修改目标证书目录和必要的 reports/。不要编辑 data/netwise.sqlite 添加内置题；数据库由服务器从题库清单同步。

### C. 验证

~~~powershell
npm run bank:validate
npm test
npm run build
npm run test:e2e
~~~

端到端测试启动浏览器失败时，必须报告具体错误，不能把“浏览器未启动”说成测试通过。前三项仍必须执行。

### D. 差异检查

~~~powershell
git diff --check
git status --short
git diff --stat
git diff -- server/question-banks/<certificate-id>
~~~

确认没有 .env、数据库、日志、压缩包、无关源码修改、大量删除题目或批量重写 ID。

### E. 提交和部署

先向用户报告证书、来源、题目数量、验证结果和剩余风险，再提交或推送。禁止强制推送。

~~~powershell
git add -- server/question-banks/<certificate-id>
git commit -m "feat: add <certificate> question bank"
git push origin main
~~~

生产部署前备份 DATA_DIR 和 .env，部署时携带完整的 server/question-banks/。重启服务会自动同步新增题，不能删除数据库来“刷新题库”。

## 10. 常见错误

- 目录名和证书 ID 不一致：让目录名与 certificate.id 完全一致。
- 题库来源重复：检查同一清单中的 banks[].source。
- 题目 ID 不合法或重复：使用小写 slug，并用 rg 全局搜索。
- 章节不在大纲中：使用 syllabus.modules[].name 的精确字符串。
- 权重不等于 100：重新计算全部模块，不要用四舍五入掩盖。
- Schema 错误：逐题检查题型、选项、答案、解析、章节、知识点和难度，不要删除答案来绕过错误。
- 来源不确定：停止发布，写入 reports/ 待核对。

## 11. 完成报告模板

~~~text
扩展目标：新增/修改哪个证书和题库
修改文件：列出实际修改的文件
新增题目：X 道
题库总量：X 道唯一内置题
来源说明：官方样题 / 原创仿真 / 用户提供 / 其他
校验结果：npm run bank:validate
测试结果：npm test
构建结果：npm run build
端到端结果：通过 / 未运行 / 受浏览器环境阻塞（附错误）
剩余风险：来源、答案、解析、模块覆盖或部署方面的问题
~~~

只有如实记录校验、测试和构建结果，才可以声称题库扩展完成。
