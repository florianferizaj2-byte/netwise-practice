import { E, K, T, question as Q, pack } from "../authoring.js";
const W = (text, error, title, reason, hint) => [
  text,
  error,
  title,
  reason,
  hint,
];
const own = (id) => ({ title: "考匠已审核课程 · 校验码与差错控制", path: id });
const count = (bits) => [...bits].filter((b) => b === "1").length;
function parityQ(id, bits, odd) {
  const ones = count(bits),
    p = odd ? 1 - (ones % 2) : ones % 2;
  return Q(
    id,
    `数据${bits}采用${odd ? "奇" : "偶"}校验，附加一个校验位后应选择哪项？`,
    `校验位${p}，合计${ones + p}个1`,
    `数据中有${ones}个1；加入校验位${p}后共有${ones + p}个1，符合${odd ? "奇" : "偶"}校验。`,
    [
      W(
        `校验位${1 - p}，合计${ones + 1 - p}个1`,
        "parity-target",
        "凑成了相反的奇偶性",
        `这项合计${ones + 1 - p}个1，符合${odd ? "偶" : "奇"}校验，而本题要求${odd ? "奇" : "偶"}校验。`,
        "把数据位和校验位中的1一起计数。",
      ),
      W(
        `校验位${p}，合计${ones + p + 1}个1`,
        "parity-count",
        "最终1的个数数错了",
        `校验位最多增加一个1；此处应为${ones}+${p}=${ones + p}，不是${ones + p + 1}。`,
        "先数数据中的1，再加校验位的值。",
      ),
      W(
        "无法由这些数据确定校验位",
        "parity-missing-rule",
        "没有使用题设校验规则",
        "题目给出数据和奇/偶目标，附加一位的值可以唯一确定。",
        "数1后判断是否需要增加一个1。",
      ),
    ],
  );
}
function receivedQ(id, bits, odd) {
  const ones = count(bits),
    valid = ones % 2 === (odd ? 1 : 0);
  return Q(
    id,
    `已收到完整码字${bits}（包含校验位），采用${odd ? "奇" : "偶"}校验。哪项结论正确？`,
    valid ? "校验通过，但不能证明绝无差错" : "校验不通过，说明检测到差错",
    `完整码字含${ones}个1，${valid ? "满足" : "不满足"}${odd ? "奇" : "偶"}校验要求。校验通过只表示未检测到，不保证没有差错。`,
    [
      W(
        valid ? "校验不通过，检测到了差错" : "校验通过，未检测到差错",
        "received-parity-target",
        "校验目标判断反了",
        `要统计完整码字的${ones}个1，而不是只统计数据字段。`,
        "比较完整码字的奇偶性与题设目标。",
      ),
      W(
        "可以直接定位并翻转某一错误位",
        "parity-corrects",
        "把检错当成定位纠错",
        "单个奇偶校验关系不能指出哪一位出错；检测失败也不能随便翻转一个位。",
        "区分发现有错与知道错在哪里。",
      ),
      W(
        "无论1的个数如何都能通过",
        "parity-ignore-count",
        "没有执行校验关系",
        "接收端必须重新计算完整码字的奇偶性，不是收到码字就自动通过。",
        "先数1，再与奇/偶规则比较。",
      ),
    ],
  );
}
function parityErrors(id, k) {
  const detected = k % 2 === 1;
  return Q(
    id,
    `原码字校验正确，传输中恰有${k}个不同位翻转，其他位不变。一维奇偶校验会怎样？`,
    detected ? "一定检测到，但不能定位错误位" : "不能检测到这次错误",
    `${k}次翻转使整体奇偶性${detected ? "改变" : "保持不变"}，因此${detected ? "校验失败" : "这次错误会漏检"}。这里包括数据位和校验位的翻转。`,
    [
      W(
        detected ? "这次错误会被漏检" : "一定检测到错误",
        "parity-error-count",
        "把奇偶个翻转的效果弄反了",
        "每翻转一次整体奇偶性改变一次；偶数次相互抵消，奇数次保留改变。",
        "把每一次翻转看成切换奇偶性。",
      ),
      W(
        `能定位并修复全部${k}个错误位`,
        "parity-repairs-many",
        "高估了一位校验的纠错能力",
        "只有一个奇偶关系无法定位全部错误；一维奇偶校验是检错机制。",
        "先辨别校验码的检错与纠错能力。",
      ),
      W(
        "只有校验位翻转才会被检查",
        "parity-only-check-bit",
        "忽略了数据位也参与校验",
        "接收端对整个码字重新计数；数据位翻转同样会影响校验关系。",
        "数据位与校验位都参与最终奇偶性计算。",
      ),
    ],
  );
}
export const parity = pack(
  "network-engineer:01.02.01",
  "奇偶校验",
  [
    {
      id: "parity-build",
      title: "生成奇偶校验位",
      foundation:
        "奇偶校验约束的是整个码字中1的个数，而不是校验位自己必须为奇数或偶数。",
      takeaway: "连同校验位一起数1；奇校验凑奇数，偶校验凑偶数。",
      cards: [
        E("parity-build-explain", "加这一位是为了满足总数", [
          "数据101100有3个1。采用偶校验时再加1，整体变成4个1；采用奇校验时加0，仍有3个1。",
          "校验位可为0或1，取值由数据与校验方式共同决定。",
        ]),
        T("parity-build-table", "生成校验位", [
          ["数据中1的个数", "偶数 / 奇数"],
          ["偶校验位", "0 / 1"],
          ["奇校验位", "1 / 0"],
        ]),
      ],
      questions: [
        parityQ("parity-build-check", "101100", false),
        parityQ("parity-build-v1", "11010", true),
        parityQ("parity-build-v2", "0110", true),
      ],
    },
    {
      id: "parity-receive",
      title: "接收端重新校验",
      foundation:
        "接收端不会知道发送的数据是否被改变，只能检查收到的完整码字是否满足约定关系。",
      takeaway:
        "检验完整码字；不满足规则表示检测到差错，满足规则只表示未检测到。",
      cards: [
        E("parity-receive-explain", "校验通过不等于绝对正确", [
          "偶校验码字1011001有4个1，校验通过。若传输后变成1011000，只有3个1，接收端可以发现不符合偶校验。",
          "通过检验时只能说“未检测到差错”。不能凭一个奇偶关系定位错误，更不能保证数据完全正确。",
        ]),
      ],
      questions: [
        receivedQ("parity-receive-check", "1011001", false),
        receivedQ("parity-receive-v1", "1011000", false),
        receivedQ("parity-receive-v2", "110100", true),
      ],
    },
    {
      id: "parity-limits",
      title: "哪些错误会漏检",
      foundation:
        "翻转是0变1或1变0。每个不同位翻转都会把整个码字的奇偶性切换一次。",
      takeaway:
        "一维奇偶校验检测奇数个位翻转，偶数个位翻转会漏检，不能定位纠错。",
      cards: [
        E("parity-limits-explain", "两次切换会回到原来的奇偶性", [
          "原来为偶数个1，一个位翻转后变成奇数；两个不同位翻转后又回到偶数。即使内容已经错误，校验也会通过。",
          "本规则针对一维单个奇偶校验位；二维校验或其他纠错码需要按其结构另行分析。",
        ]),
        K("parity-limits-key", "三句话分清能力", [
          "奇数个不同位翻转：能检出。",
          "偶数个不同位翻转：会漏检。",
          "发现关系不满足：仍不能确定错误位。",
        ]),
      ],
      questions: [
        parityErrors("parity-limits-check", 2),
        parityErrors("parity-limits-v1", 1),
        parityErrors("parity-limits-v2", 3),
      ],
    },
  ],
  [
    own("network-engineer:01.02.01"),
    {
      title: "Cornell · 校验关系与海明码",
      url: "https://www.cs.cornell.edu/courses/cs414/2007su/slides/hamming.html",
    },
  ],
  "44ad0919471545a2afa4",
);
function capacityQ(id, m) {
  let r = 1;
  while (2 ** r < m + r + 1) r++;
  return Q(
    id,
    `标准单比特纠错海明码含${m}个数据位，不加SECDED总体校验位。最少需要几个海明校验位？`,
    String(r),
    `需满足2^r≥m+r+1。r=${r - 1}时不满足；r=${r}时${2 ** r}≥${m + r + 1}，因此最小为${r}。`,
    [
      W(
        String(r - 1),
        "hamming-capacity-small",
        "校验状态数不够",
        `r=${r - 1}只能给出${2 ** (r - 1)}种综合校验状态，但还要区分数据位、校验位和无错状态。`,
        "把m+r+1完整代入，不只比较数据位数。",
      ),
      W(
        String(r + 1),
        "hamming-not-minimal",
        "把足够当成最少",
        `r=${r + 1}虽有足够状态，但${r}已经满足关系；题目问最少，且没有加总体校验位。`,
        "从小到大检查，第一次满足就停止。",
      ),
      W(
        "只要1位奇偶校验就能纠正任意单比特错误",
        "hamming-parity-locates",
        "混淆了一位检错与定位纠错",
        "一位奇偶校验不能区分多个可能的错误位置；海明码用多组关系组合定位。",
        "先数需要区分的位置，再决定综合校验位数。",
      ),
    ],
  );
}
function syndromeQ(id, s, wrong) {
  const pos = parseInt(s, 2);
  return Q(
    id,
    `标准海明(7,4)码约定位置从1编号。在最多一个错误的前提下，综合校验位(s4 s2 s1)=${s}，错误位置是哪一位？`,
    String(pos),
    `${s}按权值4、2、1读为${pos}；在单比特错误前提下，它就是从1编号的错误位置。`,
    wrong.map(([v, type, title, reason]) =>
      W(
        String(v),
        type,
        title,
        reason,
        "将s4、s2、s1分别乘4、2、1再相加，位置从1开始。",
      ),
    ),
  );
}
export const hamming = pack(
  "network-engineer:01.02.02",
  "海明校验",
  [
    {
      id: "hamming-capacity",
      title: "最小校验位数",
      foundation:
        "综合校验结果需要区分每个可能出错的位置，还要保留一个无错状态。",
      takeaway:
        "标准单比特纠错海明码使用2^r≥m+r+1确定最少r；SECDED总体校验位另加。",
      cards: [
        E("hamming-capacity-explain", "不只要覆盖数据位", [
          "m个数据位加r个海明校验位，共有m+r个可能的单比特错误位置。再加无错状态，需要m+r+1种可区分状态。",
          "例如m=4，r=2时4<7不够；r=3时8≥8，得到海明(7,4)。若做SECDED，还要另加一个总体校验位。",
        ]),
      ],
      questions: [
        capacityQ("hamming-capacity-check", 4),
        capacityQ("hamming-capacity-v1", 8),
        capacityQ("hamming-capacity-v2", 16),
      ],
    },
    {
      id: "hamming-layout",
      title: "校验位放在哪里",
      foundation:
        "本课采用位置从1编号的标准海明布局，1、2、4、8等2的幂位置留给校验位。",
      takeaway: "标准布局中校验位在1、2、4、8…；其他位置存放数据。",
      cards: [
        T("hamming-layout-table", "海明(7,4)的七个位置", [
          ["位置1、2、4", "海明校验位"],
          ["位置3、5、6、7", "4个数据位"],
        ]),
        E("hamming-layout-explain", "位置的二进制编号决定分组", [
          "p1检查位置1、3、5、7；p2检查2、3、6、7；p4检查4、5、6、7。",
          "同一个数据位可同时参与多个校验关系。不同组合让接收端区分错误位置。",
        ]),
      ],
      questions: [
        Q(
          "hamming-layout-check",
          "标准海明(7,4)码从1编号，海明校验位位于哪些位置？",
          "1、2、4",
          "校验位放在2的幂位置1、2、4。",
          [
            W(
              "1、2、3",
              "hamming-contiguous",
              "把校验位连在了一起",
              "位置3不是2的幂，它是数据位；校验位需要按位置编号形成不同校验组。",
              "找1、2、4这些2的幂。",
            ),
            W(
              "0、1、2",
              "hamming-zero-origin",
              "从0编号套入了当前规则",
              "本题明确从1编号，没有位置0。",
              "先读编号约定。",
            ),
            W(
              "3、5、6、7",
              "hamming-data-as-parity",
              "把数据位当成校验位",
              "3、5、6、7存4个数据位，不是校验位。",
              "先标出2的幂，剩余位置才放数据。",
            ),
          ],
        ),
        Q(
          "hamming-layout-v1",
          "标准海明(7,4)码的4个数据位应放在哪里？",
          "3、5、6、7",
          "先保留1、2、4给校验位，其余3、5、6、7放数据。",
          [
            W(
              "1、2、4、7",
              "hamming-parity-overwritten",
              "覆盖了校验位",
              "1、2、4已用于校验，不可再次放普通数据。",
              "数据放非2的幂位置。",
            ),
            W(
              "4、5、6、7",
              "hamming-data-contiguous",
              "把数据位都放在末尾",
              "位置4是校验位，位置3则必须放数据。",
              "按标准布局而不是按字段连续摆放。",
            ),
            W(
              "只有3、5、6三个位置",
              "hamming-last-data-omitted",
              "漏掉了最后一个数据位",
              "位置7也不是2的幂，属于第四个数据位。",
              "列出1到7后排除1、2、4。",
            ),
          ],
        ),
        Q(
          "hamming-layout-v2",
          "标准海明布局扩展到12个位置时，位置8应该做什么？",
          "放海明校验位",
          "8=2^3，应作为校验位并检查编号中8位权为1的位置。",
          [
            W(
              "放数据，因为它是偶数",
              "hamming-even-data",
              "误把所有偶数都当成数据位",
              "位置2、4、8虽然是偶数，但属于2的幂，都是校验位。",
              "判断是不是2的幂，而不是奇偶。",
            ),
            W(
              "放在位置7的校验值副本",
              "hamming-duplicate",
              "误把新增校验关系当重复值",
              "位置8校验一组新的位置，不是复制旧位的值。",
              "每个校验位负责不同编号位权的分组。",
            ),
            W(
              "保持空位，不参与编码",
              "hamming-unused",
              "遗漏了必要的校验关系",
              "位置8需承担校验关系，否则无法按标准布局定位后面的单比特错误。",
              "先标校验位置再安排数据。",
            ),
          ],
        ),
      ],
    },
    {
      id: "hamming-syndrome",
      title: "用综合校验结果定位",
      foundation:
        "综合校验位表示哪些校验组没有满足关系，按位置位权组合后才能得到位置编号。",
      takeaway:
        "在最多单比特错误的前提下，syndrome的二进制值指向错误位置；全零只表示校验关系满足。",
      cards: [
        E("hamming-syndrome-explain", "分组结果不是出错位的个数", [
          "约定(s4 s2 s1)=101，表示p4、p1关系失败，4+1=5，单比特错误位于位置5。翻转该位后重新校验。",
          "syndrome为000表示所有海明关系满足，但不能在任意多比特错误情况下据此宣称无错；本段定位结论需要最多一个错误的前提。",
        ]),
      ],
      questions: [
        syndromeQ("hamming-syndrome-check", "101", [
          [
            2,
            "syndrome-count",
            "把失败组数当成位置",
            "有2组失败，但位置由4+1=5得到。",
          ],
          [
            4,
            "syndrome-largest",
            "只看了最高失败组",
            "p1也失败，不能漏掉权值1。",
          ],
          [
            6,
            "syndrome-offset",
            "额外加了一次编号偏移",
            "syndrome已经给出从1编号的位置5，无须再加1。",
          ],
        ]),
        syndromeQ("hamming-syndrome-v1", "110", [
          [
            2,
            "syndrome-count",
            "把失败组数当成位置",
            "有2组失败，但权值4+2=6。",
          ],
          [
            4,
            "syndrome-largest",
            "漏掉了p2的权值",
            "p4、p2同时失败，应加4与2。",
          ],
          [
            7,
            "syndrome-offset",
            "不需要额外加1",
            "标准位置编号直接等于二进制值6。",
          ],
        ]),
        syndromeQ("hamming-syndrome-v2", "011", [
          [2, "syndrome-largest", "只读了p2", "还要加入p1的权值1，得到3。"],
          [1, "syndrome-lowest", "只读了p1", "还要加入p2的权值2，得到3。"],
          [
            4,
            "syndrome-offset",
            "把位置从1编号误当成加1",
            "011已经代表位置3，不应再加1。",
          ],
        ]),
      ],
    },
    {
      id: "hamming-secded",
      title: "SECDED的能力边界",
      foundation:
        "扩展海明码在海明校验位之外，增加一个覆盖整个码字的总体奇偶校验位。以下判断均限定最多两位错误。",
      takeaway:
        "SECDED纠正单比特、检测双比特；双比特错误不能靠随意翻转syndrome位置纠正。",
      cards: [
        E("hamming-secded-explain", "综合校验与总体奇偶一起看", [
          "约定总体偶校验：S非0且总体奇偶失败，对应码体内的单比特错误；S为0但总体奇偶失败，对应总体校验位自身错误。",
          "S非0而总体奇偶通过，在最多两位错误假设下属于双比特错误，应报告不可纠正，不要按S翻转一个位。超过两位的错误不在SECDED保证范围内。",
        ]),
        T("hamming-secded-table", "最多两位错误时的分类", [
          ["S=0，总体通过", "未检测到错误"],
          ["S≠0，总体失败", "码体单比特，可纠正"],
          ["S=0，总体失败", "总体校验位单比特错误"],
          ["S≠0，总体通过", "双比特，检测但不纠正"],
        ]),
      ],
      questions: [
        Q(
          "hamming-secded-check",
          "扩展海明码，最多两位错误。S=011且总体偶校验通过，应如何处理？",
          "报告双比特错误，不按S翻转纠正",
          "S非0且总体通过是双比特错误类别，SECDED不能保证纠正它。",
          [
            W(
              "翻转位置3并宣称已经修复",
              "secded-double-as-single",
              "把双比特错误当成单比特",
              "总体校验通过表明不是单个码体位翻转；盲目翻位置3会误纠正。",
              "综合S与总体奇偶一起分类。",
            ),
            W(
              "S不是0，但总体通过就说明完全无错",
              "secded-ignore-syndrome",
              "忽略了非零综合校验",
              "S非0说明码体关系已经失败，不可只看总体奇偶。",
              "两个校验条件必须同时读取。",
            ),
            W(
              "只能是总体校验位单独出错",
              "secded-overall-bit",
              "把总体位错误的模式弄反",
              "总体位单独出错应为S=0、总体失败。",
              "分别记住码体与总体位的模式。",
            ),
          ],
        ),
        Q(
          "hamming-secded-v1",
          "扩展海明码，最多两位错误。S=000而总体偶校验失败，应判断为什么？",
          "总体校验位自身发生单比特错误",
          "码体海明关系通过，但总体关系失败，指向新增总体位。",
          [
            W(
              "完全无错，因为S=0",
              "secded-overall-ignored",
              "没有检查总体校验",
              "S为0只说明码体关系满足，总体奇偶仍失败。",
              "不要丢掉额外总体校验信息。",
            ),
            W(
              "码体位置7一定出错",
              "secded-fabricated-position",
              "凭空指定了错误位置",
              "S=000不指向码体位置7。该模式表明总体校验位出错。",
              "位置仅由非零S给出。",
            ),
            W(
              "两位错误，可任意选择两位翻转",
              "secded-random-repair",
              "无依据地做双位纠错",
              "该模式在假设范围内是总体位单错，不是任意双位错误；SECDED也不能随意双位修复。",
              "按明确分类处理，不猜错误位置。",
            ),
          ],
        ),
        Q(
          "hamming-secded-v2",
          "扩展海明码，最多两位错误。S=101且总体偶校验失败，哪项正确？",
          "码体位置5发生单比特错误，可翻转后复检",
          "S非0、总体失败说明码体单错；101₂=5。",
          [
            W(
              "双比特错误，不可纠正",
              "secded-single-as-double",
              "把总体失败模式看反了",
              "最多两位错误时，两位翻转使总体偶校验通过；此处失败且S非0指向单错。",
              "先判断总体奇偶，再读S。",
            ),
            W(
              "总体校验位自身出错",
              "secded-body-as-overall",
              "忽略了S非0",
              "总体位单错不影响码体海明关系，应为S=0。",
              "总体位错误和码体错误分开。",
            ),
            W(
              "翻转位置6，因为位置从1开始",
              "secded-position-offset",
              "多加了一个编号偏移",
              "101₂直接对应位置5，不需要再加1。",
              "S按标准编号直接定位。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    own("network-engineer:01.02.02"),
    {
      title: "Cornell · 海明码布局与定位",
      url: "https://www.cs.cornell.edu/courses/cs414/2007su/slides/hamming.html",
    },
    {
      title: "Intel · SECDED ECC",
      url: "https://www.intel.com/content/www/us/en/docs/programmable/683490/25-1/altecc-error-correction-code-encoder.html",
    },
  ],
  "45fd1ec7f47a1231d9c6",
);

// Textbook unreflected CRC: zero initial state, no final XOR. Real protocol CRC parameters may differ.
export function crcRemainder(data, generator, append = true) {
  const r = generator.length - 1,
    a = [...(data + (append ? "0".repeat(r) : ""))].map(Number),
    g = [...generator].map(Number);
  for (let i = 0; i <= a.length - g.length; i++)
    if (a[i]) for (let j = 0; j < g.length; j++) a[i + j] ^= g[j];
  return a.slice(-r).join("");
}
function crcDegreeQ(id, g) {
  const r = g.length - 1;
  return Q(
    id,
    `教材CRC生成式位串为${g}，发送数据先补几个0、余数保留几位？`,
    `补${r}个0，余数${r}位`,
    `生成式长度${g.length}，最高项次数为${r}。数据先乘x^${r}，余数固定保留${r}位。`,
    [
      W(
        `补${g.length}个0，余数${g.length}位`,
        "crc-length-degree",
        "把位串长度当成次数",
        "生成式最高位是x的次数；长度比次数多1。",
        "次数=生成式位串长度−1。",
      ),
      W(
        "不用补0，直接除原数据",
        "crc-padding-omitted",
        "省略了发送端的移位",
        "发送码字需要给校验余数预留r位，先在数据后补r个0。",
        "先补零再求余，最后用余数替换这些零。",
      ),
      W(
        "补1个0，余数恒为1位",
        "crc-parity-size",
        "把CRC当成一位奇偶校验",
        "CRC位宽取决于生成多项式次数，不能固定成1。",
        "从生成式确定r。",
      ),
    ],
  );
}
function crcCalcQ(id, data, g) {
  const result = crcRemainder(data, g),
    r = g.length - 1,
    unpadded = crcRemainder(data, g, false),
    wrong = (parseInt(result, 2) ^ 1).toString(2).padStart(r, "0");
  return Q(
    id,
    `教材CRC：数据${data}，生成式${g}，初值0、不反射、不最终异或。补零后模2除法所得${r}位余数是哪项？`,
    result,
    `${data}后补${r}个0，逐位异或除以${g}，余数为${result}；发送码字为${data + result}。`,
    [
      W(
        unpadded,
        "crc-unpadded",
        "直接除原数据了",
        `直接对原数据求余得到${unpadded}，漏掉了预留校验位的${r}个0。`,
        "先写出数据加r个0的被除数。",
      ),
      W(
        wrong,
        "crc-xor-bit",
        "末位异或结果算错了",
        `正确余数为${result}；该选项与它末位不同。模2减法是异或，不借位。`,
        "每一步对齐最高的1，再逐位异或。",
      ),
      W(
        "余数就是完整生成式" + g,
        "crc-generator-as-remainder",
        "把除式抄成了余数",
        `余数次数必须低于生成式，所以只保留${r}位；生成式不是余数。`,
        "区分被除数、生成式和余数。",
      ),
    ],
  );
}
export const crc = pack(
  "network-engineer:01.02.03",
  "CRC循环冗余校验",
  [
    {
      id: "crc-degree",
      title: "次数、补零与余数位宽",
      foundation:
        "CRC把位串解释为模2多项式。最高位为1的生成式长度比它的次数多1。",
      takeaway:
        "生成式次数r，发送端补r个0后除，余数固定r位；不是按生成式长度补零。",
      cards: [
        E("crc-degree-explain", "先确定校验字段有多长", [
          "1011表示x^3+x+1，次数为3。因此数据先补3个0，再用模2除法求3位余数。",
          "模2减法等于异或：1⊕1=0、1⊕0=1，没有普通减法的借位。收到完整码字时直接检查，不再额外补零。",
        ]),
        T("crc-xor-table", "逐位异或", [
          ["0⊕0 / 1⊕1", "0"],
          ["0⊕1 / 1⊕0", "1"],
        ]),
      ],
      questions: [
        crcDegreeQ("crc-degree-check", "1011"),
        crcDegreeQ("crc-degree-v1", "10011"),
        crcDegreeQ("crc-degree-v2", "111"),
      ],
    },
    {
      id: "crc-calculate",
      title: "动手算教材CRC",
      foundation:
        "本段仅用初值0、不反射、不最终异或的教材算法；真实以太网CRC还有具体参数约定，不能混算。",
      takeaway:
        "发送端数据补r个0，用生成式逐位异或消去最高项，余数替换末尾的r个0。",
      cards: [
        E("crc-calculate-explain", "按顺序完成四步", [
          "例：数据1101，生成式1011，先写1101000。与1011000异或得到0110000；再与0101100异或得0011100；再与0010110异或得0001010；最后与0001011异或得0000001。",
          "保留3位余数001，发送1101001。余数不够r位时前面补0，不能只发送一个1。",
        ]),
      ],
      questions: [
        crcCalcQ("crc-calculate-check", "1100", "1011"),
        crcCalcQ("crc-calculate-v1", "1001", "1011"),
        crcCalcQ("crc-calculate-v2", "1010", "1101"),
      ],
    },
    {
      id: "crc-check",
      title: "接收校验与能力边界",
      foundation:
        "发送端生成冗余字段，接收端检查收到的完整码字是否满足约定多项式关系。",
      takeaway:
        "教材零初值CRC完整码字余数非0表示检出差错；余数0不保证无错，也不定位修复错误。",
      cards: [
        E("crc-check-explain", "验证整个码字", [
          "教材算法下，发送1101001除以1011余数000。若最低位翻转得到1101000，余数001，因此检测到错误。",
          "有些错误位串恰好是生成式的倍数，可能漏检。CRC不是加密校验，也不会凭一个余数自动定位并修复所有错误。",
        ]),
        K("crc-check-key", "实际协议要看参数", [
          "题设教材算法：期望完整码字余数0。",
          "真实协议可能使用反射、非零初值、最终异或，检验残值须按协议约定。",
          "检出错误与纠正错误是两种能力。",
        ]),
      ],
      questions: [
        Q(
          "crc-check-check",
          "教材零初值算法中，完整接收码字模2除法余数非0，应怎样判断？",
          "检测到差错，不能据此直接定位修复",
          "收到的码字不满足校验关系，说明检测到差错；余数并不直接指出哪个位错。",
          [
            W(
              "这是正常余数，接收端仍应补r个0",
              "crc-receiver-padding",
              "把发送端步骤搬到接收端",
              "接收端检查完整码字，教材算法期望余数0，不再次补零。",
              "先区分生成CRC与检查完整码字。",
            ),
            W(
              "可以无条件翻转余数表示的位置",
              "crc-syndrome-location",
              "把CRC余数当成海明位置",
              "普通CRC的余数不是海明码的位置编号，不能按数字翻转一个位。",
              "不同校验码的解码规则不能互换。",
            ),
            W(
              "非0说明数据已经加密",
              "crc-encryption",
              "把校验结果当成加密标志",
              "CRC提供差错检测，不表示加密，更不能保护机密性。",
              "区分传输检错和安全机制。",
            ),
          ],
        ),
        Q(
          "crc-check-v1",
          "数据1101配教材CRC余数001，完整码字1101001被1011除后余数000。哪项正确？",
          "本次校验通过，但不能证明绝对无错",
          "余数0表示满足校验关系；CRC有漏检模式，不是数据绝对正确的证明。",
          [
            W(
              "余数0证明传输中不可能出现任何错误",
              "crc-zero-guarantee",
              "把校验通过当成绝对保证",
              "生成式倍数形式的错误可能保持余数0。",
              "说未检测到差错，不说绝无差错。",
            ),
            W(
              "余数0表示接收端没有计算",
              "crc-zero-no-check",
              "误读了零结果",
              "零是合法校验结果，不表示没执行除法。",
              "区分计算是否执行与计算值为0。",
            ),
            W(
              "应该再把001附加一次才能检查",
              "crc-duplicate-fcs",
              "重复附加了CRC",
              "完整码字已含001，直接除即可；重复附加改变了码字。",
              "确认校验字段已经在码字末尾。",
            ),
          ],
        ),
        Q(
          "crc-check-v2",
          "生成式1011，教材算法接收码字1101000。余数为001，接收端应怎样处理？",
          "拒绝该受保护码字或报告差错，交由上层机制处理",
          "余数001非0，检测到差错；链路或上层机制决定丢弃、统计、重传，普通CRC不自动修复。",
          [
            W(
              "自动把最后一位改为1，任何此类错误都能修复",
              "crc-known-example-repair",
              "把示例答案当成通用修复方法",
              "此例确实与1101001差一位，但接收端仅凭CRC不能保证真实发送码字或错误位置。",
              "示例已知原文不能代替通用纠错能力。",
            ),
            W(
              "按通过处理，因为余数只有一位是1",
              "crc-small-remainder",
              "忽略了非零校验结果",
              "余数是否为0才是本教材条件，非零值再小也表示校验失败。",
              "检查零与非零，不比较余数大小。",
            ),
            W(
              "再补3个0直到余数消失",
              "crc-force-valid",
              "人为改变收到的码字来凑结果",
              "接收端不能修改收到的位串来把校验凑成0。",
              "保留原接收码字并报告失败。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    own("network-engineer:01.02.03"),
    {
      title: "York University · CRC模2除法",
      url: "https://www.eecs.yorku.ca/course_archive/2015-16/F/3213/CSE3213_11_ErrorControl_2_F2015_posted.pdf",
    },
  ],
  "f00e8578a5f4097ebef7",
);

crc.course.version = "20261012-v2";
