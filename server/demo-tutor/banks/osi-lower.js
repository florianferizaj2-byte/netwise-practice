import { E, T, question as Q, pack } from "../authoring.js";
const W = (text, type, title, reason, hint) => [
  text,
  type,
  title,
  reason,
  hint,
];
const own = (id) => ({ title: "已审核知识点快照", url: `local:${id}` });
const osi = {
  title: "IBM · OSI分层职责",
  url: "https://www.ibm.com/think/topics/osi-model",
};
const rfc = {
  title: "RFC791 · IPv4",
  url: "https://www.rfc-editor.org/rfc/rfc791",
};
const switchSource = {
  title: "Cisco · MAC学习与转发",
  url: "https://www.cisco.com/c/en/us/support/docs/switches/catalyst-6500-series-switches/71079-arp-cam-tableissues.html",
};
function physicalRole(id, prompt) {
  return Q(
    id,
    prompt,
    "物理层",
    "比特与信号的收发属于物理层，不需要读取MAC、IP或应用内容。",
    [
      W(
        "数据链路层",
        "physical-frame",
        "先区分信号与帧",
        "链路层负责成帧和链路传送；题目询问信号收发。",
        "看任务处理的是波形还是帧字段。",
      ),
      W(
        "网络层",
        "physical-ip",
        "没有进行路由决策",
        "网络层以逻辑地址选择分组下一跳。",
        "题目是否需要查目的IP和路由表？",
      ),
      W(
        "应用层",
        "physical-application",
        "介质收发不是业务协议",
        "应用层定义业务请求与响应；不直接规定线缆电信号。",
        "先识别输入输出是什么。",
      ),
    ],
  );
}
function hub(id, prompt) {
  return Q(
    id,
    prompt,
    "物理层的信号转发，不按目的MAC选择端口",
    "传统集线器是物理层设备，不能替代二层交换机的MAC学习与定向转发。",
    [
      W(
        "数据链路层按目的MAC定向转发",
        "hub-switch",
        "不要把集线器当交换机",
        "传统集线器不建立MAC转发表；二层交换机才按目的MAC查表。",
        "看设备是否解析帧地址。",
      ),
      W(
        "网络层按目的IP选择下一跳",
        "hub-router",
        "信号复制不是路由",
        "集线器不查询路由表或选择IP下一跳。",
        "寻路需要逻辑地址和路由信息。",
      ),
      W(
        "传输层按TCP端口分发",
        "hub-port",
        "物理接口不是TCP端口",
        "集线器接口与传输层端口号是不同概念。",
        "区分接口位置与应用进程编号。",
      ),
    ],
  );
}
export const physical = pack(
  "network-engineer:02.01.01:physical",
  "物理层：比特、信号与介质",
  [
    {
      id: "physical-bits",
      title: "比特怎样变成信号",
      foundation:
        "OSI第一层处理比特流在介质上的发送与接收。电、光或无线信号承载比特；信号有噪声，并不天然保证无误。",
      takeaway: "物理层关注比特与信号收发，不按MAC、IP或应用内容作转发判断。",
      cards: [
        E("physical-bits-explain", "先问：正在处理哪种对象？", [
          "网卡接口把比特编码为信号，对端从信号恢复比特。帧头地址和业务含义由相应上层处理。",
          "物理层的规范可能涉及电气、机械、功能和规程特性；连接器形状、电平与收发时序都需要约定。",
        ]),
      ],
      questions: [
        physicalRole(
          "physical-bits-check",
          "把比特变成光脉冲并在对端恢复比特，主要属于哪层？",
        ),
        physicalRole(
          "physical-bits-v1",
          "规定接口电平和比特传输时序，主要属于哪层？",
        ),
        physicalRole(
          "physical-bits-v2",
          "无线接收端从射频信号恢复比特，主要属于哪层？",
        ),
      ],
    },
    {
      id: "physical-media",
      title: "介质与速率的边界",
      foundation:
        "双绞线、光纤和无线是传输介质。物理链路标称速率与应用实际吞吐量不是同一个数值。",
      takeaway:
        "介质与信号收发属于物理层；链路速率不等于应用吞吐，也不保证零误码。",
      cards: [
        T("physical-media-table", "把连接与业务分开", [
          ["光纤上的光信号", "物理介质与信号"],
          ["以太网帧的目的MAC", "链路层地址"],
          ["下载每秒收到的有效字节", "受到协议开销与路径瓶颈影响"],
        ]),
        E("physical-media-explain", "一根快线不代表整个路径都快", [
          "某接口标称1Gb/s，下载仍受服务器、共享带宽、协议开销和其他链路影响。不能直接把标称速率写成用户有效吞吐。",
        ]),
      ],
      questions: [
        Q(
          "physical-media-check",
          "接口标称1Gb/s，能否据此断言每个下载都得到1Gb/s有效数据？",
          "不能，还受协议开销、路径瓶颈和端系统影响",
          "标称链路速率不是端到端应用保证。",
          [
            W(
              "能，接口速率就是下载吞吐",
              "media-throughput",
              "区分链路与路径",
              "下载经过多个环节，链路速率只是其中约束。",
              "寻找最慢环节与额外开销。",
            ),
            W(
              "不能，因为1Gb/s表示1GB/s",
              "media-unit",
              "bit与Byte不能互换",
              "Gb/s的b表示比特，GB/s的B表示字节；这也不是题目的主要限制。",
              "先检查单位，再看路径。",
            ),
            W(
              "能，只要使用光纤就没有任何开销",
              "media-fiber",
              "光纤仍承载协议数据",
              "光纤改变介质，不消除帧头、拥塞和端系统限制。",
              "介质与协议开销分别判断。",
            ),
          ],
        ),
        Q(
          "physical-media-v1",
          "双绞线换为光纤时，最直接改变的是哪类要素？",
          "物理传输介质与信号接口",
          "更换介质不等于更换应用协议。",
          [
            W(
              "必须把HTTP换成DNS",
              "media-app",
              "介质不决定应用协议",
              "HTTP和DNS解决不同业务，均可运行在多种介质上。",
              "先区分物理承载与业务用途。",
            ),
            W(
              "IP地址变成目的MAC",
              "media-address",
              "地址职责不会互换",
              "IP和MAC仍属于各自层次。",
              "换介质不改变分层角色。",
            ),
            W(
              "无需协商便能保证任何两种光接口互通",
              "media-device",
              "同为光纤也要匹配接口规范",
              "波长、速率、收发规格和连接方式等仍需兼容。",
              "检查两端接口参数，不只检查介质名称。",
            ),
          ],
        ),
        Q(
          "physical-media-v2",
          "物理链路已建立，是否必然代表帧无误且网页能访问？",
          "不必然，还要检查链路、网络和应用等环节",
          "链路建立不是整个业务成功的充分条件。",
          [
            W(
              "必然，连通灯证明所有层正常",
              "media-link-light",
              "连接状态不能证明业务成功",
              "地址、路由、DNS与服务均可能出错。",
              "逐层缩小故障范围。",
            ),
            W(
              "必然，物理层负责修复所有帧错误",
              "media-repair",
              "不要无限扩大物理层职责",
              "物理编码可以提供一定保护，但不是所有帧差错与业务故障的统一修复。",
              "帧检测与业务结果分开。",
            ),
            W(
              "必然，只要收到一帧且FCS通过就证明所有网页服务正常",
              "media-optical",
              "一帧校验不能证明整个业务路径正常",
              "FCS检查该帧的差错，不验证DNS、远端服务和访问权限等业务条件。",
              "把一个局部证据与整体业务结果分开。",
            ),
          ],
        ),
      ],
    },
    {
      id: "physical-hub",
      title: "集线器不是交换机",
      foundation:
        "传统以太网集线器与中继器以物理层方式处理信号；设备分类以实际功能为准，不能只看外壳接口。",
      takeaway:
        "传统集线器不学习MAC；二层交换机学习MAC并按目的MAC转发，路由器按网络层信息寻路。",
      cards: [
        E("physical-hub-explain", "看决策依据，不数插口", [
          "传统集线器把收到的信号向其他接口重复发送，不读取目的MAC决定某一个出口。",
          "二层交换机收到帧后学习源MAC、查目的MAC决定转发。多层设备同时具有物理接口和更高层功能，不能因此把整个路由器归为物理层设备。",
        ]),
      ],
      questions: [
        hub(
          "physical-hub-check",
          "传统集线器向其他接口重复收到的信号，属于什么行为？",
        ),
        hub(
          "physical-hub-v1",
          "设备不解析帧地址，仅重复信号；应如何理解它的转发？",
        ),
        hub(
          "physical-hub-v2",
          "同学说“集线器会学习MAC并只送到目的主机端口”，正确的修正是什么？",
        ),
      ],
    },
  ],
  [own("network-engineer:02.01.01:physical"), osi],
  "80f1d7de46a38387dc13",
);
function learn(id, source, dest, port) {
  return Q(
    id,
    `普通二层交换机开启动态学习，在端口${port}收到源MAC=${source}、目的MAC=${dest}的有效帧。它学习哪条位置关系？`,
    `${source} → 端口${port}`,
    "动态MAC学习依据帧的源地址及入口端口，转发查询另用目的地址。",
    [
      W(
        `${dest} → 端口${port}`,
        "link-learn-destination",
        "收到帧只证明发送者在入口方向",
        "目的主机未必位于该入口；帧的源地址才提供位置证据。",
        "学习看源，转发看目的。",
      ),
      W(
        `${source} → TCP端口80`,
        "link-transport-port",
        "交换机接口不是TCP端口",
        "MAC表记录二层接口位置，不记录进程端口。",
        "先确认“端口”属于哪种层次。",
      ),
      W(
        "仅凭目的IP即可完成这条MAC学习",
        "link-learn-ip",
        "MAC学习不依赖IP路由表",
        "该过程按帧源MAC和入口接口记录。",
        "帧字段和IP字段分开。",
      ),
    ],
  );
}
function integrity(id, prompt) {
  return Q(
    id,
    prompt,
    "检测到差错并丢弃该坏帧；不能仅靠CRC恢复任意原始数据",
    "普通以太网FCS提供差错检测，不能把差错检测直接等同于纠错或保证端到端可靠性。",
    [
      W(
        "CRC可以纠正任意数量的错误",
        "link-crc-correct",
        "检测不等于纠错",
        "以太网FCS不提供任意差错恢复能力。",
        "校验失败说明不可相信，不给出正确原文。",
      ),
      W(
        "FCS通过就证明应用内容正确",
        "link-crc-app",
        "位校验不是业务验证",
        "FCS有检测能力边界，也不验证业务语义或身份。",
        "校验范围与业务正确性分开。",
      ),
      W(
        "交换机必须按TCP规则重传这个帧",
        "link-tcp-retry",
        "以太网与TCP机制分开",
        "普通二层以太网FCS处理不等于执行端到端TCP重传。",
        "不是所有链路协议都执行同一重传机制。",
      ),
    ],
  );
}
export const dataLink = pack(
  "network-engineer:02.01.01:data-link",
  "数据链路层：帧与MAC转发",
  [
    {
      id: "link-frame",
      title: "帧在一段链路上传送",
      foundation:
        "OSI第二层把上层数据封装为帧。以太网帧的MAC地址用于本链路收发；跨网目的IP与本跳目的MAC可以指向不同对象。",
      takeaway:
        "帧和MAC属于链路层；发往外网的以太网帧通常先交给本地下一跳，而非远端主机MAC。",
      cards: [
        T("link-frame-table", "地址分别解决什么问题", [
          ["目的MAC", "在当前以太网链路交给谁"],
          ["目的IP", "分组最终发往哪个网络层目的地址"],
          ["TCP/UDP目的端口", "交给哪个传输端点"],
        ]),
        E("link-frame-explain", "一跳的收件人和最终收件人", [
          "无NAT的普通路由路径中，主机发往远端服务器时，第一跳帧交给本地网关的MAC；IP分组仍以服务器为目的。路由器在后续以太网链路重新封装帧。",
        ]),
      ],
      questions: [
        Q(
          "link-frame-check",
          "主机发送到另一网络的服务器，已选本地网关为下一跳。第一跳以太网帧的目的MAC是谁？",
          "本地网关在该链路上的MAC",
          "第一跳帧交给下一跳网关。",
          [
            W(
              "必须是远端服务器MAC",
              "link-remote-mac",
              "远端MAC不能直接覆盖整条路径",
              "跨网由路由器逐跳转发，并重新封装本跳帧。",
              "先找本链路下一跳。",
            ),
            W(
              "是服务器TCP端口号",
              "link-mac-port",
              "端口号不是MAC",
              "TCP端口属于传输层，不填进以太网目的MAC字段。",
              "对应到帧头字段。",
            ),
            W(
              "是本机IP地址",
              "link-mac-ip",
              "源IP不是目的MAC",
              "MAC与IP字段及方向都不同。",
              "分别确认地址类型和发送方向。",
            ),
          ],
        ),
        learn("link-frame-v1", "M", "N", 6),
        learn("link-frame-v2", "U", "V", 4),
      ],
    },
    {
      id: "link-switch",
      title: "学习源地址，查询目的地址",
      foundation:
        "普通二层交换机动态学习源MAC与入口位置，用目的MAC查询转发表。以下均假定同一VLAN、端口允许转发且没有安全过滤。",
      takeaway:
        "MAC学习看源地址；已知目的定向转发，未知目的在同VLAN允许端口泛洪并排除入口。",
      cards: [
        E("link-switch-explain", "同一帧带来两次不同判断", [
          "入口收到源X目的Y的帧，先记录X来自该入口，再查Y在哪个出口。若Y未知，按该VLAN的泛洪规则转发；未知单播仍是单播目的，不变成广播地址。",
          "本段只讨论普通二层交换，过滤、端口状态、VLAN与设备策略可能限制实际出口。",
        ]),
      ],
      questions: [
        learn("link-switch-check", "A", "B", 2),
        Q(
          "link-switch-v1",
          "同VLAN端口1/2/3均允许转发。端口1收到目的MAC未知的单播帧，通常从哪些端口送出？",
          "端口2和3",
          "未知单播向同VLAN允许出口泛洪，排除入口。",
          [
            W(
              "端口1、2、3",
              "link-flood-ingress",
              "不要送回入口",
              "普通桥接泛洪排除收到帧的端口。",
              "先划掉入口端口。",
            ),
            W(
              "一律丢弃",
              "link-unknown-drop",
              "未知不等于禁止",
              "题设普通二层转发且无过滤，未知目的通常泛洪。",
              "是否存在额外过滤条件？",
            ),
            W(
              "任意不同VLAN的端口",
              "link-flood-vlan",
              "泛洪不越过VLAN边界",
              "同一交换机并不代表同一广播域。",
              "先锁定帧所属VLAN。",
            ),
          ],
        ),
        Q(
          "link-switch-v2",
          "端口1收到单播帧，目的MAC已知在同VLAN端口3，端口3允许转发。应怎样处理？",
          "仅向端口3转发",
          "已知目的按MAC表定向转发。",
          [
            W(
              "向同VLAN全部其他端口泛洪",
              "link-known-flood",
              "目的已知无需按未知处理",
              "本题明确存在可用目的表项。",
              "先查表，再决定是否泛洪。",
            ),
            W(
              "学习目的MAC位于端口1",
              "link-known-learn",
              "入口证明的是源位置",
              "目的位置已知在3，不因这帧从1来就改成1。",
              "学习与查询分两步。",
            ),
            W(
              "按服务器端口80选择交换机接口",
              "link-known-tcp",
              "二层转发不是进程分发",
              "题目用目的MAC与接口映射，不用TCP端口选出口。",
              "看正在查询哪张表。",
            ),
          ],
        ),
      ],
    },
    {
      id: "link-errors",
      title: "差错检测与介质访问",
      foundation:
        "链路层可规定成帧、介质访问和差错处理。不同链路协议有不同保障；普通以太网FCS检测不等于任意纠错或端到端可靠交付。",
      takeaway:
        "FCS用于检测帧差错，不保证业务正确；不同链路的重传和介质访问规则不可一概而论。",
      cards: [
        E("link-errors-explain", "能发现坏帧，不等于还原原文", [
          "普通以太网帧FCS校验失败时坏帧被丢弃。是否以及怎样重传，由相关协议机制决定；不能把TCP的可靠性直接赋给所有链路。",
          "共享介质需要约定访问方式。半双工共享以太网与全双工交换式以太网的冲突条件不同，不应把CSMA/CD描述为所有现代以太网的必经过程。",
        ]),
      ],
      questions: [
        integrity(
          "link-errors-check",
          "普通以太网接收端发现帧FCS不匹配，怎样理解这一结果？",
        ),
        integrity(
          "link-errors-v1",
          "一帧在传输中损坏，普通以太网FCS发现异常。它能直接做什么？",
        ),
        Q(
          "link-errors-v2",
          "关于以太网介质访问，哪项说法合适？",
          "共享半双工与交换式全双工的冲突条件不同",
          "CSMA/CD面向共享半双工场景，不能扩展为所有全双工链路都要检测碰撞。",
          [
            W(
              "全双工链路每帧都必须先检测碰撞",
              "link-full-collision",
              "全双工不按共享半双工处理",
              "独立的双向通道不采用共享半双工的碰撞争用方式。",
              "先辨认单双工场景。",
            ),
            W(
              "MAC地址属于物理电压标准",
              "link-mac-voltage",
              "地址与信号分开",
              "MAC用于链路层帧寻址，而电压属于物理接口要素。",
              "看对象是标识还是波形。",
            ),
            W(
              "所有链路协议都必须与TCP一样确认重传",
              "link-all-arq",
              "不能把某种可靠机制推广到全部",
              "不同链路协议具有不同差错处理机制。",
              "明确题目说的是哪种协议。",
            ),
          ],
        ),
      ],
    },
  ],
  [own("network-engineer:02.01.01:data-link"), switchSource],
  "64dddb9e304562d22260",
);
function routing(id, prompt) {
  return Q(id, prompt, "网络层", "根据目的IP和路由信息决定下一跳属于网络层。", [
    W(
      "物理层",
      "network-signal",
      "信号收发不决定跨网路径",
      "物理层承载比特，不查询目的IP的路由。",
      "看是否需要逻辑地址。",
    ),
    W(
      "数据链路层",
      "network-mac",
      "本链路MAC转发与跨网路由不同",
      "链路层把帧交给相邻节点，网络层决定分组下一跳。",
      "先区分一跳交付与跨网寻路。",
    ),
    W(
      "传输层",
      "network-process",
      "传输端点不是路由下一跳",
      "TCP/UDP端口用于端点分用，不用于路由表查找。",
      "题目是否在选择进程还是路径？",
    ),
  ]);
}
function hop(id, prompt) {
  return Q(
    id,
    prompt,
    "目的IP仍指向最终主机，新的帧目的MAC指向本跳下一跳",
    "题设无NAT、隧道等改写，普通路由逐跳重新封装链路帧，但不把最终目的IP改为网关。",
    [
      W(
        "目的IP每跳都改为本跳网关IP",
        "network-hop-ip",
        "下一跳与最终目的分开",
        "路由器使用最终目的IP查表；下一跳是本次转交对象。",
        "两个收件层次分别填写。",
      ),
      W(
        "目的MAC必须始终等于最初主机的MAC",
        "network-hop-mac",
        "以太网帧是逐链路封装",
        "链路变化时源、目的MAC按本跳接口重新设置。",
        "同一个IP分组可装在不同帧里。",
      ),
      W(
        "TCP端口号变成路由器物理接口号",
        "network-hop-port",
        "端口不能跨层互换",
        "TCP端口与物理接口各有职责。",
        "编号相似不代表同一对象。",
      ),
    ],
  );
}
export const network = pack(
  "network-engineer:02.01.01:network",
  "网络层：IP寻址与逐跳转发",
  [
    {
      id: "network-routing",
      title: "IP分组怎样跨网",
      foundation:
        "OSI第三层处理逻辑寻址和跨网络分组转发。路由器依据目的地址及路由信息选择下一跳；并非所有设备都仅有单一层功能。",
      takeaway:
        "网络层按目的IP与路由信息选择下一跳；MAC和TCP/UDP端口解决另外两种问题。",
      cards: [
        E("network-routing-explain", "先知道去哪，再决定交给谁", [
          "发往其他网络的分组由路由器逐跳转交。路由表提供目的网络、下一跳和出口等信息；物理接口把信号送出，链路帧负责本跳交付。",
          "路由选择形成路径信息，分组转发按现有信息处理每个分组。多层交换机可提供路由能力，不能只凭“交换机”名字就判定永远没有网络层功能。",
        ]),
      ],
      questions: [
        routing(
          "network-routing-check",
          "路由器查目的IP并选择分组下一跳，主要是哪层职责？",
        ),
        routing(
          "network-routing-v1",
          "按目的网络与路由表选择出口，主要是哪层任务？",
        ),
        routing(
          "network-routing-v2",
          "多层交换机启用IP路由进行跨网分组转发，这部分功能属于哪层？",
        ),
      ],
    },
    {
      id: "network-hop",
      title: "IP目的与本跳MAC",
      foundation:
        "本段限定普通以太网路由路径，无NAT、隧道与策略改写。最终IP目的和链路下一跳是不同角色；TTL/Hop Limit逐跳变化。",
      takeaway:
        "普通路由保持最终目的IP，逐链路重封装MAC；IP首部并非所有字段都不变化。",
      cards: [
        E("network-hop-explain", "不要把网关当成最终收件人", [
          "主机P经路由器R发给远端Q：第一跳帧送到R，分组仍以Q为IP目的。R的下一条以太网链路再封装自己的源MAC和本跳下一跳MAC。",
          "IPv4 TTL与IPv6 Hop Limit防止分组无限循环，转发中会递减。这里的目的IP保持结论不覆盖NAT或隧道封装等明确改写场景。",
        ]),
      ],
      questions: [
        hop(
          "network-hop-check",
          "无NAT的普通路由器将分组发往下一条以太网链路，应如何理解目的IP和目的MAC？",
        ),
        hop(
          "network-hop-v1",
          "主机发送到远端服务器，经本地网关转发；无NAT条件下正确关系是什么？",
        ),
        Q(
          "network-hop-v2",
          "无NAT的普通IPv4路由转发，哪项说法正确？",
          "最终目的IP通常保持，TTL递减，链路帧重新封装",
          "目的IP保持不等于IP首部每一位都不变。",
          [
            W(
              "整个IP首部逐位完全不变",
              "network-header-fixed",
              "TTL是会变化的字段",
              "IPv4转发递减TTL并相应处理首部校验和。",
              "区分最终地址与转发控制字段。",
            ),
            W(
              "最终目的IP每跳替换成网关IP",
              "network-header-gateway",
              "网关是转交对象",
              "普通路由不把最终目标替换为中间路由器。",
              "目的网络决定路由查找。",
            ),
            W(
              "IPv4和IPv6在路由器上都必须重新计算IP首部校验和",
              "network-header-ipv6",
              "IPv6基本首部没有这个校验字段",
              "IPv4首部校验和机制不能直接套给IPv6。",
              "先限定使用哪个IP版本。",
            ),
          ],
        ),
      ],
    },
    {
      id: "network-service",
      title: "尽力而为与职责边界",
      foundation:
        "IP提供尽力而为的分组服务，不保证每个分组必达、有序或只到一次。应用若需要相应保障，应由适当上层协议提供。",
      takeaway:
        "IP路由不等于可靠交付；端口和TCP可靠机制属于传输层，IPv6路由器不为转发分组执行IPv4式分片。",
      cards: [
        T("network-service-table", "别给IP添加没有承诺的功能", [
          ["IP尽力而为", "分组可能丢失、重复或乱序"],
          ["TCP可靠字节流", "传输层的序号、确认及重传等机制"],
          [
            "IPv6转发包太大",
            "路由器不分片，按规范报告Packet Too Big；源端处理",
          ],
        ]),
        E("network-service-explain", "找对保证来自哪里", [
          "IP成功选出下一跳不保证最后抵达。TCP能够提供可靠、有序字节流，但不能据此宣称IP本身保证可靠。",
          "IPv4与IPv6分片规则不同：IPv6路由器不能通过分片把过大转发包变小，源节点可使用分片机制。这些规则不等于所有IPv4包都会被路由器分片。",
        ]),
      ],
      questions: [
        Q(
          "network-service-check",
          "单凭IP网络层服务，能保证每个分组按发送顺序且恰好一次抵达吗？",
          "不能，IP是尽力而为服务",
          "IP不承诺可靠、有序、恰好一次交付。",
          [
            W(
              "能，只要路由表非空",
              "network-route-guarantee",
              "有路由不代表必达",
              "链路故障与拥塞仍可导致丢包。",
              "路径可选与交付保障分开。",
            ),
            W(
              "能，因为所有IP都自动执行TCP重传",
              "network-ip-tcp",
              "IP不等于TCP",
              "TCP是不同的上层协议，也并非所有IP分组载荷都是TCP。",
              "分清协议层次与包含关系。",
            ),
            W(
              "能，目的MAC可以保证整个互联网有序",
              "network-mac-order",
              "MAC不提供整个路径有序保障",
              "MAC负责链路寻址，不承诺跨网分组顺序。",
              "保证的范围是本链路还是端到端？",
            ),
          ],
        ),
        Q(
          "network-service-v1",
          "路由器转发一个超过下一跳MTU的IPv6包，哪项符合IPv6规则？",
          "不在路由器上分片，按规范返回Packet Too Big",
          "IPv6分片只由源节点执行，路由器不分片。",
          [
            W(
              "路由器必须像所有IPv4包一样分片",
              "network-ipv6-fragment",
              "IP版本与条件不能省略",
              "IPv6路由器不分片；IPv4也受DF等条件影响。",
              "先识别版本，再识别限制。",
            ),
            W(
              "给目的IP加一就能缩小包",
              "network-size-address",
              "地址修改不改变载荷大小",
              "MTU是包尺寸约束，地址运算不是解决方法。",
              "根据尺寸限制处理。",
            ),
            W(
              "把MAC改成TCP端口即可消除MTU",
              "network-size-port",
              "字段互换不能解决尺寸",
              "不同层地址与MTU属于不同问题。",
              "先确认约束作用在哪个对象。",
            ),
          ],
        ),
        Q(
          "network-service-v2",
          "把数据交给目标主机上的指定应用进程，TCP/UDP使用的端口号主要属于哪层？",
          "传输层",
          "端口用于传输端点分用，不是网络层IP路由地址。",
          [
            W(
              "网络层",
              "network-endpoint-layer",
              "主机地址与进程端点分开",
              "IP地址寻址主机/接口方向，端口标识传输端点。",
              "问的是哪台主机还是哪个端点？",
            ),
            W(
              "数据链路层",
              "network-endpoint-mac",
              "MAC不是应用进程端口",
              "链路帧MAC不标识TCP/UDP进程端点。",
              "把地址填入所属首部。",
            ),
            W(
              "物理层",
              "network-endpoint-interface",
              "物理插口不是协议端口号",
              "接口承载信号，TCP/UDP端口标识传输端点。",
              "同叫端口不意味着同一层。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    own("network-engineer:02.01.01:network"),
    rfc,
    { title: "RFC8200 · IPv6", url: "https://www.rfc-editor.org/rfc/rfc8200" },
  ],
  "60e6f60e33512b512c35",
);
