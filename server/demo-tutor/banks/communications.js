import { E, T, question as Q, pack } from "../authoring.js";
const W = (t, k, h, r, i) => [t, k, h, r, i];
const own = (id) => ({ title: "已审核课程快照", path: id });
const qamSource = {
  title: "Cisco · 数字调制与QAM",
  url: "https://www.cisco.com/c/en/us/support/docs/optical-networking/routed-optical-networking/221071-understand-coherent-optical-modulation.html",
};
const rateSource = {
  title: "MIT · 数字通信与信道容量",
  url: "https://ocw.mit.edu/courses/6-451-principles-of-digital-communication-ii-spring-2005/147cf944eeb88d98e97f2d8c76f7fcc9_8HvTaOrTokc.pdf",
};
function bitsQ(id, baud, m) {
  const k = Math.log2(m),
    value = baud * k;
  return Q(
    id,
    `固定长度映射使用${m}种可区分符号，码元速率${baud}Baud。不计编码与协议开销，原始比特速率多少？`,
    `${value} bit/s`,
    `${m}=2^${k}，每码元${k}bit；${baud}×${k}=${value}bit/s。`,
    [
      W(
        `${baud} bit/s`,
        "rate-baud-bit",
        "码元不一定只携带一个比特",
        "Baud表示每秒码元数，需要乘每码元比特数。",
        "先算log₂M。",
      ),
      W(
        `${baud * m} bit/s`,
        "rate-m-not-log",
        "状态数不能直接当比特数",
        "M个状态对应log₂M比特，而不是M比特。",
        "用2^k=M反求k。",
      ),
      W(
        `${value} Byte/s`,
        "rate-bit-byte",
        "题目求的是比特速率",
        "同一数值换成Byte/s会相差8倍。",
        "先检查b与B的单位。",
      ),
    ],
  );
}
function nyquistQ(id, b, m) {
  const k = Math.log2(m),
    rate = 2 * b * k;
  return Q(
    id,
    `理想无噪声低通信道带宽B=${b}Hz，采用${m}种离散符号。按奈奎斯特公式最高比特速率是多少？`,
    `${rate} bit/s`,
    `2B log₂M=2×${b}×${k}=${rate}bit/s。`,
    [
      W(
        `${b * k} bit/s`,
        "capacity-missing-two",
        "遗漏最高码元速率2B",
        "本题理想无噪声低通信道公式包含2B。",
        "先算码元上限再乘每码元比特。",
      ),
      W(
        `${2 * b * m} bit/s`,
        "capacity-states-bits",
        "状态数不等于每码元比特数",
        "每码元信息量是log₂M。",
        "把M写成2的幂。",
      ),
      W(
        `${rate} Byte/s`,
        "capacity-bit-byte",
        "不能直接替换bit与Byte",
        "公式得到bit/s；若换成Byte/s，数值应除8。",
        "同时核对数值和单位。",
      ),
    ],
  );
}
function shannonQ(id, b, snr) {
  const rate = b * Math.log2(1 + snr);
  return Q(
    id,
    `按香农公式，带宽B=${b}Hz，线性功率信噪比S/N=${snr}。理想带限加性白高斯噪声信道容量是多少？`,
    `${rate} bit/s`,
    `${b}×log₂(1+${snr})=${rate}bit/s。`,
    [
      W(
        `${b * snr} bit/s`,
        "shannon-linear-multiply",
        "信噪比在对数中",
        "容量不是B直接乘S/N。",
        "保留log₂(1+S/N)整体。",
      ),
      W(
        `${2 * rate} bit/s`,
        "shannon-nyquist-two",
        "不要混入奈奎斯特的系数2",
        "香农公式是B log₂(1+S/N)。",
        "先确定噪声模型与公式。",
      ),
      W(
        `${rate / 8} bit/s`,
        "shannon-divide-eight",
        "答案仍是bit/s无需除8",
        "除8可换成Byte/s，但必须同时改变单位。",
        "计算单位保持一致。",
      ),
    ],
  );
}
export const capacity = pack(
  "network-engineer:02.02.03",
  "码元速率与信道容量",
  [
    {
      id: "rate-symbols",
      title: "Baud与bit/s",
      foundation:
        "码元速率是每秒符号数，单位Baud。固定长度二进制映射且M=2^k时，每码元携带k比特；编码开销另算。",
      takeaway:
        "原始比特速率=码元速率×log₂M；Baud不等于Byte/s，M是状态数不是每码元比特数。",
      cards: [
        E("rate-symbols-explain", "一个符号有多少种选择？", [
          "8个可区分符号可用3比特标识；1500Baud对应4500bit/s原始速率。若另有纠错或协议开销，有效信息速率需另外计算。",
          "这里限定固定长度M=2^k映射。不要把任意非2的幂状态数直接当成整数个独立比特；实际编码可以有不同映射。",
        ]),
      ],
      questions: [
        bitsQ("rate-symbols-check", 2000, 4),
        bitsQ("rate-symbols-v1", 1000, 16),
        bitsQ("rate-symbols-v2", 3000, 8),
      ],
    },
    {
      id: "rate-nyquist",
      title: "无噪声：奈奎斯特",
      foundation:
        "本段采用理想无噪声低通信道的教材模型，带宽B以Hz表示，最高码元速率2B；M个离散符号得到最高比特速率2B log₂M。",
      takeaway:
        "理想无噪声公式为2B log₂M；Hz、Baud、bit/s各有含义，不能把真实有噪声链路直接套成无噪声。",
      cards: [
        E("rate-nyquist-explain", "先求符号上限，再求比特上限", [
          "例：B=2500Hz、M=4，码元上限5000Baud，每符号2bit，速率上限10000bit/s。",
          "这是限定条件下的理论计算，不是所有设备都能实现的吞吐承诺。有噪声条件还受到信噪比与相关信道容量约束。",
        ]),
      ],
      questions: [
        nyquistQ("rate-nyquist-check", 3000, 4),
        nyquistQ("rate-nyquist-v1", 2000, 8),
        nyquistQ("rate-nyquist-v2", 4000, 16),
      ],
    },
    {
      id: "rate-shannon",
      title: "有噪声：香农与dB",
      foundation:
        "理想带限加性白高斯噪声信道容量C=B log₂(1+S/N)，S/N是线性功率比。若给dB，先按10^(dB/10)换算。容量不是实际应用吞吐量。",
      takeaway:
        "香农公式使用线性功率信噪比；dB先转线性。固定S/N时容量随B线性增长，改变带宽可能也改变噪声功率。",
      cards: [
        E("rate-shannon-explain", "dB数值不能直接代入", [
          "若B=2500Hz、S/N=7，log₂8=3，容量7500bit/s。若功率信噪比为20dB，线性比为100，而不是20。",
          "容量描述理论可达信息速率边界，实际编码、误码目标和协议开销会影响实现。不可以通过无限增加符号状态突破固定带宽与信噪比条件下的容量。",
        ]),
      ],
      questions: [
        shannonQ("rate-shannon-check", 3000, 15),
        shannonQ("rate-shannon-v1", 2000, 31),
        Q(
          "rate-shannon-v2",
          "香农公式题给出功率信噪比20dB，应使用的线性S/N是多少？",
          "100",
          "功率比dB=10log₁₀(S/N)，20dB对应10²=100。",
          [
            W(
              "20",
              "snr-db-direct",
              "不能直接代入dB数值",
              "公式需要线性功率比，不是对数表示。",
              "先做10^(dB/10)。",
            ),
            W(
              "10",
              "snr-amplitude-factor",
              "功率比不是幅度比换算",
              "本题明确功率信噪比，应除10而非20。",
              "先确认是功率比还是幅度比。",
            ),
            W(
              "200",
              "snr-db-linear",
              "dB转换不是乘10",
              "对数表示需指数反变换。",
              "写出换算公式再计算。",
            ),
          ],
        ),
      ],
    },
    {
      id: "rate-effective",
      title: "有效速率与上限区别",
      foundation:
        "原始速率、编码后有效信息速率、应用吞吐和理论容量不是同一个数值。本段假定题设开销比例按发送比特总数计算。",
      takeaway:
        "有效速率要按明确的开销占比计算；不能把标称速率或理论容量当成每个应用必得吞吐。",
      cards: [
        T("rate-effective-table", "先辨认题目问哪个量", [
          ["码元速率", "每秒符号数"],
          ["原始比特速率", "每秒承载的比特数"],
          ["有效信息速率", "扣除题设相应开销"],
          ["理论容量", "限定信道模型下的理论边界"],
        ]),
        E("rate-effective-explain", "先问百分比的分母", [
          "例：发送总比特速率10000bit/s，其中20%发送比特属于开销，有效比特速率8000bit/s。若题目说“开销是有效载荷的20%”，就应除以1.2而不是乘0.8。",
        ]),
      ],
      questions: [
        Q(
          "rate-effective-check",
          "原始速率12000bit/s，开销占发送总比特的25%，有效比特速率多少？",
          "9000 bit/s",
          "12000×(1−0.25)=9000bit/s。",
          [
            W(
              "12000 bit/s",
              "effective-ignore",
              "忽略发送总量中的开销",
              "只有75%的发送比特属于有效信息。",
              "总量乘有效占比。",
            ),
            W(
              "9600 bit/s",
              "effective-wrong-denominator",
              "这对应开销占载荷的25%",
              "本题分母是发送总比特，不是载荷。",
              "先写百分比相对谁。",
            ),
            W(
              "3000 bit/s",
              "effective-overhead-only",
              "这是开销速率",
              "题目求有效部分，不是开销部分。",
              "确认要保留还是扣除。",
            ),
          ],
        ),
        Q(
          "rate-effective-v1",
          "发送总速率12000bit/s，开销比特是有效载荷比特的20%，有效载荷速率多少？",
          "10000 bit/s",
          "总量=载荷×1.2，因此12000/1.2=10000。",
          [
            W(
              "9600 bit/s",
              "effective-payload-percent",
              "20%的分母是有效载荷",
              "不能把它当发送总量的20%。",
              "列总量=载荷+开销。",
            ),
            W(
              "12000 bit/s",
              "effective-no-cost",
              "忽略开销",
              "总量包含载荷与额外比特。",
              "把总量拆成两部分。",
            ),
            W(
              "2400 bit/s",
              "effective-cost-only",
              "错误地把总量乘20%当载荷",
              "这里既非总量占比，也不是要算开销。",
              "先根据题干确定未知量。",
            ),
          ],
        ),
        Q(
          "rate-effective-v2",
          "带宽与线性信噪比固定，单纯无限增加调制状态数，能否让可靠信息速率无限增长？",
          "不能，仍受对应有噪声信道容量等条件限制",
          "无噪声M状态公式不能消除有噪声容量约束。",
          [
            W(
              "能，M越大就必定无限可靠",
              "effective-unbounded",
              "状态更密会更难区分",
              "固定条件下不能忽略噪声限制。",
              "先检查噪声模型。",
            ),
            W(
              "能，容量等于任何应用的实际吞吐",
              "effective-capacity-throughput",
              "理论边界不是应用保证",
              "实际实现和开销也影响吞吐。",
              "区分上限与实测结果。",
            ),
            W(
              "不能，因为每码元永远只能表示一比特",
              "effective-one-bit",
              "多状态确可承载多个比特",
              "限制来自信道条件，不是永远只有两状态。",
              "不要用错误前提解释正确结论。",
            ),
          ],
        ),
      ],
    },
  ],
  [own("network-engineer:02.02.03"), rateSource, qamSource],
  "ad15b478be6250dc9938",
);
function modulation(id, prompt, right, wrong) {
  return Q(id, prompt, right, "数字调制按用于区分符号的载波参数判断。", wrong);
}
const parameterWrong = (right) =>
  [
    ["ASK", "amplitude", "用幅度区分符号"],
    ["FSK", "frequency", "用频率区分符号"],
    ["PSK", "phase", "用相位区分符号"],
    ["QAM", "qam", "联合幅度与相位形成星座点"],
  ]
    .filter(([name]) => name !== right)
    .map(([name, type, reason]) =>
      W(
        name,
        "mod-" + type,
        "核对变化的是哪个载波参数",
        `${name}主要${reason}，与本题给定机制不同。`,
        "先标出幅度、频率和相位中哪些被用于传递符号。",
      ),
    );
