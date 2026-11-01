# Web demo：分步 AI 精讲试点

本次按用户补充的范围改进 `public/demo/home-blue/`。正式 AceExam 的 React/Vite、Express API、账号、会员、AI 网关和正式学习数据库没有替换或迁移。

## 运行与入口

在项目根目录运行 `node scripts/preview-home-blue.mjs`，打开 `http://127.0.0.1:4177/demo/home-blue/?v=tutor-39&lesson=vlan#ai`。也可以在 AI 页面点击“体验互动精讲”，或打开网络工程师的 VLAN 知识点后选择“互动精讲”标签。

普通刷题页的“AI 精讲”匹配当前题目的同章节课程，支持逐段阅读后返回原练习。进行中的模拟考试不显示该入口。

AI 目录为每个节点标明“互动精讲”“互动示范课”或“分段精讲”。已制作课程的顶部入口跟随当前知识点，按已保存的课程版本显示开始、继续或回顾；未制作节点保留普通分段学习，并明确标示跨课程的网络工程师 VLAN 示例入口。进入作答或互动课程后隐藏顶部入口，避免打断当前教学。`test/home-blue-tutor-entry.e2e.js` 验证入口匹配、会话刷新恢复、三类标识与浅深色下四种浏览器宽度。

## 全量课程覆盖进度（2026-10-13）

网络工程师目录共有 10 章、147 个知识点。当前完整互动覆盖 **39 / 147**，计算机基础章的 20 个知识点已全部制作：

| 知识点 | 概念段数 | 题目数（含两道变式） |
| --- | --- | --- |
| 进制互转与8421 BCD | 4 | 12 |
| 原码、反码、补码与移码 | 6 | 18 |
| 浮点数表示 | 3 | 9 |
| 奇偶校验 | 3 | 9 |
| 海明校验 | 4 | 12 |
| CRC循环冗余校验 | 3 | 9 |
| 误码率与帧错误概率 | 3 | 9 |
| Cache与命中率 | 4 | 12 |
| 内存、磁盘与RAID | 4 | 12 |
| 存储介质性能比较 | 3 | 9 |
| 系统可靠性与可用性 | 3 | 9 |
| NAS、SAN与存储网络 | 3 | 9 |
| CPU流水线 | 3 | 9 |
| 总线结构与带宽 | 4 | 12 |
| 指令系统、寻址与中断 | 4 | 12 |
| 计算机性能指标 | 3 | 9 |
| 进程、线程与死锁 | 4 | 12 |
| 分页、分段与虚拟存储 | 4 | 12 |
| 需求、原型与开发模型 | 3 | 9 |
| 等价类与边界值测试 | 3 | 9 |
| OSI物理层 | 3 | 9 |
| OSI数据链路层 | 3 | 9 |
| OSI网络层 | 3 | 9 |
| OSI传输层 | 3 | 9 |
| OSI会话层 | 3 | 9 |
| OSI表示层 | 3 | 9 |
| OSI应用层 | 3 | 9 |
| TCP/IP四层模型与映射 | 3 | 9 |
| 分层原则、协议与数据封装 | 4 | 12 |
| 编码与调制 | 3 | 9 |
| 信道容量与数据速率 | 4 | 12 |
| 采样定理与PCM | 4 | 12 |
| 同步、双工与多路复用 | 3 | 9 |
| 数据链路层流量控制与ARQ | 4 | 12 |
| 信号质量与眼图 | 3 | 9 |
| IPv4地址类别与特殊地址 | 4 | 12 |
| 网络地址、广播地址与可用主机 | 4 | 12 |
| 子网划分与VLSM | 4 | 12 |
| CIDR与路由聚合 | 4 | 12 |

VLAN 广播域试点（3 个概念、9 道题）仅覆盖 VLAN 节点的一部分，**不能算整个 VLAN 节点已完成**。剩余 107 个节点尚未制作互动课，继续提供原有分段阅读与巩固练习。

