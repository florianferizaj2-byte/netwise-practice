# 题库扩展约定

每个证书一个目录。服务器启动时自动发现这里的目录，不需要修改路由、数据库或前端证书列表。

```text
question-banks/
  loader.js
  new-certificate/
    manifest.json
    questions/
      original.json
      imported-set/
        01.json
        02.json
    reports/
      imported-set.json
```

`manifest.json` 包含证书信息及一个或多个题库分组：

```json
{
  "schemaVersion": 1,
  "certificate": {
    "id": "new-certificate",
    "name": "证书全名",
    "shortName": "证书简称",
    "description": "考试范围",
    "order": 3
  },
  "banks": [
    {
      "id": "official-practice",
      "name": "题库显示名称",
      "description": "题库来源说明",
      "source": "official_practice",
      "path": "questions/official-practice"
    }
  ]
}
```

需要按考试大纲组织时，在清单中增加 `syllabus`。所有模块的 `weight` 之和必须为 100；该字段是本站抽题配比，除非来源明确公布权重，否则不能写成官方考试占比。`sourceUrls` 应保留核实范围时使用的公开页面：

```json
{
  "syllabus": {
    "version": "V2.0",
    "examCode": "H12-811",
    "verifiedAt": "2026-09-17",
    "scopeStatus": "officially_verified",
    "scopeNote": "范围来源及权重说明",
    "weightType": "platform_practice_blueprint",
    "sourceUrls": [
      { "name": "官方考试范围", "url": "https://example.com", "verified": true }
    ],
    "modules": [
      {
        "id": "routing",
        "name": "路由基础",
        "order": 1,
        "weight": 100,
        "targetQuestionCount": 20,
        "knowledgePoints": ["路由表", "静态路由"]
      }
    ]
  }
}
```

启用 `syllabus` 后，每道题的 `chapter` 必须与某个模块 `name` 完全一致。前端会据此显示覆盖率和题量缺口，模拟考试会按模块权重分层抽题。

题库分组可以额外声明来源等级：

```json
{
  "category": "syllabus_practice",
  "verification": "original_from_official_scope",
  "sourceUrl": "https://example.com",
  "defaults": {
    "sourceVerification": "原创仿真题，不属于官方真题"
  }
}
```

建议只使用 `official_sample`、`verified_past_exam`、`public_practice`、`syllabus_practice` 等明确类别。无法核实出处的第三方汇编应标为 `unverified_collection` 并默认不发布，不能写成官方真题。

`path` 可以指向一个 JSON 文件或目录。目录会递归读取，文件名只影响维护顺序。每个文件是题目数组。题目不需要填写 `source` 和 `certificates`，加载器从清单补充：

```json
[
  {
    "id": "new-cert-routing-001",
    "type": "single_choice",
    "question": "题干",
    "options": { "A": "选项 A", "B": "选项 B", "C": "选项 C", "D": "选项 D" },
    "answer": ["A"],
    "analysis": "答案解析至少十二个字符。",
    "chapter": "章节",
    "knowledgePoint": "知识点",
    "difficulty": "easy",
    "tags": ["知识点"]
  }
]
```

支持 `single_choice`、`multiple_choice` 和 `true_false` 三种题型。单选题与多选题必须包含 A-D 四个选项，也可增加 E 选项；判断题固定使用 `{ "A": "正确", "B": "错误" }`，答案只能是 A 或 B。导入来源题型与答案结构不一致时，应在导入报告中保留修正原因和原始题号。

题目 ID 在所有证书中全局唯一。若两个证书需要共享一道题，在两个目录中放置同 ID、同内容的题目；加载器会合并证书标签，不会重复入库。内容不同但 ID 相同会阻止服务器启动。

修改后运行：

```powershell
npm run bank:validate
npm test
```

验证器会检查清单、路径边界、题目 Schema、证书 ID、重复 ID 和共享题一致性。部署时需要完整携带 `server/question-banks/`。