function transition(id, prompt) {
  return Q(
    id,
    prompt,
    "每个比特中间都有跳变，便于提取时钟；跳变方向与比特值按约定解释",
    "曼彻斯特编码具有比特中间跳变；不同规范对0/1方向约定可不同。",
    [
      W(
        "长串相同比特始终保持固定电平且没有中间跳变",
        "coding-manchester-nrz",
        "不要套用NRZ特征",
        "曼彻斯特编码每比特中间有跳变。",
        "先看是否有固定的中间时钟边沿。",
      ),
      W(
        "每比特中间跳变方向在所有规范中都绝对相同",
        "coding-convention",
        "0/1方向需要明确约定",
        "不同规范对方向表示可有不同规定，不能无条件画出唯一比特值。",
        "先读取题设或规范约定。",
      ),
      W(
        "跳变越多就必定不占额外带宽且永不误码",
        "coding-clock-perfect",
        "同步优势不是零成本或无误码保证",
        "含更多跳变的编码有带宽等代价，信道损伤仍可能导致误判。",
        "优点、代价和条件分别判断。",
      ),
    ],
  );
}
export const coding = pack(
  "network-engineer:02.02.01",
  "线路编码与数字调制",
  [
    {
      id: "coding-clock",
      title: "线路编码与时钟恢复",
      foundation:
        "线路编码将比特表示为适合介质传输的电平或跳变。接收方既要判断比特，还需确定取样时刻；长时间缺少边沿可能影响时钟恢复。",
      takeaway:
        "NRZ长串相同比特可能缺少边沿；曼彻斯特每比特中间有跳变，方向解释必须按约定。",
      cards: [
        E("coding-clock-explain", "数据判决和时钟是两个问题", [
          "简单NRZ把不同电平表示不同比特；连续相同比特可能长时间保持电平，接收端难以从这些数据获得边沿信息。实际系统可采用额外时钟恢复与编码措施。",
          "曼彻斯特在每个比特中间设置跳变。它提供时钟线索，但0/1与跳变方向的对应必须按题设规范解释，并不能保证任意信道上都不会误码。",
        ]),
      ],
      questions: [
        Q(
          "coding-clock-check",
          "简单NRZ传输长串相同比特，最直接的同步风险是什么？",
          "波形可能长时间没有边沿，难以从数据恢复时钟",
          "电平不变时缺少边沿线索，不代表信号本身完全不存在。",
          [
            W(
              "每个比特必定有中间跳变",
              "coding-nrz-transition",
              "这更接近曼彻斯特特征",
              "简单NRZ的相同比特可连续保持同电平。",
              "先画相邻相同比特。",
            ),
            W(
              "长时间保持电平必定说明链路已经断开",
              "coding-nrz-disconnect",
              "没有跳变不等于没有信号",
              "简单NRZ的连续相同比特可以正常产生持续电平，这不足以证明断链。",
              "区分持续电平、缺少时钟边沿与失去物理连接。",
            ),
            W(
              "接收端完全不再需要时钟",
              "coding-no-clock",
              "判决仍需正确时刻",
              "持续电平不取消采样时序需求。",
              "把值与时间两种判断分开。",
            ),
          ],
        ),
        transition("coding-clock-v1", "关于曼彻斯特编码的同步特点，哪项正确？"),
        transition(
          "coding-clock-v2",
          "题目未指定曼彻斯特0/1方向约定，哪项仍可以确定？",
        ),
      ],
    },
    {
      id: "coding-modulation",
      title: "幅度、频率、相位",
      foundation:
        "载波调制用可区分的信号参数状态承载符号。ASK、FSK、PSK分别以幅度、频率、相位区分，QAM联合幅度与相位。",
      takeaway:
        "ASK看幅度，FSK看频率，PSK看相位，QAM联合幅度与相位；码元有多个状态不等于改变所有参数。",
      cards: [
        T("coding-modulation-table", "参数与名称对应", [
          ["ASK", "幅度键控"],
          ["FSK", "频率键控"],
          ["PSK", "相位键控"],
          ["QAM", "幅度与相位的联合星座"],
        ]),
        E("coding-modulation-explain", "看题目让哪个参数区分符号", [
          "如果题目改变频率区分两种符号，不因为有载波振幅就判成ASK；重要的是用于承载信息的变化参数。",
          "QAM用多个星座点表示不同符号，星座点可以具有不同幅度和相位。具体每码元比特数还需看可区分状态数量。",
        ]),
      ],
      questions: [
        modulation(
          "coding-modulation-check",
          "理想数字调制用不同载波频率区分符号，属于哪种键控？",
          "FSK",
          parameterWrong("FSK"),
        ),
        modulation(
          "coding-modulation-v1",
          "理想数字调制保持幅度，以不同载波相位区分符号，属于哪种键控？",
          "PSK",
          parameterWrong("PSK"),
        ),
        modulation(
          "coding-modulation-v2",
          "联合幅度与相位形成多个星座点承载符号，典型调制是什么？",
          "QAM",
          parameterWrong("QAM"),
        ),
      ],
    },
    {
      id: "coding-efficiency",
      title: "效率与可判决性",
      foundation:
        "更多可区分符号可以提高每码元原始比特数，但在受限功率与噪声条件下通常要求更好的判决条件。编码、调制与纠错开销要分别计入。",
      takeaway:
        "增加状态可提高每码元比特数，但不自动提高抗噪或有效吞吐；线路编码的同步优势有带宽等代价。",
      cards: [
        E("coding-efficiency-explain", "更多选择，不代表更容易识别", [
          "固定长度16状态映射每符号4bit，64状态映射每符号6bit。相同码元速率下原始比特数更多，但必须能可靠区分信号。",
          "在同一功率尺度把星座点排得更密时，噪声更容易使判决越界。选型不能只看理论每码元比特数，还需看带宽、信噪比、同步和编码开销。",
        ]),
      ],
      questions: [
        Q(
          "coding-efficiency-check",
          "在受限功率和相同噪声条件下，把星座点排得更密，为什么不能只看每码元比特数？",
          "点间判决余量可能更小，需结合误码与信道条件",
          "更多状态可能增加判决难度。",
          [
            W(
              "状态越多必定越抗噪",
              "coding-more-robust",
              "更密不等于余量更大",
              "不能忽略点间距离与噪声。",
              "比较噪声相对判决边界的大小。",
            ),
            W(
              "状态数就是码元速率",
              "coding-state-baud",
              "选择数量不是发送频率",
              "状态数和每秒发送次数是不同量。",
              "分别写M和Baud。",
            ),
            W(
              "增加状态会自动删除所有纠错开销",
              "coding-no-redundancy",
              "调制阶数不取消纠错需要",
              "纠错与调制是不同设计维度。",
              "分别列原始与有效速率。",
            ),
          ],
        ),
        Q(
          "coding-efficiency-v1",
          "关于曼彻斯特同步优势，合理的工程判断是什么？",
          "便于时钟恢复，但要考虑带宽等代价",
          "含跳变的编码有同步优势，选型仍受资源条件限制。",
          [
            W(
              "有中间跳变就永远不可能误码",
              "coding-transition-no-error",
              "同步不等于免疫噪声",
              "实际波形仍可能被损伤。",
              "把同步与正确判决分开。",
            ),
            W(
              "它在任何条件下都同时最省带宽",
              "coding-min-bandwidth",
              "同步代价不能忽略",
              "相较简单NRZ，跳变需求会带来带宽等代价。",
              "说明比较条件和目标。",
            ),
            W(
              "它必须通过改变IP路由恢复时钟",
              "coding-route-clock",
              "时钟恢复是信号时序问题",
              "IP路由选择不定义线路比特边沿。",
              "寻找正确层次的措施。",
            ),
          ],
        ),
        Q(
          "coding-efficiency-v2",
          "固定长度映射M=16，每个符号的原始信息比特数是多少？",
          "4 bit",
          "16=2^4，所以每个符号对应4bit；编码与协议开销另算。",
          [
            W(
              "16 bit",
              "coding-m-as-bits",
              "状态数不是比特数",
              "4比特已经可标识16种组合。",
              "求log₂M。",
            ),
            W(
              "1 bit",
              "coding-one-bit",
              "多状态不是仅二选一",
              "一个比特只能区分两种状态。",
              "写出2^k=M。",
            ),
            W(
              "4 Byte",
              "coding-byte",
              "每符号4比特不是4字节",
              "字节与比特相差8倍。",
              "核对单位。",
            ),
          ],
        ),
      ],
    },
  ],
  [own("network-engineer:02.02.01"), qamSource],
  "7bba03e6babea87ec5ac",
);