`subnets-cidr.js`提供VLSM容量、等长块数、规范边界与不重叠分配，以及CIDR覆盖量、精确聚合、超集空洞和最长匹配转发。两课共8段、24题、72个独立错项分支。题目明确需求含网关、不另预留或已安装无策略路由等条件；聚合题明确规范网络起点，并涵盖混合前缀逐级合并。`demo-tutor-subnets-cidr.test.js`用BigInt地址区间独立检查容量、父块包含、规范对齐、占用区间、并集精确相等和最长匹配。演示普通精讲同步修订“最小前缀”歧义和精确/超集聚合的区分，保持版本隔离与导出保护；IPv4专项页面验证扩展到四课的旧成绩失效、原逐空作答及刷新恢复。

`ipv4-addresses.js`新增两节完整课程，共8个概念、24道题、72个错项分支。历史类别与实际CIDR掩码分开判断，RFC1918范围严格检查边界；回环、链路本地、受限广播、默认路由与组播各有语境。子网计算包含跨字节/20、/23及高位为1的IPv4地址；普通多访问公式不无条件推广到RFC3021点到点/31和/32主机路由。`demo-tutor-ipv4-addresses.test.js`独立以32位二进制字符串重算网络/广播/容量，并检查历史类别、私有范围与例外条件。普通分段精讲的相关表述也经演示导出修订，版本隔离旧成绩；源版本或被审核原文变化时拒绝盲改，正式课程包未改写。

新增课程入口：选择“软考 · 网络工程师”，在 AI 目录选上述知识点，点击“互动精讲”。每个课程独立保存服务端会话、客户端快照与选择；切换课程后不会重置另一课程。

`server/demo-tutor/registry.js` 统一登记私有课程及来源版本；`banks/*.js` 保存标准答案、独立教学段和逐选项错误分支；`authoring.js` 验证课程概念、题目和纠错内容的完整性。新题的正确项使用稳定散列调整位置，公开目录不包含答案。公开 `tutor-catalog.js` 从服务端注册表生成，前端据此展示可用互动入口；`--check` 校验目录与注册表一致，增加课程不再重复手工维护可用 ID。

数值课程的讲解例题与检验题使用不同操作数；课程教学或评分变更通过版本号隔离旧会话。旧版本操作返回明确的 409 更新提示，新版可重新开课，不把旧成绩混入新课程。海明/SECDED限定错误数量与编号约定，CRC限定教材的初值、反射和最终异或，Cache区分未命中额外开销与总时间，帧错率强调独立性及位/字节单位。

新增 `demo-tutor-foundations.test.js` 独立检查整数解码、概率/AMAT数值、CRC多项式BigInt运算，以及全部16个扩展海明数据字的单错/双错模式。`home-blue-tutor-foundations.e2e.js` 对所有已制作完整课程分别执行真实页面的错误反馈、补课刷新恢复、变式判分、完整总结与320/375/768/1672宽度检查。

`demo-tutor-os-software.test.js` 独立枚举银行家算法安全序列，核对分页地址转换、段边界及FIFO淘汰，并检查需求、原型与开发模型的标准答案。边界值题明确采用整数输入和三值法，避免将两值法错误地当成普遍无效；不安全状态也不会直接判成已发生死锁。

`osi-lower.js` 为OSI前三层分别提供三段完整互动课。物理层区分信号与业务吞吐，链路层明确源MAC学习、目的MAC转发和FCS检测边界，网络层区分最终目的IP与本跳MAC、尽力而为以及IPv4/IPv6转发规则。来源包括Cisco MAC学习说明、RFC791和RFC8200；普通路由保持目的IP的题目明确排除NAT与隧道改写。`demo-tutor-osi-lower.test.js` 从场景中独立抽取源MAC和入口，检查学习结果、可信标准标签与全部81个错项的反馈隔离。

使用 `node scripts/audit-network-tutors.mjs` 输出覆盖清单。`demo-tutor-storage-cpu.test.js` 独立核对容量、RAID、概率、带宽与CPI数值，并枚举六盘RAID10所有双盘故障组合。NAS与SAN按访问粒度、协议和实际需求区分；不把“FC必定更快”等绝对化说法用于评分。普通Cache miss与虚拟内存缺页独立讲解。RISC压缩扩展和中断向量的架构约定明确限定。

