# Web 互动图解与精讲流水线

## 教学内容先行

一个知识点要交付：学习目标、前置概念、可观察过程、关键条件/边界、常见错误、主测题和变式、错因补救、总结及来源。图解要帮助解释机制，如包从哪里到哪里、状态如何变化、坐标表示什么；装饰漂浮、循环闪烁和只有标题的占位图不能算教学动画。

按现有 authoring.js 的 E/K/T/question/pack 编写课程。当前 validateBundle 要求每概念 1 道主题和 2 道变式，错误选项有具体分支；以源码验证结果为准。变式需改变设问/边界/应用，不只换数字或同义词。

给完整请求列出所有目标知识点与 graph/lesson/quiz/renderer/API/browser 的状态，逐批完成。对网络工程师，以完整目录作为范围；不要用已编写子集重新定义“全部互动知识点”。其他证书的互动内容不能直接套 network-engineer 固定索引；需要把证书隔离、课程选择与目录导出实际泛化并验收。

## 使用受控图解

先在 protocol.js 与 tutor-renderer.js 查找现有组件。复用能准确表达原理的参数化图解；缺能力再添加新的受控组件类型和明确枚举/数值边界。

新增图解的实现链：

1. 严格 protocol schema：仅允许必要数据字段，拒绝任意 HTML/SVG 源码、script、URL 代码、React/eval 字符串和未知字段。
2. 渲染器按固定结构创建 DOM/SVG，正确转义标题/说明。动画阶段由受控数据和显式状态产生；支持开始/暂停/单步/重置中实际需要的操作，重新进入/重播结果一致。
3. 对每个关键步骤显示发生的事和条件；参数变动后重算路径/数值，不能只换图注。有坐标必须写清坐标含义和单位；不允许示意图暗示不存在的测量精度或确定因果。
4. 有文字等价解释，键盘可用，焦点可见，颜色之外也有标签；prefers-reduced-motion 下可逐步静态观察。检查窄屏、深浅色主题和缩放，关键条件不能被裁剪。
5. 课程包、registry、sourceVersion、正式 studyNode 的版本与发布过滤能对应；导出公共目录与 React 渲染器。仅修改 public/demo 页面不能证明正式产品生效。

不要把课时答案、用户答题、掌握度、私密会话或评分别名打包到公开目录。公开教学数据与私有状态始终分离，前端交互不裁定正确答案。新增字段必须同时检查服务端对外响应和两种渲染环境。

## 必须核实的两套入口

`server/demo-tutor/registry.js` 的 catalogue 是课程编写目录；正式 `server/interactive-tutor.js` 还过滤当前节点版本和已发布课时，并通过登录/会员规则绑定用户私有会话。正式界面是 `src/features/interactive-tutor.jsx`，导入 `src/generated/tutor-renderer.js`。两条链都检查，不能用演示站的 ready 数量证明账号已经能访问。

当前存在旧课程与修正版节点的显式映射。141 个题库叶节点与 147 个精讲节点的数量不同是核对线索，不应直接认定后者冗余；逐 code、scope、sourceVersion 查 corrections 及正式入口后决定迁移。

## 导出、测试与浏览器验收

按改动选择命令；生成后再 check。不修改课程时不要为制造通过而重写索引。

```powershell
node scripts/export-tutor-curriculum.mjs --check
node scripts/export-web-tutor-renderer.mjs --check
node scripts/audit-network-tutors.mjs --check
node --test test/interactive-tutor-renderer.test.js test/interactive-tutor.test.js
node test/interactive-tutor.e2e.js
```

新增知识点还跑对应 demo-tutor 专项内容测试和图解的专用浏览器用例。变更索引时检查 studyNodes 的来源导出、版本及所有旧课程；修改图解源后运行不带 --check 的渲染器导出，再执行 --check，不能手改 src/generated 输出逃避源不一致。

浏览器按真实状态 explanation、awaiting_answer、feedback、remediation、variant、complete 驱动；只点击当前存在的动作，动作后等待 revision 增加。测试正确路径、每类错因路径、变式、刷新恢复和重播；检查两主题、典型手机/桌面宽度、键盘、减弱动画、注入字符串及控制台错误。

终态 JSON/报告和页面实测都成功才能报告浏览器通过。超时或只截图不能算通过。要求全量完成时另跑 `audit-network-tutors.mjs --check --require-complete`；当前未完成全量就必须返回失败，不能调低分母或把 partial/pending 改名为 ready。
