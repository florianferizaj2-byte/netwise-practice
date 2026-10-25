import { E, T, question as Q, pack } from "../authoring.js";
const W = (text, type, title, reason, hint) => [
  text,
  type,
  title,
  reason,
  hint,
];
const own = (id) => ({ title: "已审核知识点快照", path: id });
const rfc = {
  title: "RFC1122 · Internet协议分层",
  url: "https://www.rfc-editor.org/rfc/rfc1122.html",
};
function modelOrder(id, prompt) {
  return Q(
    id,
    prompt,
    "网络接口层 → 网际层 → 传输层 → 应用层",
    "题目明确采用TCP/IP四层模型，自下而上按承载、IP、端到端传输、应用服务排序。",
    [
      W(
        "应用层 → 传输层 → 网际层 → 网络接口层",
        "model-direction",
        "上下方向相反",
        "这个次序是自上而下，题目要求自下而上。",
        "先标出最底层与最顶层。",
      ),
      W(
        "物理层 → 数据链路层 → 网络层 → 传输层 → 应用层",
        "model-five",
        "模型约定不同",
        "这是常见教学五层模型，不能代替明确要求的四层答案。",
        "先读题设几层，不判另一种模型普遍错误。",
      ),
      W(
        "网络接口层 → 会话层 → 表示层 → 应用层",
        "model-osi-mix",
        "不要混用两套层名",
        "四层模型没有独立会话、表示层，也不能漏掉网际、传输层。",
        "每次采用同一套模型名称。",
      ),
    ],
  );
}
function mappedUpper(id, prompt) {
  return Q(
    id,
    prompt,
    "应用层",
    "在本课四层映射约定中，OSI会话、表示、应用三层职责归入TCP/IP应用层范围。",
    [
      W(
        "传输层",
        "mapping-transport",
        "端到端传输不包办所有上层语义",
        "会话组织或数据语法不因采用TCP就全部变成TCP机制。",
        "映射范围与底层承载分别说明。",
      ),
      W(
        "网际层",
        "mapping-internet",
        "IP寻址不解释这些上层语义",
        "网际层负责IP相关逻辑寻址与分组转发。",
        "它是否在选择IP下一跳？",
      ),
      W(
        "独立表示层或会话层",
        "mapping-independent",
        "四层模型没有这两个独立层名",
        "功能仍可实现，但不是新增四层模型中的独立层。",
        "不独立列层不等于删除功能。",
      ),
    ],
  );
}
function role(id, prompt, right, wrong) {
  return Q(
    id,
    prompt,
    right,
    "按任务的决策依据和服务范围区分，而不是只看设备名称或载荷里有哪种数据。",
    wrong,
  );
}
export const models = pack(
  "network-engineer:02.01.02",
  "TCP/IP四层模型与OSI映射",
  [
    {
      id: "model-order",
      title: "先确定采用哪套模型",
      foundation:
        "本课采用TCP/IP四层：网络接口、网际、传输、应用。教材也可能使用把接口职责再拆开的五层教学模型；题目必须先明确约定。",
      takeaway:
        "四层自下而上为网络接口、网际、传输、应用；四层、五层和OSI七层不能混列。",
      cards: [
        E("model-order-explain", "层数不同，不代表缺少功能", [
          "四层将链路与物理相关职责放在网络接口范围，五层教学形式将两者分开。层数是描述方式，不能因此认定五层模型错误或现实系统只能分成四个进程。",
          "先看题目指定模型，再确认阅读方向。自下而上是在介质承载之上逐渐接近应用；发送封装则沿相反方向进行。",
        ]),
      ],
      questions: [
        modelOrder(
          "model-order-check",
          "本课TCP/IP四层模型，自下而上正确次序是什么？",
        ),
        Q(
          "model-order-v1",
          "采用四层模型，沿发送方向从应用服务走向本链路承载，次序是什么？",
          "应用层 → 传输层 → 网际层 → 网络接口层",
          "发送沿自上而下方向逐层使用下层服务。",
          [
            W(
              "网络接口层 → 网际层 → 传输层 → 应用层",
              "model-send-reversed",
              "这是自下而上顺序",
              "题目要求沿发送方向从应用走向链路。",
              "先在图上标出起点和终点。",
            ),
            W(
              "应用层 → 网际层 → 传输层 → 网络接口层",
              "model-send-ip-tcp",
              "传输在网际之上",
              "普通四层模型中TCP/UDP传输服务位于应用与IP之间。",
              "先定位TCP段和IP分组的包含关系。",
            ),
            W(
              "应用层 → 表示层 → 会话层 → 网络接口层",
              "model-send-osi",
              "混用了独立OSI上层名称",
              "四层不单列表示和会话，也不能省略传输与网际。",
              "全程采用题设模型。",
            ),
          ],
        ),
        Q(
          "model-order-v2",
          "四层TCP/IP模型中，应用层直接使用的下一层服务属于哪层？",
          "传输层",
          "传输层位于应用层与网际层之间。",
          [
            W(
              "网际层",
              "model-adjacent-ip",
              "不要跳过传输层",
              "四层模型次序是应用、传输、网际、接口。",
              "这里问相邻层，不是最终承载层。",
            ),
            W(
              "网络接口层",
              "model-adjacent-link",
              "接口范围位于底部",
              "应用向下经过传输与网际才到接口范围。",
              "依次画出四个层。",
            ),
            W(
              "独立会话层",
              "model-adjacent-session",
              "不能插入OSI独立层名",
              "四层模型不单列会话层。",
              "先确认采用哪套模型。",
            ),
          ],
        ),
      ],
    },
    {
      id: "model-mapping",
      title: "合并职责，不是删除职责",
      foundation:
        "按常见四层与OSI映射，OSI前三个上层的职责合并到TCP/IP应用层范围，物理和链路相关职责对应网络接口范围。实际软件可按自己的模块组织实现。",
      takeaway:
        "OSI会话、表示、应用对应四层应用范围；物理与链路对应网络接口范围，不强行拆实际程序。",
      cards: [
        T("model-mapping-table", "按职责看映射", [
          ["OSI应用、表示、会话", "TCP/IP应用层范围"],
          ["OSI传输", "TCP/IP传输层"],
          ["OSI网络", "TCP/IP网际层"],
          ["OSI数据链路、物理", "TCP/IP网络接口层范围"],
        ]),
        E("model-mapping-explain", "看功能放在哪个描述范围", [
          "合并后的应用层仍可实现会话、编码和业务协议。它不是“这些能力不存在”，也不表示每个应用必须自行重复实现所有功能。",
          "接口层描述本地链路承载范围；不能因为它包含物理职责就把IP路由算法也归入接口层。",
        ]),
      ],
      questions: [
        mappedUpper(
          "model-mapping-check",
          "按本课四层映射，OSI应用、表示、会话三层职责归入哪个范围？",
        ),
        mappedUpper(
          "model-mapping-v1",
          "TCP/IP四层不单列表示层；对应用数据语法与格式的相关上层处理归入哪个描述范围？",
        ),
        Q(
          "model-mapping-v2",
          "按本课映射，OSI数据链路与物理相关职责对应四层的哪个范围？",
          "网络接口层",
          "四层的网络接口范围包含本地链路与介质传输相关职责。",
          [
            W(
              "网际层",
              "mapping-lower-ip",
              "链路承载与IP寻路分开",
              "网际层以IP进行逻辑寻址与转发，不等于全部物理和链路职责。",
              "看是承载本跳还是选择跨网路径。",
            ),
            W(
              "传输层",
              "mapping-lower-transport",
              "端点交付不是电气接口和MAC转发",
              "TCP/UDP属于传输范围。",
              "先识别处理对象。",
            ),
            W(
              "应用层",
              "mapping-lower-app",
              "上层服务不替代底层承载",
              "应用使用网络服务，不能把所有下层职责都归为应用。",
              "使用功能与提供功能分开。",
            ),
          ],
        ),
      ],
    },
    {
      id: "model-roles",
      title: "用任务判断所在层",
      foundation:
        "网络接口负责本链路承载，网际层负责IP寻址和分组转发，传输层用端点与端口提供端到端服务，应用层解释网络服务语义。",
      takeaway:
        "IP下一跳看网际层，TCP/UDP端点看传输层，本链路帧封装看网络接口层；载荷内容不改变当前任务层次。",
      cards: [
        E("model-roles-explain", "同一次发送会用到多层", [
          "路由器按目的IP查表选出口是网际层任务；在出口把分组装入当前链路帧是接口范围任务。一个设备会执行多个层次的功能。",
          "TCP段被装进IP分组，并不会把TCP确认重传变成IP机制。装载关系与职责归属需要分别判断。",
        ]),
      ],
      questions: [
        role(
          "model-roles-check",
          "TCP/IP四层中，依据目的IP与路由表选择下一跳，属于哪层？",
          "网际层",
          [
            W(
              "网络接口层",
              "role-ip-interface",
              "本链路承载不等于IP寻路",
              "题目决策依据是目的IP与路由表。",
              "先找使用的地址和表。",
            ),
            W(
              "传输层",
              "role-ip-transport",
              "TCP端点不是下一跳",
              "传输端口分用不计算本题的IP转发出口。",
              "问的是路径还是进程？",
            ),
            W(
              "应用层",
              "role-ip-application",
              "业务语义不负责普通IP转发",
              "应用可使用IP，但本题是分组转发任务。",
              "按当前执行动作分类。",
            ),
          ],
        ),
        role(
          "model-roles-v1",
          "TCP/IP四层中，处理TCP序号、确认与重传，属于哪个范围？",
          "传输层",
          [
            W(
              "网际层",
              "role-tcp-ip",
              "TCP在IP载荷中不代表属于IP层",
              "TCP首部和可靠机制属于传输协议。",
              "装载关系不是职责归属。",
            ),
            W(
              "网络接口层",
              "role-tcp-link",
              "链路帧不是端到端TCP连接",
              "二层转发不执行所有TCP确认逻辑。",
              "看机制作用范围。",
            ),
            W(
              "应用层",
              "role-tcp-app",
              "业务结果与字节可靠性不同",
              "应用解释业务，TCP提供传输服务。",
              "确定哪种协议定义字段。",
            ),
          ],
        ),
        role(
          "model-roles-v2",
          "TCP/IP四层中，在普通以太网出口添加当前链路的帧头和FCS，属于哪个范围？",
          "网络接口层",
          [
            W(
              "网际层",
              "role-frame-internet",
              "IP分组与承载帧不同",
              "以太网帧头与FCS不是IP首部。",
              "标出最外层当前协议。",
            ),
            W(
              "传输层",
              "role-frame-transport",
              "帧FCS不是TCP确认",
              "TCP首部位于IP载荷中。",
              "链路差错检测与端到端机制分开。",
            ),
            W(
              "应用层",
              "role-frame-application",
              "载荷有业务数据也不改变帧封装职责",
              "所有层都可能承载应用数据，但各自执行不同任务。",
              "按执行动作，而非载荷来源分类。",
            ),
          ],
        ),
      ],
    },
  ],
  [own("network-engineer:02.01.02"), rfc],
  "1edc824c5cf83deabec2",
);
function relation(id, prompt, right, wrong) {
  return Q(
    id,
    prompt,
    right,
    "协议规定对等实体的通信规则；服务描述下层提供的能力；接口约定相邻层怎样使用该能力。",
    wrong,
  );
}
const relationWrong = (correct) =>
  [
    ["协议", "peer", "对等实体通信规则"],
    ["服务", "service", "下层给上层的能力"],
    ["接口", "interface", "相邻层使用能力的调用约定"],
    ["载荷", "payload", "某层数据单位携带的上层内容"],
  ]
    .filter(([text]) => text !== correct)
    .map(([text, key, reason]) =>
      W(
        text,
        "layer-relation-" + key,
        "重新确定关系方向",
        `${text}对应${reason}，不是题设关系。`,
        "先画出双方：对等实体还是上下相邻层。",
      ),
    );