VLAN部分覆盖的互动课完成不会自动将整个VLAN知识点标成已学；完整覆盖的节点才同步到目录的已学状态。API开课协议已适配全部147个现有节点标识，包括OSI七个独立子节点；未制作课程仍由注册表返回明确不可用，不产生假课程。

最终全量验收必须运行 `node scripts/audit-network-tutors.mjs --require-complete`；存在待制作或部分覆盖节点时返回失败，禁止宣称全量完成。

OSI七层现已分别具备完整互动课。`osi-upper.js`补充传输端点、TCP字节流/UDP数据报、流量/拥塞控制、对话管理与检查点、字符表示/压缩/加密以及应用协议语义。会话与TCP连接不作一一对应，TCP确认不被当作持久化完成；表示层按OSI概念分类，不强行要求实际TCP/IP系统存在独立第五、六层模块。应用课对照RFC1034/9110/5321/959辨认服务用途；`demo-tutor-osi-upper.test.js`验证标准结论、协议用途与36道题的独立错项解释。

课程来源条数按现有浏览器约定限制为1至5条，在课程注册前检查；本地审核快照可以只提供标题和路径，外部链接仍经过浏览器HTTPS域名白名单处理。新增六来源课程被浏览器拒绝的问题已通过删去重复来源修复，并新增注册时拒绝超限来源的验证。

`layering.js`把模型映射、协议/服务/接口、TCP与UDP封装、逐跳重封装及长度边界做成两节完整互动课。明确四层与五层教学形式的题设条件，不强行按参考模型划分实际进程。帧长题排除VLAN标签、选项、分片与填充，并明确计入FCS而不计前导码/帧间隙；独立测试从题干抽取字段长度累加，并核对TCP/UDP的不同开销。逐跳结论限定无NAT、隧道或代理条件，变式题检查条件改变后能否直接套用结论。

`communications.js`提供线路编码/调制与信道容量两节互动课。曼彻斯特比特方向必须按规范约定，不把同步优势当作零误码保证；固定长度符号映射明确M=2^k条件。奈奎斯特公式限定理想无噪声低通信道；香农公式限定带限加性白高斯噪声并使用线性功率信噪比，dB先换算，固定S/N的带宽比较不推广到噪声同时变化的情况。有效速率题分别采用“开销占发送总量”和“开销相对有效载荷”两种分母。独立测试抽取题设值重算码元/比特速率、容量及开销，标准答案不由浏览器提供。

`pcm.js`以四段互动课区分奈奎斯特速率（2倍信号最高频率）和奈奎斯特频率（采样率的一半），限定基带、带限与临界采样条件。临界正弦反例、混叠频率、量化/编码与PCM原始速率都有独立数学核对。`scripts/home-blue-ai-corrections.mjs`修正演示普通精讲及q1/q4/q5的相关表述，导出器自动应用修订，源版本或原文变化时拒绝盲目重写；修订版本隔离旧普通练习成绩。正式课程包与审核数据未改写，不把演示修订宣称为正式内容已发布。

`link-control.js`拆分UART字符与时钟、单双工、固定TDM与其他复用，以及停等/GBN/SR重传和模序号窗口限制。ARQ场景明确接收方乱序处理和发送方已收到的确认：GBN没有推进基序号的新累计确认，SR已经确认其他帧，仅缺口未确认。窗口题分别限定GBN接收窗1或SR等大收发窗口。独立接收过程验证重传列表，并枚举2至6bit序号下新旧等窗集合的重叠；不将教材ARQ或有限序号推广为所有TCP实现或无限旧帧寿命保障。

