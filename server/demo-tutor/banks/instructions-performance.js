import { E, K, T, question as Q, pack } from "../authoring.js";
const W = (text, type, title, reason, hint) => [
  text,
  type,
  title,
  reason,
  hint,
];
const own = (id) => ({ title: "考匠已审核课程 · 指令与性能", path: id });
const types = {
  立即寻址: "操作数值直接包含在指令中。",
  直接寻址: "指令直接给出操作数的内存地址。",
  间接寻址: "指令给出一个内存位置，先从该位置取出操作数地址。",
  寄存器寻址: "指令指定寄存器，寄存器中就是操作数值。",
  寄存器间接寻址: "指令指定寄存器，寄存器里保存的是操作数的内存地址。",
};
function addressingQ(id, prompt, type, wrong) {
  return Q(
    id,
    prompt,
    type,
    types[type],
    wrong.map((t) =>
      W(
        t,
        "addressing-as-" +
          {
            立即寻址: "immediate",
            直接寻址: "direct",
            间接寻址: "indirect",
            寄存器寻址: "register",
            寄存器间接寻址: "register-indirect",
          }[t],
        `误判为${t}`,
        `${types[t]}题设当前条件是${types[type]}`,
        "先标出指令字段是值、内存地址还是寄存器号，再检查是否还需一次间接读取。",
      ),
    ),
  );
}
export const instructions = pack(
  "network-engineer:01.04.03",
  "指令系统、寻址与中断",
  [
    {
      id: "isa-models",
      title: "RISC、CISC与架构约定",
      foundation:
        "RISC/CISC描述设计思路与典型特征，不是对所有架构、扩展或实现的绝对保证。本段普通算术采用经典Load/Store模型，不外推原子等扩展操作。",
      takeaway:
        "经典Load/Store算术主要用寄存器/立即数，内存数据先加载；指令长度看具体ISA，性能看工作负载与实现。",
      cards: [
        T("isa-models-table", "典型特征与范围", [
          ["经典RISC教学模型", "较规则的编码、简单寻址、Load/Store结构"],
          ["典型CISC设计", "丰富寻址和可完成复杂操作的指令"],
          ["实际ISA扩展", "不能仅由标签断言每条长度或程序速度"],
        ]),
        E("isa-models-explain", "不要把“典型”改成“全部必须”", [
          "RV32I基本整数指令采用32位编码，但启用RISC-V C扩展后可混合16位压缩指令和32位指令。寄存器宽度也不直接决定指令长度。",
          "经典Load/Store普通算术用寄存器或立即数，内存操作数先加载；实际指令扩展与微架构需要看规范。复杂指令或较少指令数不保证整个程序更快。",
        ]),
      ],
      questions: [
        Q(
          "isa-models-check",
          "经典Load/Store模型中，普通算术如何使用内存中的数据？",
          "先加载到寄存器，再以寄存器或立即数参与普通算术",
          "普通算术与显式内存加载/存储分开。",
          [
            W(
              "每条普通算术都必须直接同时读写任意内存地址",
              "isa-all-memory",
              "把Load/Store结构说反了",
              "经典模型将普通算术与显式内存访问分开。",
              "先加载需要的数据，再做算术。",
            ),
            W(
              "加载指令不能访问内存，只能改变指令长度",
              "isa-load-no-memory",
              "忽略了load的取数职责",
              "加载操作从内存取数据到寄存器，不是仅修改编码长度。",
              "按操作功能理解Load/Store。",
            ),
            W(
              "任何RISC扩展都不可能有原子内存操作",
              "isa-extension-universal",
              "把基础模型外推到所有扩展",
              "原子等扩展需按ISA规范考虑，本段限定普通算术模型。",
              "先看指令属于基础还是扩展。",
            ),
          ],
        ),
        Q(
          "isa-models-v1",
          "一个RISC-V实现启用了C压缩扩展，哪项正确？",
          "可以混合16位压缩编码与32位指令，RISC标签不要求全部定长",
          "C扩展提供常用指令的16位编码，可以与32位指令混合。",
          [
            W(
              "RISC必须所有指令永远32位，启用C也不改变",
              "isa-risc-always-fixed",
              "把基础编码当所有扩展的规则",
              "不含C的基本编码与启用压缩扩展的指令流条件不同。",
              "看具体ISA扩展集合。",
            ),
            W(
              "寄存器64位就能证明每条指令都是64位",
              "isa-register-instruction-width",
              "寄存器宽度与指令编码长度不同",
              "XLEN描述寄存器/整数宽度，不等于每条机器指令长度。",
              "把数据宽度和编码长度分开。",
            ),
            W(
              "16位压缩指令只能存16位大小的整个程序",
              "isa-instruction-program-size",
              "把一条编码长度当程序总大小",
              "程序可由许多不同长度指令组成。",
              "分清单条指令与整个程序。",
            ),
          ],
        ),
        Q(
          "isa-models-v2",
          "某CISC程序用了较少机器指令，能否仅凭这一点断言它比任意RISC实现更快？",
          "不能，还需比较平均CPI、频率、实际指令数和实现条件",
          "指令数量只是执行时间的一项，不能独立决定跨实现性能。",
          [
            W(
              "能，指令少就证明每条指令耗时也更短",
              "isa-count-is-time",
              "数量不能推出每条耗时",
              "复杂指令可能需要更多周期，需综合计算。",
              "比较完成相同工作的总执行时间。",
            ),
            W(
              "能，因为CISC绝不可能采用流水线",
              "isa-cisc-no-pipeline",
              "架构标签不禁止流水实现",
              "现代实现可以流水化，不能由标签推断没有流水。",
              "区分ISA与微架构。",
            ),
            W(
              "不能比较任何性能，只能看指令名称",
              "isa-no-measurement",
              "可用任务时间与指标评估",
              "不能用单一指标下结论，不意味着无法通过测量比较。",
              "用相同任务和明确指标评估。",
            ),
          ],
        ),
      ],
    },
    {
      id: "addressing-values",
      title: "立即、直接与间接寻址",
      foundation:
        "指令字段看起来都是数字，但可能是操作数值，也可能是地址。间接寻址还需要一次读取来获得真正地址。",
      takeaway:
        "立即给值，直接给操作数地址，间接先从指定内存位置取地址；不要只凭数字外观分类。",
      cards: [
        T("addressing-values-table", "先标字段意义", [
          ["字段就是常量9", "立即寻址"],
          ["字段是保存操作数的地址1000", "直接寻址"],
          ["字段是保存操作数地址的位置500", "内存间接寻址"],
        ]),
      ],
      questions: [
        addressingQ(
          "addressing-values-check",
          "操作数常量7直接编码在指令中，是什么寻址方式？",
          "立即寻址",
          ["直接寻址", "间接寻址", "寄存器寻址"],
        ),
        addressingQ(
          "addressing-values-v1",
          "指令直接给出内存地址2048，该地址保存着所需操作数，是什么寻址方式？",
          "直接寻址",
          ["立即寻址", "间接寻址", "寄存器间接寻址"],
        ),
        addressingQ(
          "addressing-values-v2",
          "指令字段给出内存位置500，先读出其中保存的地址1000，再去1000取操作数，是什么方式？",
          "间接寻址",
          ["直接寻址", "立即寻址", "寄存器间接寻址"],
        ),
      ],
    },
    {
      id: "addressing-registers",
      title: "寄存器值还是寄存器中的地址",
      foundation:
        "寄存器号标识存哪一个寄存器。寄存器内容可以直接是值，也可以作为进一步访问内存的地址。",
      takeaway:
        "直接使用寄存器内容是寄存器寻址；把其内容当内存地址再取数是寄存器间接寻址。",
      cards: [
        E("addressing-registers-explain", "多一步取内存，含义就不同", [
          "R3中保存数值12，直接用12参与计算，是寄存器寻址。",
          "R3中保存内存地址3000，要读取M[3000]作为操作数，是寄存器间接寻址。不要把寄存器编号3、内容3000、目标内存内容混作一个值。",
        ]),
      ],
      questions: [
        addressingQ(
          "addressing-registers-check",
          "指令指定R1，并直接使用R1中存放的数值42作为操作数，是什么方式？",
          "寄存器寻址",
          ["寄存器间接寻址", "立即寻址", "直接寻址"],
        ),
        addressingQ(
          "addressing-registers-v1",
          "指令指定R1，其内容4096是地址，实际操作数从M[4096]取出，是什么方式？",
          "寄存器间接寻址",
          ["寄存器寻址", "直接寻址", "间接寻址"],
        ),
        Q(
          "addressing-registers-v2",
          "R2=2048，M[2048]=37。使用R2进行寄存器间接寻址取得的操作数是什么？",
          "37",
          "R2提供地址2048，真正操作数是该地址内存中的37。",
          [
            W(
              "2048",
              "register-pointer-as-value",
              "把指针当操作数",
              "2048是地址，间接模式还需读取该地址的内容。",
              "多执行一步M[寄存器内容]。",
            ),
            W(
              "2",
              "register-id-as-value",
              "把寄存器编号当值",
              "R2的2是寄存器标识，不是本题操作数。",
              "分别标注寄存器号、寄存器内容和内存内容。",
            ),
            W(
              "0，因为间接寻址必然清零",
              "register-indirect-zero",
              "间接寻址不修改原值",
              "题目已给M[2048]=37，取数不会因为是间接模式就改成0。",
              "按给定映射读数，不增加未定义动作。",
            ),
          ],
        ),
      ],
    },
    {
      id: "interrupt-context",
      title: "中断入口与上下文恢复",
      foundation:
        "本段采用典型向量中断教学模型。编号对应处理入口；实际架构可用地址表、基址加偏移或跳转表等机制，需看具体规范。",
      takeaway:
        "处理中断需保存必要上下文并按规则返回；向量机制定位处理入口。中断不只用于程序故障，定时器也可正常触发。",
      cards: [
        E("interrupt-context-explain", "处理中断后，原程序如何继续", [
          "收到允许处理的中断时，CPU转入相应服务程序。按架构保存程序计数器、状态和必要寄存器，处理后恢复并返回原执行流程。",
          "典型中断向量表项用于定位服务入口，不是保存完整原程序。定时器、外设等中断可以是正常机制，不必意味着应用出错。",
        ]),
      ],
      questions: [
        Q(
          "interrupt-context-check",
          "典型向量中断模型中，中断向量表的主要作用是什么？",
          "按中断向量定位服务程序入口",
          "向量机制把事件与对应处理入口关联起来。",
          [
            W(
              "替代所有寄存器上下文保存，表项里自动有全部现场",
              "interrupt-vector-context",
              "把入口映射当现场保存",
              "入口映射与上下文保存是不同职责。",
              "分开“去哪里处理”和“原状态是什么”。",
            ),
            W(
              "保存正在执行程序的完整所有指令与文件",
              "interrupt-vector-program",
              "表不是整个应用副本",
              "典型表项指向处理入口，不保存全部程序与文件。",
              "识别表项保存的信息规模与用途。",
            ),
            W(
              "只保存当前CPU主频，因此无法确定服务程序",
              "interrupt-vector-frequency",
              "把性能参数当入口信息",
              "中断向量服务定位不由主频决定。",
              "按事件编号和架构机制定位入口。",
            ),
          ],
        ),
        Q(
          "interrupt-context-v1",
          "中断处理时为什么要按架构保存必要上下文并在返回时恢复？",
          "让原程序按正确状态继续执行",
          "处理程序可能改写寄存器等状态，恢复确保原程序语义正确。",
          [
            W(
              "任何中断都必须永久丢弃原程序",
              "interrupt-discard-program",
              "正常中断通常可返回",
              "处理中断不意味着永久放弃原执行流程。",
              "区别正常服务处理与不可恢复异常。",
            ),
            W(
              "只保存服务程序入口就等于保存原所有寄存器",
              "interrupt-entry-registers",
              "一个入口地址不包含原现场",
              "入口指向哪里执行，不能代替原寄存器等状态。",
              "按实际需要保存的状态处理。",
            ),
            W(
              "上下文恢复的目的是修改已存储的应用文件",
              "interrupt-context-files",
              "把CPU执行现场当文件修改",
              "上下文恢复用于正确续执行，不是任意修改持久文件。",
              "关注执行状态而非文件历史。",
            ),
          ],
        ),
        Q(
          "interrupt-context-v2",
          "操作系统正常使用定时器中断安排管理工作，能否据此断言应用一定发生故障？",
          "不能，中断也可以是正常的定时或外设事件",
          "定时器是正常中断来源之一，单凭中断不能推断应用错误。",
          [
            W(
              "能，所有中断只为应用故障而存在",
              "interrupt-only-failure",
              "忽略了正常事件来源",
              "定时与设备服务都可使用正常中断。",
              "先看中断来源及处理语义。",
            ),
            W(
              "能，只要中断号非0就意味着不可恢复错误",
              "interrupt-number-error",
              "中断编号不等于错误严重程度",
              "向量编号用于定位处理，不能按非0就判断应用崩溃。",
              "查架构和系统约定而不是猜编号含义。",
            ),
            W(
              "不能，所以任何中断都不需保存状态",
              "interrupt-normal-no-save",
              "正常事件同样可能改写现场",
              "是否需要保存由架构和处理过程决定，不由“正常事件”取消。",
              "正常处理也需保持原程序正确性。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    own("network-engineer:01.04.03"),
    {
      title: "RISC-V · 指令编码与压缩扩展",
      url: "https://docs.riscv.org/reference/isa/v20240411/unpriv/intro.html",
    },
  ],
  "f94236b81ba1d0a26d2b",
);

const fmt = (n) => Number(n.toFixed(6)).toString();
function timeQ(id, millions, cpi, ghz) {
  const ms = (millions * cpi) / ghz;
  return Q(
    id,
    `程序执行${millions}百万条指令，平均CPI=${cpi}，固定主频${ghz}GHz。忽略其他影响，CPU执行时间是多少ms？`,
    fmt(ms) + "ms",
    `时间=指令数×CPI/频率=${millions}×10^6×${cpi}/(${ghz}×10^9)秒=${fmt(ms)}ms。`,
    [
      W(
        fmt(millions / ghz) + "ms",
        "performance-cpi-omitted",
        "漏掉了每条指令的周期数",
        "主频是每秒周期，不是每秒指令；需乘平均CPI。",
        "先求总周期=指令数×CPI。",
      ),
      W(
        fmt(millions / (cpi * ghz)) + "ms",
        "performance-cpi-inverse",
        "把CPI放到了分母",
        "CPI增加表示相同指令数需要更多周期，不应缩短时间。",
        "平均每条需要多少周期，就乘多少。",
      ),
      W(
        fmt(ms * 1000) + "ms",
        "performance-seconds-milliseconds",
        "时间前缀换算错了",
        "GHz是每秒十亿周期，ms是千分之一秒，需正确抵消前缀。",
        "先算秒，再乘1000得到ms。",
      ),
    ],
  );
}
function weightedQ(id, proportion, a, b) {
  const avg = proportion * a + (1 - proportion) * b;
  return Q(
    id,
    `动态指令中${proportion * 100}%每条需${a}周期，其余每条需${b}周期。平均CPI是多少？`,
    fmt(avg),
    `按执行次数比例加权：${proportion}×${a}+${fmt(1 - proportion)}×${b}=${fmt(avg)}。`,
    [
      W(
        fmt((a + b) / 2),
        "cpi-unweighted",
        "直接取两类的算术平均",
        "两类执行比例不相等，不能各算一半。",
        "按动态执行比例加权。",
      ),
      W(
        fmt((1 - proportion) * a + proportion * b),
        "cpi-weight-reversed",
        "把两类权重交换了",
        "题设比例对应第一类，不能错乘到第二类。",
        "把每类周期与它的比例放在同一行。",
      ),
      W(
        fmt(a + b),
        "cpi-sum",
        "把每类周期直接相加",
        "每条指令只属于一类，不是每条都执行两类周期之和。",
        "平均值需考虑各类出现频率。",
      ),
    ],
  );
}
export const performance = pack(
  "network-engineer:01.04.04",
  "计算机性能指标",
  [
    {
      id: "performance-time",
      title: "主频、CPI与程序时间",
      foundation:
        "主频表示每秒时钟周期数；CPI表示动态平均每条指令需要多少周期。它们与程序指令数共同决定CPU时间。",
      takeaway:
        "CPU时间=动态指令数×平均CPI÷频率；更高主频不独立保证同一任务更快。",
      cards: [
        E("performance-time-explain", "单位必须一起带入", [
          "例：6百万条指令、平均CPI 2、3GHz，需要12百万周期，耗时12×10^6/(3×10^9)=0.004秒=4ms。",
          "同一程序的实际指令数、CPI、频率都可能随编译、ISA、缓存和实现变化。比较性能最好看完成相同工作需要的时间。",
        ]),
      ],
      questions: [
        timeQ("performance-time-check", 4, 2, 2),
        timeQ("performance-time-v1", 9, 3, 3),
        Q(
          "performance-time-v2",
          "相同动态指令数：A为2GHz、CPI1，B为3GHz、CPI2。其他条件按该模型，谁的CPU时间更短？",
          "A更短",
          "A每条平均0.5ns，B约0.667ns；较高频率不足以抵消B的CPI增加。",
          [
            W(
              "B更短，因为只看3GHz大于2GHz",
              "performance-clock-only",
              "遗漏了CPI",
              "需比较CPI/频率，而不是只比较频率。",
              "将每条指令的平均时间算出来。",
            ),
            W(
              "一定相同，因为指令数相同",
              "performance-count-only",
              "同一指令数不代表同一周期与时间",
              "CPI和每周期时长都影响时间。",
              "总时间包含三个因素。",
            ),
            W(
              "无法进行任何比较，模型没有意义",
              "performance-no-model",
              "题设已给当前模型需要的参数",
              "在指令数相同和给定平均CPI/频率条件下可作模型比较。",
              "按明确模型推算，并保留适用条件。",
            ),
          ],
        ),
      ],
    },
    {
      id: "performance-weighted",
      title: "平均CPI要加权",
      foundation:
        "不同指令类别可能需要不同周期。平均CPI应按实际执行次数比例加权，而不是只看程序文本中有哪些指令名字。",
      takeaway:
        "平均CPI=各类动态比例×该类平均周期的总和；比例必须对应正确类别且总和为1。",
      cards: [
        E("performance-weighted-explain", "使用动态执行比例", [
          "若80%的指令为1周期、20%为4周期，平均CPI=0.8×1+0.2×4=1.6。不是两类周期直接相加，也不是一律平均为2.5。",
          "循环中某类可能执行多次，所以要看动态执行次数，不能仅按源代码或静态指令条目数量加权。",
        ]),
      ],
      questions: [
        weightedQ("performance-weighted-check", 0.7, 1, 3),
        weightedQ("performance-weighted-v1", 0.6, 1, 4),
        weightedQ("performance-weighted-v2", 0.4, 2, 5),
      ],
    },
    {
      id: "performance-metrics",
      title: "MIPS、FLOPS与比较边界",
      foundation:
        "MIPS计每秒百万条机器指令；FLOPS计每秒浮点运算次数。机器指令和浮点运算不是同一计数对象。",
      takeaway:
        "MIPS可由频率/平均CPI换算，GFLOPS是十亿浮点运算/秒；不同程序、ISA或精度的指标不能直接当通用快慢结论。",
      cards: [
        T("performance-metrics-table", "先看统计对象", [
          ["MIPS", "每秒百万条机器指令"],
          ["FLOPS", "每秒浮点运算次数"],
          ["GFLOPS", "每秒十亿次浮点运算"],
        ]),
        E("performance-metrics-explain", "高数值可能不是更短任务时间", [
          "固定频率和平均CPI模型中，MIPS=主频MHz/平均CPI。比如1.5GHz、CPI3得到500MIPS。",
          "不同ISA的指令做的工作量可能不同，浮点指标还要核对精度、运算计数约定与负载。不能把两种指标单位当相同，也不能只凭一个峰值替代实际任务时间。",
        ]),
      ],
      questions: [
        Q(
          "performance-metrics-check",
          "固定3GHz、平均CPI3，按该模型每秒机器指令率是多少MIPS？",
          "1000MIPS",
          "3GHz=3000MHz，3000/3=1000MIPS。",
          [
            W(
              "3000MIPS",
              "mips-cpi-ignored",
              "频率不是每秒指令数",
              "每条平均3周期，需把每秒周期数除3。",
              "区分周期与指令。",
            ),
            W(
              "9000MIPS",
              "mips-cpi-multiply",
              "CPI方向算反了",
              "每条周期越多，在同一频率下指令率越低。",
              "MIPS=频率MHz/CPI。",
            ),
            W(
              "0.001MIPS",
              "mips-ghz-prefix",
              "没有正确换算GHz与百万单位",
              "GHz是十亿周期/秒，MIPS是百万指令/秒。",
              "用基本单位计算后再除10^6。",
            ),
          ],
        ),
        Q(
          "performance-metrics-v1",
          "按约定统计每秒2.5×10^9次浮点运算，对应多少GFLOPS？",
          "2.5GFLOPS",
          "1GFLOPS=10^9次浮点运算/秒，因此是2.5。",
          [
            W(
              "2500GFLOPS",
              "flops-mega-giga",
              "把MFLOPS的数值写成GFLOPS",
              "2500是MFLOPS数值；转换为GFLOPS需再除1000。",
              "每个前缀相差1000倍。",
            ),
            W(
              "2.5MIPS",
              "flops-as-instructions",
              "把浮点运算次数当机器指令数",
              "一次机器指令与浮点运算计数不是可无条件等同的对象。",
              "核对统计的是指令还是运算。",
            ),
            W(
              "2.5×10^9GFLOPS",
              "flops-prefix-omitted",
              "重复保留了十亿前缀",
              "GFLOPS这个单位本身已经包含10^9。",
              "数值与单位前缀一起换算。",
            ),
          ],
        ),
        Q(
          "performance-metrics-v2",
          "两台机器只给出不同程序下的MIPS与峰值GFLOPS，能否据此直接确定同一个目标任务谁更快？",
          "不能，应核对目标负载、单位、精度与实际完成时间",
          "指标对象和测试条件不同，需在目标任务与一致条件下评估。",
          [
            W(
              "能，任何指标的数字较大就是通用性能较好",
              "performance-big-number",
              "忽略了统计对象与测试条件",
              "不同单位和工作负载的数字不直接可比。",
              "统一任务和指标定义。",
            ),
            W(
              "能，MIPS和GFLOPS始终一一相等",
              "performance-mips-flops-same",
              "机器指令不等于浮点运算",
              "两者统计对象不同，不能总是换成同一个数。",
              "先读指标全名与单位。",
            ),
            W(
              "不能，因此永远不应测量实际时间",
              "performance-no-timing",
              "无法直接推断恰好需要更多实测",
              "目标任务完成时间是有用评估依据，不应放弃测量。",
              "在一致条件下验证实际性能。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    own("network-engineer:01.04.04"),
    {
      title: "Cornell CS3410 · CPI与执行时间",
      url: "https://www.cs.cornell.edu/courses/cs3410/2025sp/notes/pipelining.html",
    },
  ],
  "977c380a5cfab6d83dd0",
);