function order(id, prompt, right, wrong) {
  return Q(
    id,
    prompt,
    right,
    "本题限定普通TCP/UDP over IPv4 over Ethernet，无隧道等额外封装；发送从上到下封装，接收按相应协议解封装。",
    wrong,
  );
}
function lengthQ(id, payload, protocol) {
  const transport = protocol === "TCP" ? 20 : 8,
    packet = payload + 20 + transport,
    frame = packet + 18;
  return Q(
    id,
    `普通无VLAN以太网承载IPv4/${protocol}。应用数据${payload}B，IPv4首部20B，${protocol}首部${transport}B，以太网头14B与FCS4B。无选项、分片或填充；不计前导码和帧间隙。帧总长度多少？`,
    `${frame} B`,
    `${payload}+${transport}+20+14+4=${frame}B；先累加内层，再加外层开销。`,
    [
      W(
        `${packet} B`,
        "encap-count-ip-only",
        "算到IP分组还没算完整帧",
        "漏掉以太网头14B与FCS4B。",
        "先写每一层包含的边界。",
      ),
      W(
        `${frame - 4} B`,
        "encap-count-no-fcs",
        "题设帧长度包括FCS",
        "只加以太网头而漏掉尾部校验字段。",
        "帧有头，也可能有尾。",
      ),
      W(
        `${frame + 20} B`,
        "encap-count-double-ip",
        "不要重复计算已包含的IP首部",
        "题设每个首部只增加一次；IP分组已经含有其20B首部。",
        "先算内层总长，再仅加新增字段。",
      ),
    ],
  );
}
export const layering = pack(
  "network-engineer:02.01.03",
  "分层原则、协议服务与封装",
  [
    {
      id: "layer-relations",
      title: "协议、服务、接口",
      foundation:
        "对等层实体按协议规则通信；下层向上层提供服务，相邻层通过接口使用服务。逻辑对等通信通常借助下层实际传输。",
      takeaway:
        "协议看对等规则，服务看能力，接口看相邻层调用约定；不要把逻辑对等通信理解成绕过下层。",
      cards: [
        T("layer-relations-table", "先看双方是什么关系", [
          ["两端TCP实体如何解释序号与确认", "协议规则"],
          ["向应用提供可靠字节流能力", "传输服务"],
          ["应用怎样调用本地网络能力", "接口约定"],
        ]),
        E("layer-relations-explain", "能力、用法和互通规则是三件事", [
          "开发者调用本地接口使用传输服务，两端传输实体再按协议约定交换数据。接口实现细节可不同，但通信必须满足相应协议条件。",
          "分层隐藏实现细节，允许替换实现；不表示任意不兼容实现都会互通，也不是强制每层只允许一种协议。",
        ]),
      ],
      questions: [
        relation(
          "layer-relations-check",
          "两端对等TCP实体如何解释序号与确认字段，这种通信规则称为什么？",
          "协议",
          relationWrong("协议"),
        ),
        relation(
          "layer-relations-v1",
          "下层向上层提供“可靠字节流”能力，这里强调的是什么？",
          "服务",
          relationWrong("服务"),
        ),
        relation(
          "layer-relations-v2",
          "应用按本地调用约定请求下层发送数据，这个调用边界强调什么？",
          "接口",
          relationWrong("接口"),
        ),
      ],
    },
    {
      id: "layer-encapsulation",
      title: "发送封装与接收解封装",
      foundation:
        "本段限定普通TCP/UDP、IPv4和以太网。上层数据成为下层载荷，发送从上到下逐层添加必要控制信息；不同协议可有不同首部、尾部。",
      takeaway:
        "TCP段或UDP数据报成为IP载荷，IP分组成为以太网载荷；接收解封装方向相反，不是每层都添加同一种字段。",
      cards: [
        E("layer-encapsulation-explain", "把外层与载荷分开标注", [
          "普通TCP场景的结构可写为：以太网头 | IPv4头 | TCP头 | 应用数据 | 以太网FCS。发送端逐层加入控制信息；接收端逐层识别对应协议并交付其载荷。",
          "TCP字节流可能被分为多个段；应用消息不一定对应一个TCP段、一个IP分组或一个以太网帧。本节不是“一个请求必定只产生一帧”的承诺。",
        ]),
      ],
      questions: [
        order(
          "layer-encapsulation-check",
          "普通TCP/IPv4/以太网发送，逐层封装的次序是什么？",
          "应用数据 → TCP段 → IP分组 → 以太网帧",
          [
            W(
              "应用数据 → IP分组 → TCP段 → 以太网帧",
              "encap-order-tcp-ip",
              "TCP在IP内而不是IP在TCP内",
              "普通IP分组以TCP段为载荷。",
              "从内到外写嵌套。",
            ),
            W(
              "以太网帧 → IP分组 → TCP段 → 应用数据",
              "encap-order-receive",
              "这是接收方向",
              "题目问发送时逐层封装。",
              "先确认方向。",
            ),
            W(
              "应用数据直接成为MAC地址",
              "encap-payload-address",
              "数据载荷不等于地址字段",
              "MAC地址标识当前链路收发，不承载整份应用数据。",
              "把载荷与控制字段分开。",
            ),
          ],
        ),
        order(
          "layer-encapsulation-v1",
          "普通UDP/IPv4/以太网发送，封装次序是什么？",
          "应用数据 → UDP数据报 → IP分组 → 以太网帧",
          [
            W(
              "应用数据 → TCP段 → IP分组 → 以太网帧",
              "encap-wrong-transport",
              "本题选用UDP",
              "不能把所有传输都默认成TCP。",
              "先读题设传输协议。",
            ),
            W(
              "应用数据 → IP分组 → UDP数据报 → 以太网帧",
              "encap-udp-outside",
              "UDP位于IP载荷中",
              "普通IPv4首部位于UDP首部外侧。",
              "确认包含关系。",
            ),
            W(
              "以太网帧 → UDP数据报 → IP分组 → 应用数据",
              "encap-udp-direction",
              "方向与包含顺序均不符",
              "发送从应用向链路逐层封装。",
              "每次只增加下一外层。",
            ),
          ],
        ),
        Q(
          "layer-encapsulation-v2",
          "发送一个应用消息，是否必然对应一个TCP段和一个以太网帧？",
          "不必然，字节流分段和各层处理可能改变单位边界",
          "应用边界与传输、链路单位不一一对应。",
          [
            W(
              "必然，每次send就固定产生一帧",
              "encap-send-frame",
              "调用边界不是网络单位承诺",
              "TCP可以合并或拆分数据。",
              "区分应用消息与协议传输单位。",
            ),
            W(
              "必然，TCP必须保留每次调用的消息边界",
              "encap-tcp-message",
              "TCP提供字节流",
              "应用需自行定义消息边界。",
              "先识别TCP服务单位。",
            ),
            W(
              "不必然，因为以太网帧从不包含IP载荷",
              "encap-deny-ip",
              "结论不能依赖错误前提",
              "以太网可承载IP分组。",
              "核对实际包含关系。",
            ),
          ],
        ),
      ],
    },
    {
      id: "layer-hop",
      title: "逐跳重封装的边界",
      foundation:
        "本段限定普通路由、相邻链路都是以太网、无NAT/隧道/代理等额外改写。路由器移除入链路封装，转发IP分组并建立出链路封装。",
      takeaway:
        "普通路由逐跳重封装链路帧，不代表每跳都终止TCP或把最终IP目的改成网关；TTL会变化。",
      cards: [
        E("layer-hop-explain", "换信封，不把中间站当最终目的", [
          "主机S经路由器R发给远端T。第一跳帧交给R，后续帧由R的出口交给该链路下一跳；在本段条件下IP目的仍指向T。",
          "路由器进行IP转发时会更新TTL等字段，不能说整个IP首部永远不变。它通常不终止这条端到端TCP连接；代理、NAT和隧道等另按各自规则分析。",
        ]),
      ],
      questions: [
        Q(
          "layer-hop-check",
          "题设普通路由无NAT/隧道。重新封装下一链路帧，哪项正确？",
          "链路帧按新一跳封装，最终目的IP仍指向原目标",
          "链路收件对象与最终网络层目标不同。",
          [
            W(
              "最终目的IP必须改为该路由器",
              "encap-hop-destination",
              "中间转交不是最终目标",
              "路由器依据最终目的查路由。",
              "区分下一跳与最终目的。",
            ),
            W(
              "所有以太网MAC字段必须端到端保持不变",
              "encap-hop-mac",
              "每条以太网链路有自己的收发接口",
              "出链路重新封装相应MAC字段。",
              "在每一跳写出发送者和下一跳。",
            ),
            W(
              "每个路由器都必须终止TCP并重建应用请求",
              "encap-hop-tcp",
              "普通转发不是应用代理",
              "题设排除了代理等特殊处理。",
              "看设备当前执行的是转发还是端点服务。",
            ),
          ],
        ),
        Q(
          "layer-hop-v1",
          "普通IPv4路由转发时“最终目的IP不变”是否意味着整个IP首部逐位不变？",
          "不是，TTL等转发相关字段会变化",
          "地址保持不是首部所有字段保持。",
          [
            W(
              "是，任何IP首部字段都不可变",
              "encap-hop-header",
              "TTL用于限制分组生存",
              "转发更新TTL，并相应处理首部校验和。",
              "分别核对地址与控制字段。",
            ),
            W(
              "不是，因为每跳必须把IP目的改成入口MAC",
              "encap-hop-mix",
              "IP地址与MAC不可互换",
              "首部字段变化不代表跨层地址替换。",
              "先检查字段类型。",
            ),
            W(
              "是，因为TTL属于TCP而非IP",
              "encap-hop-ttl-layer",
              "TTL在IPv4首部中",
              "它不是TCP传输序号字段。",
              "把字段放回所属首部。",
            ),
          ],
        ),
        Q(
          "layer-hop-v2",
          "题目明确存在NAT或隧道，能否不看具体规则就沿用“所有端到端地址不变”结论？",
          "不能，应按具体改写或封装机制分析",
          "普通路由条件不能覆盖所有特殊机制。",
          [
            W(
              "能，任何网络设备都不能改写IP地址",
              "encap-hop-nat-deny",
              "NAT具有地址转换功能",
              "条件已不同于普通无改写转发。",
              "先识别题设新增机制。",
            ),
            W(
              "能，隧道外层地址必定就是原始内层地址",
              "encap-hop-tunnel",
              "内外层地址角色不同",
              "隧道可添加外层头，按隧道端点寻址。",
              "分别写出内层与外层。",
            ),
            W(
              "不能，所以普通路由从不保持目的IP",
              "encap-hop-generalize",
              "特殊情况不否定普通条件",
              "不同条件下采用相应规则。",
              "不要从存在例外推出相反绝对结论。",
            ),
          ],
        ),
      ],
    },
    {
      id: "layer-length",
      title: "控制字段与长度累加",
      foundation:
        "每层数据单位包含其控制字段与载荷。长度计算先界定边界：是否包含帧尾、填充、选项、VLAN标签、前导码或帧间隙。",
      takeaway:
        "先写题设每层边界，新增头尾只加一次；IP总长与以太网帧长不同，额外开销必须按条件判断。",
      cards: [
        E("layer-length-explain", "先画边界，再加字节", [
          "例：应用数据80B，TCP头20B，IPv4头20B，无选项和分片，IP总长120B。无VLAN以太网头14B与FCS4B，且无填充时，题设帧长为138B。",
          "这里不计前导码与帧间隙；若问链路占用或题设加入选项、标签和填充，应重新列项。IP总长已经包括IP头，不能再重复增加一次。",
        ]),
      ],
      questions: [
        lengthQ("layer-length-check", 100, "TCP"),
        lengthQ("layer-length-v1", 250, "TCP"),
        lengthQ("layer-length-v2", 200, "UDP"),
      ],
    },
  ],
  [
    own("network-engineer:02.01.03"),
    rfc,
    {
      title: "RFC791 · IPv4字段与封装",
      url: "https://www.rfc-editor.org/rfc/rfc791",
    },
    {
      title: "Cisco · 无标签以太网帧开销",
      url: "https://www.cisco.com/c/en/us/support/docs/switches/catalyst-9500-series-switches/217233-troubleshoot-mtu-on-catalyst-9000-series.html",
    },
  ],
  "b856eff12329d08d205b",
);