新增验证：`node --test test/demo-tutor-curriculum.test.js` 检查可变课程段数、全部新错项、数学标准值及跨课程 API 恢复；`node test/home-blue-tutor-curriculum.e2e.js` 检查真实页面切课、补课刷新恢复、四段课程完整总结以及 320/375/768/1672 宽度。

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| `server/demo-tutor/protocol.js` | Zod 严格结构、JSON Schema、组件 ID/拓扑一致性验证 |
| `server/demo-tutor/content.js` | 已核对的三概念课程、私有标准答案和错项分支 |
| `server/demo-tutor/engine.js` | 独立 TutorEngine、分步状态、规则判分、变式与掌握状态 |
| `server/demo-tutor/app.js` | 演示 API、匿名隔离、SQLite、幂等/版本冲突、限流与使用记录 |
| `scripts/preview-home-blue.mjs` | 仅绑定本机的静态页面与互动课服务 |
| `public/demo/home-blue/tutor-renderer.js` | 固定注册表、安全文本渲染与代码 SVG |
| `public/demo/home-blue/tutor.js` | 课程交互、选择保留、失败重试与状态恢复 |
| `public/demo/home-blue/tutor.css` | 浅深色、字号、浏览器宽度和减少动画 |
| `public/demo/home-blue/ai-study.js` | 现有目录/巩固练习复用、逐段阅读与课程入口 |

数据位于被 Git 忽略的 `outputs/home-blue-demo/tutor-demo.sqlite`，与 `data/netwise.sqlite` 分离。匿名 cookie 不包含身份信息，原始随机令牌只存在于 HttpOnly/SameSite cookie，服务端仅保存其 SHA-256 摘要。记录包含当前步骤、所选选项、错因、掌握情况及必要时间戳；不保存姓名、IP、自由对话或密码。匿名 cookie 有效期为 30 天，会话闲置 30 天后在启动/每小时检查中清理；重置只清除当前浏览器关联的会话。

## 结构协议与状态

### 概念内分步教学（2026-10-13）

新开的浏览器互动课通过 `pacing: "guided"` 按卡片解锁：基础术语、规则讲解、图解或对比、知识总结，然后才进入理解小测。服务端保存 `teachingIndex`，公开响应只包含当前教学卡和课程进度；`reading` 提供当前卡序号、总卡数及阶段名称，`stepId` 包含阅读序号。刷新、服务重启和多标签页冲突都沿用原有 SQLite 会话及 revision 机制。

`next` 在本概念卡片未读完时推进一张，读完才进入小测。`back` 只允许回到当前概念的上一张卡，不修改答案或掌握状态。回顾接口在本概念还没读完时仅返回已经解锁的卡片，不能通过回顾跳看后续内容。基础与复习模式使用不同的讲解深度；两者都逐卡展开。图解保持现有代码 SVG，未添加题目图片素材。

旧会话保持原来的概念阅读方式，点击“切换分步讲解”发送 `guide` 操作即可继续，保留已答题、当前概念和掌握记录。未提供 `pacing` 的旧开课请求保持兼容，未改变旧请求的幂等散列。陈旧课程版本的回顾接口也返回 409，避免将新版讲解混入旧课程成绩。

普通刷题点击 AI 精讲时，若对应知识点已有互动课程，则进入互动课；其他知识点仍进入分段阅读。完整互动课与部分覆盖示范课继续明确区分。回顾弹窗使用当前课程标题，浏览器组件校验同时拒绝选项、拓扑节点和进度节点中的未知字段。

本轮服务端 **69 项测试通过**，其中新增测试遍历所有已登记课程的逐卡解锁、回看边界、小测/变式和总结。`test/home-blue-tutor.e2e.js` 实测阅读步骤刷新恢复、上一段保存、旧会话切换、VLAN 图解、正确与三类错项、针对补课、变式、API 503 重试、真实服务端用量及普通刷题往返；6 种宽度下浅深色、大字号、键盘与减少动画均通过。普通 AI 分段学习回归和眼图专项浏览器测试也通过；互动与眼图报告在 `outputs/home-blue-demo/tutor-e2e-report.json` 和 `tutor-eye-e2e.json`，普通分段回归的结果由测试脚本输出到终端。以上使用本地演示服务，仍未调用真实模型。

