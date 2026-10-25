import { E, T, question as Q, pack } from "../authoring.js";
import {
  pcmNodeId,
  pcmCorrectedVersion,
} from "../curriculum-corrections.js";
const W = (t, k, h, r, i) => [t, k, h, r, i];
function aliasQ(id, input, sampling) {
  const folded = Math.abs(input - sampling);
  return Q(
    id,
    `实数单一正弦频率${input}Hz，以${sampling}sample/s均匀采样。本题将频率折叠到0至fs/2范围，等效混叠频率是多少？`,
    `${folded} Hz`,
    `本题输入在fs/2与fs之间，折叠频率|${input}−${sampling}|=${folded}Hz；相位可能变化。`,
    [
      W(
        `${input} Hz`,
        "pcm-alias-original",
        "高于fs/2的频率不能直接当第一奈奎斯特区的频率",
        "题目要求折叠到0至fs/2，而原频率超出该范围。",
        "先确定需要表示的频率区间。",
      ),
      W(
        `${sampling / 2} Hz`,
        "pcm-alias-limit",
        "频率上限不是所有信号的混叠结果",
        "fs/2只是第一奈奎斯特区边界，具体结果要折叠计算。",
        "对输入频率减去相应fs整数倍。",
      ),
      W(
        `${input + sampling} Hz`,
        "pcm-alias-add",
        "结果不在指定的频率区间",
        "加fs后的频率等价周期表示之一，但不是0至fs/2内的结果。",
        "最后检查结果是否落在题设范围。",
      ),
    ],
  );
}
function rateQ(id, fs, bits, channels) {
  const rate = fs * bits * channels;
  return Q(
    id,
    `未压缩PCM每通道采样率${fs}sample/s，每样值${bits}bit，共${channels}个通道。不计封装和其他开销，原始比特速率多少？`,
    `${rate} bit/s`,
    `${fs}×${bits}×${channels}=${rate}bit/s。`,
    [
      W(
        `${fs * channels} bit/s`,
        "pcm-rate-samples",
        "样值数量不是比特数量",
        "每个样值还携带题设的多个比特。",
        "先算每秒样值，再乘每样值位数。",
      ),
      W(
        `${rate} Byte/s`,
        "pcm-rate-byte",
        "比特数值不能直接标成字节数值",
        "若把bit/s换成Byte/s，数值需除8，不能保持这个数值。",
        "检查单位和数值一起转换。",
      ),
      W(
        `${rate * 2} bit/s`,
        "pcm-rate-double",
        "不要再次把采样定理的2乘进PCM速率",
        "题设已经给出了实际采样率，不能把它再翻倍。",
        "用实际fs而非重新推导的下限。",
      ),
    ],
  );
}
export const pcm = pack(
  pcmNodeId,
  "采样、混叠与PCM数字化",
  [
    {
      id: "pcm-sampling",
      title: "速率、频率与临界采样",
      foundation:
        "本节讨论均匀采样的基带带限信号。信号最高频率fmax对应奈奎斯特速率2fmax；采样率fs对应奈奎斯特频率fs/2。通常取fs>2fmax并留滤波余量。",
      takeaway:
        "2fmax是信号的奈奎斯特速率，fs/2是采样器的奈奎斯特频率；等号不是任意边界相位的恢复保证。",
      cards: [
        T("pcm-sampling-table", "分别看是谁决定的量", [
          ["信号最高频率fmax", "奈奎斯特速率2fmax"],
          ["采样率fs", "奈奎斯特频率fs/2"],
          ["实际基带采样", "限制输入带宽，留出边界与滤波余量"],
        ]),
        E("pcm-sampling-explain", "两种带“奈奎斯特”的量不能互换", [
          "例：基带信号最高频率2500Hz，奈奎斯特速率5000sample/s。若选择8000sample/s采样，采样器奈奎斯特频率为4000Hz。两者由不同已知量决定。",
          "临界反例：x(t)=sin(2πft)，若fs=2f、从t=0采样，则样值sin(πn)全为0。非零波形与全零波形不能靠这些样值区分，不能无条件把等号处当作任意信号恢复保证。",
        ]),
      ],
      questions: [
        Q(
          "pcm-sampling-check",
          "采样率fs=10000sample/s，该采样器的奈奎斯特频率是多少？",
          "5000 Hz",
          "采样器奈奎斯特频率fs/2=5000Hz。",
          [
            W(
              "20000 Hz",
              "pcm-frequency-double",
              "不要把fs翻倍",
              "2fmax是信号的速率概念，不是给定fs的频率上限。",
              "先确认已知的是fs还是fmax。",
            ),
            W(
              "10000 Hz",
              "pcm-frequency-same",
              "采样率与奈奎斯特频率不同",
              "频率上限按fs的一半计算。",
              "写出fs/2。",
            ),
            W(
              "2500 Hz",
              "pcm-frequency-quarter",
              "不用再除一次2",
              "给定采样率只除2得到奈奎斯特频率。",
              "避免两种术语连续误换算。",
            ),
          ],
        ),
        Q(
          "pcm-sampling-v1",
          "基带带限信号最高频率fmax=3500Hz，该信号的奈奎斯特速率是多少？",
          "7000 sample/s",
          "奈奎斯特速率=2fmax，不是给定采样器的fs/2。",
          [
            W(
              "1750 sample/s",
              "pcm-rate-half",
              "求信号速率需乘2",
              "一半采样率规则用于给定fs时的频率概念。",
              "从fmax出发求2fmax。",
            ),
            W(
              "3500 sample/s",
              "pcm-rate-same",
              "没有应用倍频关系",
              "奈奎斯特速率是最高频率的两倍。",
              "先确定题目要求哪个量。",
            ),
            W(
              "14000 sample/s",
              "pcm-rate-four",
              "多乘了一次2",
              "2fmax只乘一次；实际可选更高采样率，但不是该术语的计算值。",
              "理论速率与实际选型分开。",
            ),
          ],
        ),
        Q(
          "pcm-sampling-v2",
          "x(t)=sin(2πft)，取fs=2f且从t=0均匀采样。能否凭样值无条件恢复这条非零正弦？",
          "不能，样值sin(πn)全为0，与零信号无法区分",
          "这是临界频率与相位导致的反例。",
          [
            W(
              "能，fs等于2f在任何相位下都保证恢复",
              "pcm-critical-always",
              "等号不能无条件推广",
              "给定反例中所有整数n的样值都为0。",
              "把采样时刻代入波形。",
            ),
            W(
              "能，因为每次样值都是幅度最大值1",
              "pcm-critical-peak",
              "题设从零相位开始",
              "sin(πn)不是固定峰值1。",
              "不要把sin与cos的取样相位混用。",
            ),
            W(
              "不能，因为所有超过2f的采样率也无法恢复",
              "pcm-critical-overgeneralize",
              "临界反例不否定满足条件的更高采样",
              "限制在边界条件，不能扩大为任何采样率都失败。",
              "保留题设条件和结论范围。",
            ),
          ],
        ),
      ],
    },
    {
      id: "pcm-aliasing",
      title: "混叠与采样前滤波",
      foundation:
        "采样会周期复制频谱。超出目标采样频带的分量可能折叠并与需要的分量重合。基带抗混叠低通滤波通常放在ADC采样之前。",
      takeaway:
        "先限制输入频带再采样；已经重叠的频率来源通常不能仅靠采样后的滤波区分。",
      cards: [
        E("pcm-aliasing-explain", "不同模拟频率可能产生相同样值", [
          "例：实数正弦6500Hz以10000sample/s采样，第一奈奎斯特区的等效频率为3500Hz，且相位可能改变。一般需按fs周期折叠到指定区间，本课计算题只选一次折叠的输入。",
          "基带采样前的低通滤波器衰减不需要的高频，实际滤波器有过渡带，应留余量。若干扰与有效分量采样后重叠，后置低通不能知道各自原来来自哪一个频率。",
        ]),
      ],
      questions: [
        aliasQ("pcm-aliasing-check", 6000, 10000),
        aliasQ("pcm-aliasing-v1", 7000, 8000),
        Q(
          "pcm-aliasing-v2",
          "基带ADC的高频干扰会折叠进有效频带，主要应在哪里限制这些输入分量？",
          "在ADC采样之前使用合适的抗混叠低通滤波",
          "先衰减会折叠的高频，避免来源不可区分。",
          [
            W(
              "采样后再过滤，必能恢复所有原始频率来源",
              "pcm-filter-after",
              "重叠后可能已经不可区分",
              "后置滤波不能通用地分开相同采样表示的来源。",
              "先问信息何时丢失。",
            ),
            W(
              "只增加量化位数就能消除所有混叠",
              "pcm-filter-bits",
              "量化精度不是采样带宽",
              "位数改变幅度表示，不能直接分开已折叠的频率。",
              "时间采样与幅度离散分开。",
            ),
            W(
              "只改变二进制码字顺序，无需限制输入频带",
              "pcm-filter-code",
              "编码顺序不阻止频谱重叠",
              "混叠发生在采样环节，不是码字排列问题。",
              "找产生问题的步骤。",
            ),
          ],
        ),
      ],
    },
    {
      id: "pcm-process",
      title: "采样、量化、编码",
      foundation:
        "采样离散时间，量化把幅度映射到有限电平，编码把电平编号表示为码字。有限量化精度会带来误差，本段不把采样与量化混为一件事。",
      takeaway:
        "PCM通常按采样→量化→编码；有限量化不天然无误差，n比特固定长度码字最多表示2^n种编号。",
      cards: [
        T("pcm-process-table", "三个步骤分别改变什么", [
          ["采样", "时间变为离散取样时刻"],
          ["量化", "样值幅度映射为有限电平"],
          ["编码", "电平编号表示为比特码字"],
        ]),
        E("pcm-process-explain", "时间离散不等于幅度离散", [
          "理想采样后的样值幅度仍可连续取值，量化将其近似到可表示电平。编码只是把编号写成约定比特，并不能自动恢复被量化丢弃的信息。",
          "固定n比特码字有2^n种组合。增加量化位数可在相同幅度范围和量化方式等条件下提高精度，但不能用它代替抗混叠采样设计。",
        ]),
      ],
      questions: [
        Q(
          "pcm-process-check",
          "把理想采样后连续取值的幅度近似为有限离散电平，属于哪一步？",
          "量化",
          "量化完成幅度离散化，产生相应近似误差。",
          [
            W(
              "采样",
              "pcm-process-time",
              "采样主要离散时间",
              "本题描述幅度映射到电平，不是选择时刻。",
              "分别看横轴时间和纵轴幅度。",
            ),
            W(
              "编码",
              "pcm-process-code",
              "编码表示已选电平的编号",
              "选择近似电平与写出码字是两个步骤。",
              "先确定电平，再表示编号。",
            ),
            W(
              "路由",
              "pcm-process-route",
              "分组寻路不是数字化步骤",
              "路由不负责模拟样值电平映射。",
              "保持在PCM数字化流程中判断。",
            ),
          ],
        ),
        Q(
          "pcm-process-v1",
          "标准PCM数字化的基本顺序是什么？",
          "采样 → 量化 → 编码",
          "先获取时刻样值，再近似电平，最后表示编号。",
          [
            W(
              "量化 → 编码 → 采样",
              "pcm-order-sampling-last",
              "先要取得样值",
              "不能把获取样值步骤放到输出码字之后。",
              "沿模拟输入到比特输出检查。",
            ),
            W(
              "采样 → 编码 → 量化",
              "pcm-order-code-first",
              "量化结果是编码对象",
              "标准流程先选离散电平再编码。",
              "明确每步输入和输出。",
            ),
            W(
              "编码 → 采样 → 量化",
              "pcm-order-start-code",
              "还没有样值和电平编号",
              "无法先对未获取的量化结果编码。",
              "先确定输入是模拟波形。",
            ),
          ],
        ),
        Q(
          "pcm-process-v2",
          "固定长度8bit码字最多表示多少种电平编号？",
          "256",
          "8比特有2^8=256种组合。",
          [
            W(
              "8",
              "pcm-level-bits",
              "位数不是组合数",
              "每位有两种选择，共2^8。",
              "数二进制组合。",
            ),
            W(
              "16",
              "pcm-level-double",
              "不能用位数乘2",
              "组合数量随位数按2的幂增长。",
              "写2^n。",
            ),
            W(
              "无限多",
              "pcm-level-unlimited",
              "有限码长有有限组合",
              "8bit不能一一表示无限电平。",
              "先数有限码字。",
            ),
          ],
        ),
      ],
    },
    {
      id: "pcm-rate",
      title: "PCM原始速率",
      foundation:
        "未压缩PCM原始速率=每通道采样率×每样值位数×通道数。本课不计网络封装、纠错或其他开销，也不把原始PCM速率当应用吞吐。",
      takeaway:
        "PCM速率用实际fs×n×通道数；题设已给fs就不再次乘采样定理的2，bit/s与Byte/s分别标注。",
      cards: [
        E("pcm-rate-explain", "先数样值，再数比特", [
          "例：单通道12000sample/s、每样值10bit，原始PCM速率120000bit/s。双通道会翻倍；压缩编码和网络开销则按实际机制另算。",
          "采样率、量化位数和通道数是不同维度。只给模拟最高频率时还要选择采样方案；已经给实际采样率时不要把它再乘2。",
        ]),
      ],
      questions: [
        rateQ("pcm-rate-check", 8000, 8, 1),
        rateQ("pcm-rate-v1", 16000, 12, 2),
        rateQ("pcm-rate-v2", 44100, 16, 2),
      ],
    },
  ],
  [
    { title: "考匠 · 已修订采样与PCM快照", path: pcmNodeId },
    {
      title: "Analog Devices · 奈奎斯特频率",
      url: "https://www.analog.com/en/resources/glossary/nyquist.html",
    },
    {
      title: "Analog Devices · 带限采样与混叠",
      url: "https://www.analog.com/en/resources/technical-articles/basics-of-bandlimited-sampling-and-aliasing.html",
    },
    {
      title: "Cisco · PCM波形编码",
      url: "https://www.cisco.com/c/en/us/support/docs/voice/h323/8123-waveform-coding.html",
    },
  ],
  pcmCorrectedVersion,
);
