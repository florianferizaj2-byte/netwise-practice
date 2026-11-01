import { E, K, T, question as Q, pack } from "../authoring.js";
const W = (text, type, title, reason, hint) => [
  text,
  type,
  title,
  reason,
  hint,
];
const fmt = (n) => Number(n.toFixed(6)).toString();
function reliabilityQ(id, a, b, parallel) {
  const series = a * b,
    failed = (1 - a) * (1 - b),
    combined = 1 - failed;
  return Q(
    id,
    `同一任务时段内两个部件独立，可靠度为${a}和${b}。${parallel ? "任意一个正常系统就正常" : "两个都正常系统才正常"}，系统可靠度是多少？`,
    fmt(parallel ? combined : series),
    parallel
      ? `先算全失效概率(1−${a})(1−${b})=${fmt(failed)}，取补得到${fmt(combined)}。`
      : `系统需两者都正常，独立时R=${a}×${b}=${fmt(series)}。`,
    [
      W(
        fmt(parallel ? series : combined),
        "reliability-wrong-structure",
        "用错了系统正常条件",
        parallel
          ? "相乘得到的是都正常的概率；并联只要求至少一个正常。"
          : "取全失效概率的补适用于至少一个正常的并联模型，本题要求两个都正常。",
        "先把系统正常写成“都”还是“至少一个”。",
      ),
      W(
        fmt(failed),
        "reliability-failure-as-success",
        "把全失效概率当成可靠度",
        "(1−R1)(1−R2)表示两个都失效，不是系统正常概率。",
        "可靠度描述正常工作，把失败事件与正常事件分开。",
      ),
      W(
        fmt(parallel ? a + b : (a + b) / 2),
        "reliability-add-average",
        "直接加和或平均不能表示当前事件",
        parallel
          ? "可靠度相加会重复计算两者都正常，甚至可能超过1。"
          : "两个都正常是联合事件，不能用平均值代替。",
        "按逻辑事件计算，再检查结果在0到1之间。",
      ),
    ],
  );
}
function availabilityQ(id, up, down) {
  const a = up / (up + down);
  return Q(
    id,
    `统计期内正常可用${up}小时，停机${down}小时。统计可用率是多少？`,
    fmt(a * 100) + "%",
    `可用率=${up}/(${up}+${down})=${fmt(a * 100)}%。分母包含正常与停机的全部时间。`,
    [
      W(
        fmt((down / (up + down)) * 100) + "%",
        "availability-down-as-up",
        "求成了停机比例",
        "停机时间占总时间是不可用率，需要取可用时间比例。",
        "分子用正常可用时间。",
      ),
      W(
        fmt((up / down) * 100) + "%",
        "availability-wrong-denominator",
        "分母用了停机时间",
        "可用率分母为总观察时长，不是只取停机时间；比例不能超过100%。",
        "分母先求正常加停机。",
      ),
      W(
        "100%",
        "availability-ignore-downtime",
        "统计时遗漏了停机",
        "只要统计期有停机，观测可用率就不等于100%。",
        "把维护或故障停机按题设计入分母。",
      ),
    ],
  );
}
export const reliability = pack(
  "network-engineer:01.03.04",
  "系统可靠性与可用性",
  [
    {
      id: "reliability-series",
      title: "串联与独立性前提",
      foundation:
        "这里的串联是可靠性逻辑：任一必需部件失效就导致系统失效，不一定描述物理接线。",
      takeaway:
        "相同任务时段、各部件独立且全部必需时，串联系统可靠度为各可靠度乘积。",
      cards: [
        E("reliability-series-explain", "先画出成功条件", [
          "某服务必须同时依赖模块A和B。若在同一任务时段内A、B独立，可靠度0.97和0.98，则系统可靠度0.97×0.98=0.9506。",
          "依赖同一电源、网络或环境的部件可能存在相关失效，不能仅凭边际可靠度无条件相乘。计算前先检查任务时段、独立性和成功条件。",
        ]),
      ],
      questions: [
        reliabilityQ("reliability-series-check", 0.95, 0.9, false),
        reliabilityQ("reliability-series-v1", 0.8, 0.85, false),
        Q(
          "reliability-series-v2",
          "两个必需模块共享同一故障电源，仅给各模块边际可靠度，能否无条件用乘积求系统可靠度？",
          "不能，需检查相关失效与联合概率",
          "串联乘积公式要求独立；共享失效原因可能破坏这一前提。",
          [
            W(
              "能，只要模块数量是2就独立",
              "reliability-count-independent",
              "部件数量不能证明独立",
              "独立性来自失效模型，不来自部件数。",
              "检查是否存在共同失效原因。",
            ),
            W(
              "必须相加，这样可以消除共同故障",
              "reliability-add-fix",
              "换个算术运算不能消除共同原因",
              "相加不表示两者都正常，也不能改造物理系统的共同故障。",
              "先建立联合模型而非换公式。",
            ),
            W(
              "共享电源证明系统可靠度恒为1",
              "reliability-shared-perfect",
              "共享资源不等于完美可靠",
              "电源失效反而可能同时影响多个模块。",
              "识别公共依赖的失效风险。",
            ),
          ],
        ),
      ],
    },
    {
      id: "reliability-parallel",
      title: "并联冗余与共同故障",
      foundation:
        "本段假设两个部件均能独立承载任务，任一个正常即可成功，切换/共享设施不额外引入失败。",
      takeaway:
        "独立并联模型R=1−(1−R1)(1−R2)；先算全失效再取补。共同依赖需单独计入。",
      cards: [
        E("reliability-parallel-explain", "只要有一个正常，用补事件更方便", [
          "例如两独立单元可靠度0.7与0.6，全失效概率0.3×0.4=0.12，所以至少一个正常概率0.88。",
          "如果两个单元共用一个必需控制器，控制器本身也是依赖；冗余单元的公式不能抹去公共依赖。备用切换的失败概率也需按系统模型考虑。",
        ]),
      ],
      questions: [
        reliabilityQ("reliability-parallel-check", 0.9, 0.85, true),
        reliabilityQ("reliability-parallel-v1", 0.8, 0.7, true),
        Q(
          "reliability-parallel-v2",
          "两个后端独立并联，任一个即可工作，但前端必需控制器一旦失效整个服务停止。哪项合理？",
          "仍需计入控制器这个公共依赖的可靠性",
          "后端冗余不能消除前端单点依赖，系统成功还要求控制器正常。",
          [
            W(
              "后端并联就不必考虑任何公共设备",
              "reliability-ignore-common",
              "冗余没有覆盖公共单点",
              "控制器停止时后端再健康也无法完成服务。",
              "把所有必需依赖列出来。",
            ),
            W(
              "再复制一条公式就能自动恢复控制器",
              "reliability-formula-repair",
              "公式不是故障修复动作",
              "数学计算描述系统，不会改变控制器的失效。",
              "区分模型与实际冗余设计。",
            ),
            W(
              "两个后端可靠度直接相加即可得到全系统可靠度",
              "reliability-sum-total",
              "既重复计数又漏掉控制器",
              "并联事件不是简单相加，全系统还包含公共依赖。",
              "先求后端成功，再结合必需控制器。",
            ),
          ],
        ),
      ],
    },
    {
      id: "reliability-availability",
      title: "可用时间比例与修复",
      foundation:
        "可靠度通常关注指定时段内无故障成功的概率；可用率关注观察或稳态过程中能提供服务的时间比例，两者不同。",
      takeaway:
        "观测可用率=正常时间/(正常+停机时间)；缩短修复可提高可用率，不等于证明故障发生概率降低。",
      cards: [
        E("reliability-availability-explain", "会出故障也可以很快恢复", [
          "统计期内可用490小时、停机10小时，可用率490/500=98%。不要把10/500的2%停机比例当可用率。",
          "若故障发生频率不变但修复更快，停机时间可以减少、可用率提高。这不能单独证明指定任务时段内的无故障可靠度变高。",
        ]),
      ],
      questions: [
        availabilityQ("reliability-availability-check", 198, 2),
        availabilityQ("reliability-availability-v1", 72, 8),
        Q(
          "reliability-availability-v2",
          "故障发生规律保持不变，但每次修复停机时间明显缩短。最直接改善了什么？",
          "服务可用率，而不能据此断言无故障可靠度提高",
          "停机缩短增加可用时间比例；故障发生规律未变，不代表首次故障更晚。",
          [
            W(
              "可靠度必然变成100%，因为能修复",
              "repair-perfect-reliability",
              "能修复不代表从不失效",
              "修复发生在失效之后，不能抹去失效事件。",
              "分开故障发生与故障修复。",
            ),
            W(
              "可用率一定降低，因为修复更快",
              "repair-availability-reverse",
              "修复时间的方向反了",
              "其他条件相同，停机缩短通常提高可用时间比例。",
              "看正常与停机时间的分母组成。",
            ),
            W(
              "可靠度和可用率永远是同一数值",
              "reliability-availability-same",
              "把两个不同定义合在一起",
              "一个关注指定任务无失效概率，另一个关注可服务时间比例。",
              "先写指标定义再判断变化。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    { title: "考匠已审核课程 · 可靠性", path: "network-engineer:01.03.04" },
    {
      title: "NIST · 串联系统条件",
      url: "https://www.itl.nist.gov/div898/handbook/apr/section1/apr182.htm",
    },
    {
      title: "NIST · 并联冗余条件",
      url: "https://www.itl.nist.gov/div898/handbook/apr/section1/apr183.htm",
    },
  ],
  "b1acd8403fc6a1df3cb8",
);

export const san = pack(
  "network-engineer:01.03.05",
  "NAS、SAN与存储网络",
  [
    {
      id: "san-granularity",
      title: "文件访问与块访问",
      foundation:
        "文件接口直接提供路径、目录和文件操作；块接口提供编号块或卷，文件系统通常由主机或其他服务层组织。",
      takeaway:
        "NAS常用SMB/NFS提供文件服务；SAN提供块访问。连接在网络上不意味着一定是文件服务。",
      cards: [
        T("san-granularity-table", "先看主机看到什么", [
          ["NAS", "共享目录与文件，典型协议SMB/NFS"],
          ["SAN", "块设备或LUN，主机在其上组织数据"],
        ]),
        E("san-granularity-explain", "文件共享和远程磁盘是不同接口", [
          "客户端通过共享路径打开文件，通常是在使用NAS文件服务。主机看到远程块卷时，则在使用块存储接口。",
          "同一存储设备可以同时提供不同服务，分类要看实际访问接口，不是只看设备品牌、盘数量或是否连接以太网。",
        ]),
      ],
      questions: [
        Q(
          "san-granularity-check",
          "客户端通过SMB共享路径直接打开远端目录中的文件，最符合哪种访问方式？",
          "NAS文件级访问",
          "SMB提供文件共享，客户端操作目录和文件。",
          [
            W(
              "SAN块级访问，因为用了网络",
              "san-network-is-block",
              "把网络连接当块接口",
              "网络可承载文件与块服务，SMB路径才是当前关键。",
              "看请求是文件操作还是编号块读写。",
            ),
            W(
              "直接本地块访问，因为SMB是SCSI命令的别名",
              "san-smb-as-scsi",
              "把文件协议与块命令混淆",
              "SMB提供共享文件操作，不能将其当成SCSI块命令的别名。",
              "区分路径操作与逻辑块读写。",
            ),
            W(
              "RAID级别决定它不能是NAS",
              "san-raid-determines-interface",
              "用盘冗余方式决定访问粒度",
              "RAID可用于不同存储服务，不能代替文件/块接口判断。",
              "阵列组织与对外接口分开。",
            ),
          ],
        ),
        Q(
          "san-granularity-v1",
          "服务器从存储网络获得一个LUN，作为块设备交给本机文件系统。哪项正确？",
          "主机使用块级存储接口",
          "LUN提供编号块，文件系统在其上组织目录和文件。",
          [
            W(
              "一定是NAS，因为文件系统最终会出现文件",
              "san-filesystem-is-nas",
              "把主机文件系统与远端文件服务混淆",
              "块设备上可以由主机建立文件系统，仍是块访问。",
              "判断接口提供者返回块还是文件。",
            ),
            W(
              "LUN就是一个SMB目录名字",
              "san-lun-as-share",
              "混淆块卷与共享路径",
              "LUN表示逻辑单元，不等同于SMB共享目录。",
              "区分逻辑块设备与文件路径。",
            ),
            W(
              "既然是远端设备，就无需任何数据组织",
              "san-block-no-filesystem",
              "忽略了块上层的数据组织",
              "块接口不自动替主机组织通用文件目录，需要相应软件层。",
              "块访问与文件系统职责分开。",
            ),
          ],
        ),
        Q(
          "san-granularity-v2",
          "一台统一存储设备同时提供NFS共享和iSCSI卷，怎样分类使用方式？",
          "NFS请求是文件访问，iSCSI卷是块访问",
          "一台设备可提供多种接口，应按当前协议和访问粒度分类。",
          [
            W(
              "整个设备只能选NAS或SAN中的一种，所有请求都一样",
              "san-device-one-mode",
              "把设备名称当成唯一服务类型",
              "统一存储可同时提供文件和块服务。",
              "按每种接口实际提供的能力判断。",
            ),
            W(
              "两者都必然是文件访问，因为都经过以太网",
              "san-ethernet-is-file",
              "传输网络不能决定访问粒度",
              "iSCSI可在IP网络上承载块命令。",
              "网络承载与数据接口分开。",
            ),
            W(
              "NFS是块协议，iSCSI是文件协议",
              "san-protocol-reversed",
              "把协议的粒度颠倒了",
              "NFS提供文件服务，iSCSI承载SCSI块命令。",
              "分别记住协议服务的对象。",
            ),
          ],
        ),
      ],
    },
    {
      id: "san-transport",
      title: "FC、iSCSI与主机连接",
      foundation:
        "块存储可有多种传输。FC SAN常用FC HBA；iSCSI用IP网络上的发起器和目标，软件发起器可经普通以太网接口通信。",
      takeaway:
        "FC与IP是传输选择，iSCSI在TCP/IP上承载SCSI；使用以太网不等于NAS，也不能说所有SAN都要求FC HBA。",
      cards: [
        E("san-transport-explain", "先辨协议，再看适配器", [
          "FC SAN中，主机常通过FC HBA与交换网络或目标连接。iSCSI将SCSI命令封装到TCP/IP通信中，主机可用软件发起器配以太网接口。",
          "因此不能把“SAN只能FC”或“所有SAN都需要FC HBA”当通用结论。性能取决于具体网络、存储、队列、负载和部署设计。",
        ]),
      ],
      questions: [
        Q(
          "san-transport-check",
          "服务器用软件iSCSI发起器经以太网访问远端卷，哪项正确？",
          "在TCP/IP上承载块存储命令",
          "iSCSI传输SCSI命令与数据，向主机提供块访问。",
          [
            W(
              "一定是在执行SMB文件操作",
              "iscsi-as-smb",
              "混淆了iSCSI与文件共享",
              "以太网并不意味着SMB；当前协议是iSCSI。",
              "从协议而非网线分类。",
            ),
            W(
              "iSCSI不能使用TCP/IP",
              "iscsi-no-ip",
              "忽略了iSCSI的IP承载",
              "iSCSI就是在IP网络上实现SCSI通信的方式。",
              "记住iSCSI的传输栈。",
            ),
            W(
              "必须给每个磁盘块分配一个文件路径",
              "iscsi-block-as-path",
              "把块地址变成了文件路径",
              "块接口使用逻辑块命令，不要求每块有文件路径。",
              "路径属于文件服务层。",
            ),
          ],
        ),
        Q(
          "san-transport-v1",
          "主机接入FC存储网络，常用哪类适配器？",
          "FC HBA",
          "FC HBA提供主机到FC网络的接口。",
          [
            W(
              "不支持FC的普通以太网NIC可直接接入FC fabric",
              "fc-nic-as-hba",
              "把IP接口直接当FC接口",
              "本题是FC网络，普通以太网NIC不直接实现FC主机协议；iSCSI是另一种承载。",
              "先确认存储网络协议，再选适配器。",
            ),
            W(
              "仅安装NFS客户端就能替代FC主机适配接口",
              "fc-nfs-as-hba",
              "把文件客户端当FC连接",
              "NFS软件使用文件服务协议，不替代FC主机连接接口。",
              "软件协议与硬件连接分别检查。",
            ),
            W(
              "普通SATA控制器无需额外接口即可直接接FC交换网络",
              "fc-sata-as-hba",
              "把本地磁盘接口当FC网络接口",
              "SATA控制器面向本地磁盘连接，不自动具备FC网络主机通信能力。",
              "区分本地盘连接与存储网络接入。",
            ),
          ],
        ),
        Q(
          "san-transport-v2",
          "关于SAN，哪项能成立而不过度概括？",
          "既可采用FC，也可采用iSCSI等IP块存储方案",
          "SAN强调块存储网络，传输方案并非仅一种。",
          [
            W(
              "任何SAN都只能使用FC，不能有IP",
              "san-fc-only",
              "把典型方案当唯一方案",
              "iSCSI等方案可以经IP承载块存储。",
              "存储粒度与网络协议分开。",
            ),
            W(
              "IP块存储必须更慢，任何型号都例外不了",
              "san-universal-performance",
              "只凭协议断言所有实际性能",
              "带宽、负载、设备、延迟和设计都会影响性能。",
              "结合实际条件与测量评估。",
            ),
            W(
              "普通网卡存在就证明服务器在用NAS",
              "san-nic-is-nas",
              "硬件接口不能单独决定服务",
              "网卡也可承载iSCSI块服务和其他通信。",
              "按实际协议与访问粒度判断。",
            ),
          ],
        ),
      ],
    },
    {
      id: "san-choice",
      title: "按需求选型与共享协调",
      foundation:
        "文件协作关注共享目录、权限与文件操作；块卷需求关注主机侧数据组织、延迟和一致性。技术名字不是完整需求分析。",
      takeaway:
        "直接文件共享常用NAS；需要块卷可用SAN。多主机同时写同一块卷需支持并发一致性的设计，不能随意共挂普通文件系统。",
      cards: [
        E("san-choice-explain", "共享块不自动等于安全共享文件", [
          "部门需要多人协作访问共享目录，NAS的文件服务是直接匹配的接口。应用要求主机管理块卷，则可选择满足条件的SAN方案。",
          "把同一个块LUN交给多台主机，不能保证它们会自动协调元数据。并发写入需要合适的集群文件系统、数据库协调或其他明确的一致性机制。",
        ]),
      ],
      questions: [
        Q(
          "san-choice-check",
          "部门员工需要直接通过共享目录协作编辑文件，并统一文件权限。哪种接口最直接匹配？",
          "NAS文件共享服务",
          "需求直接描述目录、文件和权限，匹配文件服务接口。",
          [
            W(
              "只把裸块LUN暴露给所有员工就自动有文件权限",
              "san-raw-fileshare",
              "块设备不自动提供文件服务",
              "文件目录、并发访问和权限需要上层组织。",
              "选择需求需要的服务接口。",
            ),
            W(
              "每位员工分别格式化同一裸LUN，就自动得到安全共享目录",
              "san-format-share",
              "独立格式化不建立并发协调",
              "同一裸块设备不是自动协调的共享文件服务，独立格式化还可能覆盖已有组织。",
              "文件共享需要统一服务或支持并发的一致性设计。",
            ),
            W(
              "只提供块映射就会自动出现SMB/NFS服务，无需文件服务层",
              "san-block-auto-file",
              "块映射不自动生成文件服务",
              "块接口本身不提供共享目录、文件权限和SMB/NFS请求处理。",
              "看需求需要的接口由哪一层提供。",
            ),
          ],
        ),
        Q(
          "san-choice-v1",
          "两台主机要同时写同一个SAN LUN，哪项判断合理？",
          "需要支持并发一致性的上层设计，不能默认普通文件系统共挂就安全",
          "SAN提供共享块访问，并不自动协调多个主机的文件系统元数据。",
          [
            W(
              "任何普通本地文件系统共挂都一定安全",
              "san-shared-fs-safe",
              "忽略了跨主机的一致性",
              "没有协调的并发元数据更新可能相互破坏。",
              "确认文件系统与应用支持该并发模式。",
            ),
            W(
              "FC HBA自动提供全部文件锁与目录权限",
              "san-hba-locks",
              "把传输适配器当文件服务",
              "HBA传输块通信，不自动实现通用文件权限和跨主机锁。",
              "明确每一层的职责。",
            ),
            W(
              "只要卷容量够，元数据冲突就不会发生",
              "san-size-consistency",
              "容量不是一致性机制",
              "即使空间充足，多个主机仍可能互相覆盖状态。",
              "分开容量约束与协调机制。",
            ),
          ],
        ),
        Q(
          "san-choice-v2",
          "一个数据库明确要求主机获得块卷。只有“NAS/SAN”的名字，能否保证任一SAN方案都满足延迟与恢复要求？",
          "不能，块接口匹配之后还需验证性能与恢复设计",
          "接口粒度只是一个条件，还需评估负载、网络、冗余、备份及服务指标。",
          [
            W(
              "能，只要叫SAN就满足任何性能要求",
              "san-name-guarantees",
              "把分类名称当性能承诺",
              "不同方案设备和部署条件不同，名字不能保证服务指标。",
              "以实际负载和需求验证。",
            ),
            W(
              "必须选NAS，因为所有数据库只允许文件服务",
              "san-database-only-nas",
              "把具体块卷需求忽略了",
              "题设明确要求块卷，不能把所有数据库概括成只接受文件接口。",
              "按当前应用明确要求选择。",
            ),
            W(
              "越贵越能证明历史恢复一定成功",
              "san-price-recovery",
              "采购价格不是恢复验证",
              "恢复能力取决于备份、流程与验证结果，不能只凭价格。",
              "验证所需恢复点与恢复流程。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    { title: "考匠已审核课程 · 存储网络", path: "network-engineer:01.03.05" },
    {
      title: "IBM · 文件与块存储接口",
      url: "https://www.ibm.com/think/topics/san-vs-nas",
    },
    {
      title: "IBM · SAN协议与主机连接",
      url: "https://www.ibm.com/think/topics/storage-area-network",
    },
  ],
  "100d7b2973713f1c0db4",
);