`GET /api/demo/tutor/v1/schema` 返回 JSON Schema。允许八类组件：ExplanationCard、KnowledgeCard、ComparisonTable、NetworkDiagram、EyeDiagram、MiniQuiz、FeedbackCard、LessonProgress。

信号质量课程拆开损伤来源、电压/时间判决余量与有限诊断结论。EyeDiagram只接受幅度噪声或时间抖动两个枚举参数，由前端生成对照SVG，不接受外部路径、HTML或脚本。图明确标为非测量示意，不给出误码率，不把眼开口当作零误码或唯一故障证明。专项浏览器检查两图场景、可访问标签、浅深色与四种宽度，以及未知字段拒绝和文本转义。

讲解来自已审核的课程种子，并对照 Cisco 的 VLAN/广播转发资料核对基础结论。每份公开内容必须通过服务器验证；字段为严格结构，未知字段/组件类型不能通过。前端只用自己的模板渲染参数，文本转义；不执行 AI/课程内容中的 HTML、JavaScript、React、SVG 代码或链接代码。SVG 的节点位置、线条和箭头由注册组件绘制。

流程为：`explanation → awaiting_answer → feedback → variant → feedback`。错误反馈先进入 `remediation`，再进入变式。小测正确仍需通过变式才记为 `mastered`；两道变式均错则保留 `review` 后继续，最终总结如实区分“已学完”与“已掌握”。开始课程前选择 beginner/review，前者增加必要术语解释。

每个组件、概念、题目、会话和步骤都有稳定 ID。服务端只返回当前步骤、当前或已经讲过的回顾内容；不返回后续课程。小测公开字段不含 answer/correctId/branches。判分依据 `content.js` 中的私有答案和错项规则，FeedbackCard 的正确选项仅在提交该题后返回。普通公开 demo 题库与原有逐空练习仍沿用原始演示快照，不将这次小测的答案隐藏能力泛化到旧快照。

提交包含 `requestId` 与 `revision`。重复请求重用结果，不增加作答次数；同一请求 ID 携带不同内容会拒绝。旧 revision 返回最新课程状态，避免多标签页覆盖。SQLite 事务在公开响应验证成功后才提交，浏览器选择不参与判分，断网时不能通过本地缓存推进或编造成绩。

## API

| 方法与路径（前缀 `/api/demo/tutor/v1`） | 用途 |
| --- | --- |
| `GET /health` | 服务状态，明确 modelConnected 为 false |
| `GET /schema` | 公开组件 JSON Schema |
| `GET /catalog` | 课程元信息，无答案 |
| `GET /sessions/current` | 当前匿名浏览器的最新会话 |
| `POST /sessions` | 开始/恢复，显式 restart 才新开一轮 |
| `GET /sessions/:id` | 仅本浏览器所属会话 |
| `POST /sessions/:id/actions` | next 或 answer，服务端检查步骤/revision |
| `GET /sessions/:id/concepts/:concept` | 已解锁概念回顾，未来概念返回 403 |
| `DELETE /sessions` | 清理当前浏览器互动课记录 |
| `GET /usage` | 当前匿名浏览器的实际用量统计 |

每个匿名浏览器每日最多新开 20 轮，每分钟最多 90 次修改操作。恢复已有会话不新建课程。非本机 Host 与跨来源修改会拒绝；私有响应使用 no-store。

## AI 接入范围

本阶段运行已审核内容缓存与规则教学，没有调用模型，没有任何客户端密钥。会话记录和 `/usage` 中的 aiCalls、promptTokens、completionTokens、totalTokens、costCny 如实为 0，ruleSubmissions 与审核内容读取次数来自实际操作。浏览器失败时保留当前内容与选择，恢复 API 后重试；这不是模型调用失败后的语义生成降级。

正式接入可复用现有 `server/study-ai.js`、`server/ai.js`、`server/ai-service.js`、`server/study-routes.js` 的结构化输出、重试、权限和用量记录。AI 只补充受审查的讲解，不提供或改写标准答案、判分和掌握结果；服务端需限制它不能生成可信 MiniQuiz/FeedbackCard/LessonProgress。正式用户登录、VIP 额度、真实 DeepSeek 用量/成本和部署不属于本次 demo 验收，不伪装为已接入。

## 验证

```powershell
node --test test/demo-tutor.test.js
node --test test/demo-tutor-guided.test.js
node --test test/demo-tutor-curriculum.test.js test/demo-tutor-foundations.test.js test/demo-tutor-storage-cpu.test.js test/demo-tutor-os-software.test.js
node --test test/demo-tutor-osi-lower.test.js
node --test test/demo-tutor-osi-upper.test.js
node --test test/demo-tutor-ipv4-addresses.test.js
node --test test/demo-tutor-subnets-cidr.test.js
node test/home-blue-ipv4.e2e.js
node test/home-blue-tutor-entry.e2e.js
node --test test/demo-tutor-layering.test.js
node --test test/demo-tutor-communications.test.js
node --test test/demo-tutor-pcm.test.js
node test/home-blue-pcm.e2e.js
node --test test/demo-tutor-link-control.test.js
node --test test/demo-tutor-signal-quality.test.js
node test/home-blue-eye.e2e.js
node test/home-blue-tutor-foundations.e2e.js
node test/home-blue-tutor-foundations.e2e.js network-engineer:02.03.03 network-engineer:02.03.04
node test/home-blue-tutor.e2e.js
node test/home-blue-ai.e2e.js
node test/home-blue-demo.e2e.js
node test/home-blue-settings.e2e.js
```

服务端覆盖全部题目及错误选项、协议拒绝、未来步骤保护、条件掌握、幂等、冲突、匿名隔离、跨来源拒绝、服务重启恢复、重置、限流和用量。浏览器覆盖实际入口、分步展开、图解、正确/不同错误反馈、补课/总结/选择的刷新恢复、故障重试、普通练习往返、320–1920 像素布局、浅深色、大字号、键盘和减少动画。截图和报告保存在 `outputs/home-blue-demo/`。这些是本地浏览器结果，不等同于正式部署或真机验证。

完整课程浏览器测试默认运行全部已制作课程；显式传入课程ID可对改动后的课程补充验证，未知ID会拒绝。定向结果另存`tutor-foundations-selected-e2e.json`，不会覆盖全量结果，并记录课程版本。VLSM检验题使用不同于公开原练习的数值场景；独立测试防止将公开已作答的CIDR结果原样复用为新互动小测的答案。

## Demo 章节图标与选择面板

当前有章节配置的四类非兽医证书共 44 章：网络工程师 10 章、四川专升本计算机 7 章、HCIA 22 章、NCRE Office 5 章。每章的卡片小图和预览大图共用映射，使用 34 种固定本地插画；动画由悬停、键盘聚焦或播放按钮触发，最多两轮，遵循系统及 Demo 的减少动画设置。Office 的 W、X、P 按容器比例缩放并分别运动，避免紧凑图标遮挡标题。

`public/demo/home-blue/ai-study.js` 将两门已有精讲课程的章节选择改为图标面板，与内容区的大图同步；支持方向键、Home、End、Escape 和普通 Tab 操作。面板按窗口剩余空间确定高度和展开方向。“全部图标”可浏览四类证书；已开放精讲的章节可以从预览进入对应章节，HCIA 和 NCRE 保留图标预览，不伪造尚未开放的课程。

`scripts/export-demo-chapter-visuals.mjs --check` 按章节标题匹配网络工程师插画，并检查本项目所有非兽医题库目录都有图标映射，新增目录或章节而未补图标时会报错。图标模板不接受 AI、用户或题目提供的 HTML。

专项浏览器检查为 `node test/home-blue-chapter-visuals.e2e.js`，报告及截图在 `outputs/home-blue-demo/`。测试涵盖全 44 章的大小图与动效、17 个精讲章节的实际选择、Office 图块边界、主题、窗口宽度、键盘与减少动画，并检查选择章节不会发起互动课请求；原精讲、证书选择和刷题流程另由现有专项检查覆盖。此处描述的是本机 Demo，未部署到线上。
