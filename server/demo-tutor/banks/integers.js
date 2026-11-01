import { E, K, T, question as Q, pack } from "../authoring.js";
const W = (text, error, title, reason, hint) => [
  text,
  error,
  title,
  reason,
  hint,
];
const bits = (value, width = 8) => value.toString(2).padStart(width, "0");
const encode = (m, kind) =>
  bits(kind === "sign" ? 128 + m : kind === "ones" ? 255 - m : 256 - m);
const names = { sign: "原码", ones: "反码", twos: "补码" };
const rules = {
  sign: "最高位写1表示负数，剩余7位写绝对值。",
  ones: "先写正数的8位编码，再对全部位取反，得到负数反码。",
  twos: "先把正数的8位编码逐位取反，再加1；等价于256减去绝对值。",
};
function encodeQuestion(id, m, kind) {
  const code = encode(m, kind);
  return Q(
    id,
    `用8位${names[kind]}表示−${m}，应写哪项？`,
    code,
    `正数${m}为${bits(m)}。${rules[kind]}结果是${code}。`,
    [
      ...Object.keys(names)
        .filter((k) => k !== kind)
        .map((k) =>
          W(
            encode(m, k),
            "encoding-as-" + k,
            `把${names[kind]}写成了${names[k]}`,
            `${encode(m, k)}是−${m}的${names[k]}。题目要求${names[kind]}：${rules[kind]}`,
            "先圈出题目指定的编码，再操作数值位。",
          ),
        ),
      W(
        bits(m),
        "lost-negative-sign",
        "忽略了负号",
        `${bits(m)}表示正${m}；负数必须按${names[kind]}规则转换，不能沿用正数编码。`,
        "先确认真值正负，再确认编码类型。",
      ),
    ],
  );
}
function decodeQuestion(id, m, kind) {
  const code = encode(m, kind),
    u = parseInt(code, 2);
  const values = { sign: -(u & 127), ones: -(255 - u), twos: u - 256 };
  return Q(
    id,
    `字段${code}按8位${names[kind]}解释，其真值是多少？`,
    String(-m),
    `${names[kind]}编码${code}对应−${m}。必须按指定编码解释同一位串。`,
    [
      ...Object.keys(names)
        .filter((k) => k !== kind)
        .map((k) =>
          W(
            String(values[k]),
            "decode-as-" + k,
            `按${names[k]}解释了字段`,
            `若按${names[k]}读${code}才得到${values[k]}；当前指定的是${names[kind]}。`,
            "先确定编码类型，再把位串还原为真值。",
          ),
        ),
      W(
        String(u),
        "unsigned-decode",
        "把有符号字段当成无符号数",
        `无符号读法得到${u}；${names[kind]}最高位为1时表示负数，真值为−${m}。`,
        "不要把最高位当成普通正位权。",
      ),
    ],
  );
}
const encodingSection = (kind) => ({
  id: "int-" + kind,
  title: names[kind] + "的转换",
  foundation:
    "同一位串在不同编码规则下可以表示不同真值。先明确位宽和编码类型，再做转换。",
  takeaway: rules[kind],
  cards: [
    E("int-" + kind + "-explain", "先确认规则，再看位串", [
      rules[kind],
      `例：−5的8位${names[kind]}为${encode(5, kind)}。负数的符号与数值转换不能省略。`,
    ]),
    T("int-" + kind + "-compare", "同一个真值，三种编码", [
      ["编码", "8位表示−5"],
      ["原码", encode(5, "sign")],
      ["反码", encode(5, "ones")],
      ["补码", encode(5, "twos")],
    ]),
  ],
  questions: [
    encodeQuestion("int-" + kind + "-check", 6, kind),
    encodeQuestion("int-" + kind + "-v1", 12, kind),
    decodeQuestion("int-" + kind + "-v2", 19, kind),
  ],
});
function rangeQ(id, n) {
  const limit = 2 ** (n - 1);
  return Q(
    id,
    `${n}位有符号整数采用补码，可表示的真值范围是哪项？`,
    `−${limit}～${limit - 1}`,
    `补码最高位权值为−${limit}，其余位最大和为${limit - 1}；零只有一种编码，所以负端多一个数。`,
    [
      W(
        `−${limit - 1}～${limit - 1}`,
        "sign-range",
        "套用了原码的对称范围",
        "原码和反码有正零、负零，范围对称；补码没有负零，能多表示一个负数。",
        "把全零与最高位为1其余为0分别解码。",
      ),
      W(
        `0～${2 ** n - 1}`,
        "unsigned-range",
        "把位宽当成无符号范围",
        "这是同位宽无符号整数的范围。补码最高位承担负位权。",
        "先确定是否有符号。",
      ),
      W(
        `−${limit}～${limit}`,
        "extra-positive",
        "正端多算了一个值",
        `最大正数最高位为0、其余${n - 1}位全为1，只能到${limit - 1}。`,
        "最大正数写成0后跟全1再求和。",
      ),
    ],
  );
}
const range = {
  id: "int-range",
  title: "补码范围与零",
  foundation: "n个位共有2^n种位串，但有符号解释把它们分配给负数、零和正数。",
  takeaway: "n位补码范围为−2^(n−1)到2^(n−1)−1；零只有一种编码。",
  cards: [
    E("int-range-explain", "为什么负端多一个数", [
      "8位补码从−128到127。00000000表示0，10000000表示−128，01111111表示127。",
      "原码与反码有两种零的编码，8位范围都是−127到127；补码用其中一种位串表示额外的最小负数。",
    ]),
    T("int-range-table", "8位有符号编码比较", [
      ["原码/反码", "−127～127，有两种零"],
      ["补码", "−128～127，只有一种零"],
    ]),
  ],
  questions: [
    rangeQ("int-range-check", 8),
    rangeQ("int-range-v1", 4),
    Q(
      "int-range-v2",
      "8位补码10000000的真值是哪项？",
      "−128",
      "最高位的位权为−128，其余位为0，因此真值是−128。",
      [
        W(
          "负零",
          "negative-zero",
          "误用了原码的负零",
          "10000000在原码中表示负零，但补码中是最小负数−128。",
          "始终把题设“补码”带入解码。",
        ),
        W(
          "128",
          "positive-sign-weight",
          "最高位权值符号错了",
          "128是无符号读法；补码最高位权是−128。",
          "最高位使用负位权，其余位保持正位权。",
        ),
        W(
          "−127",
          "minimum-off-by-one",
          "混淆了原码与补码的下界",
          "−127是8位原码/反码的下界；补码负端多一个数。",
          "用补码位权计算，不套用对称范围。",
        ),
      ],
    ),
  ],
};
const bias = {
  id: "int-bias",
  title: "移码与题设偏置",
  foundation:
    "移码把有符号真值整体平移到非负编码值；必须先读取题目给定的偏置。",
  takeaway:
    "移码编码值=真值+偏置；解码时减偏置。偏置128和IEEE偏置127不能混用。",
  cards: [
    E("int-bias-explain", "先读偏置，再加或减", [
      "本课8位移码明确采用偏置128。真值−5编码为123，即01111011；编码130还原为2。",
      "在此偏置下，移码与同位宽补码的符号位相反。但IEEE单精度指数偏置为127，不能把所有移码都当作偏置128。",
    ]),
    K("int-bias-key", "两个方向", [
      "真值→编码：加题设偏置。",
      "编码→真值：减题设偏置。",
    ]),
  ],
  questions: [
    Q(
      "int-bias-check",
      "8位移码采用偏置128，真值−5的无符号编码值应是多少？",
      "123",
      "−5+128=123。",
      [
        W(
          "133",
          "bias-sign",
          "把负数当成正数来加",
          "133=5+128，编码的是真值+5。",
          "保留真值的负号后再加偏置。",
        ),
        W(
          "122",
          "wrong-bias",
          "套用了偏置127",
          "122=−5+127；题目指定128。",
          "从题干读出偏置，不靠印象选常数。",
        ),
        W(
          "251",
          "two-complement-value",
          "把移码写成补码",
          "251是−5的8位补码无符号读数；移码采用真值加128。",
          "分清移码的加偏置和补码的取反加1。",
        ),
      ],
    ),
    Q(
      "int-bias-v1",
      "字段130采用偏置128的移码，解码后的真值是多少？",
      "2",
      "编码值减偏置：130−128=2。",
      [
        W(
          "258",
          "decode-add-bias",
          "解码时又加了偏置",
          "258=130+128；解码必须撤销编码时的平移。",
          "编码加，解码减。",
        ),
        W(
          "3",
          "decode-wrong-bias",
          "减去了错误偏置",
          "3=130−127，题目偏置为128。",
          "先确认偏置再相减。",
        ),
        W(
          "−126",
          "decode-as-twos",
          "把移码读成了补码",
          "130−256=−126是8位补码读法；移码要减128。",
          "编码类型与位宽同时核对。",
        ),
      ],
    ),
    Q(
      "int-bias-v2",
      "某格式明确采用偏置127，真值−5的编码值是多少？",
      "122",
      "−5+127=122；偏置取自本题，不能沿用上一题的128。",
      [
        W(
          "123",
          "fixed-128",
          "把偏置固定成了128",
          "123使用了128，忽略本题的127。",
          "每道题重新圈出偏置。",
        ),
        W(
          "132",
          "bias-absolute-value",
          "误把−5取了绝对值",
          "132=5+127；移码不是绝对值编码。",
          "真值参与加法时保留正负号。",
        ),
        W(
          "−132",
          "bias-subtract",
          "编码方向做反了",
          "−132=−5−127；编码时应加偏置。",
          "先写编码=真值+偏置再代入。",
        ),
      ],
    ),
  ],
};
function overflowQ(id, a, b) {
  const sum = a + b,
    raw = ((sum % 256) + 256) % 256,
    signed = raw >= 128 ? raw - 256 : raw,
    over = sum < -128 || sum > 127;
  return Q(
    id,
    `8位补码进行${a}+(${b})，保留8位结果。哪项判断正确？`,
    `${signed}，${over ? "发生" : "未发生"}有符号溢出`,
    `数学和为${sum}，8位结果${bits(raw)}按补码解释为${signed}。${over ? "数学和超出−128～127，发生有符号溢出。" : "数学和在−128～127内，没有有符号溢出。"}`,
    [
      W(
        `${signed}，${over ? "未发生" : "发生"}有符号溢出`,
        "overflow-condition",
        "溢出判断与范围不符",
        `位串能存下来不代表数学结果正确；应把数学和${sum}与−128～127比较。`,
        "先算数学和，再判断能否用8位补码表示。",
      ),
      W(
        `${sum}，无溢出且可用8位直接保存`,
        "overflow-width",
        "忽略了固定的8位范围",
        `数学和${sum}超出了−128～127，不能在8位补码中直接保存；实际保留位串表示${signed}。`,
        "先检查数学和是否在题设位宽范围内。",
      ),
      W(
        "只看最高位的进位就能判断",
        "carry-as-overflow",
        "把进位等同于有符号溢出",
        "最终进位用于无符号范围判断。补码加法看两个操作数是否同号而结果异号；也可比较进入、离开符号位的两个进位。",
        "用同号相加、结果异号判断，或将两个符号位进位异或。",
      ),
    ],
  );
}
const overflow = {
  id: "int-overflow",
  title: "加法溢出与符号扩展",
  foundation:
    "固定8位只保留最低8位。位串回绕与数学运算结果是否可表示，需要分别检查。",
  takeaway:
    "补码同号相加结果异号表示溢出；异号相加不溢出。扩大位宽时复制原符号位。",
  cards: [
    E("int-overflow-explain", "位串结果不等于数学结果", [
      "90+50=140，超过8位补码最大值127，保留8位得到10001100，解释为−116；因此有符号溢出。",
      "−1+1=0没有有符号溢出，尽管位加法可产生最高位进位。不能只看最终进位。",
    ]),
    K("int-overflow-key", "扩大位宽不改变真值", [
      "8位11110110表示−10。扩为16位时左侧复制8个1：1111111111110110。",
      "左侧补0会改变负数的真值；正数符号位为0，符号扩展时才补0。",
    ]),
  ],
  questions: [
    overflowQ("int-overflow-check", 100, 60),
    overflowQ("int-overflow-v1", -100, -50),
    Q(
      "int-overflow-v2",
      "8位补码11110110表示−10，保持真值扩展为16位，应得到哪项？",
      "1111111111110110",
      "补码扩位复制原最高位。最高位为1，左侧补8个1，仍表示−10。",
      [
        W(
          "0000000011110110",
          "zero-extension",
          "把负补码做了零扩展",
          "这表示正246，改变了原来的−10。",
          "补码符号扩展复制最高位。",
        ),
        W(
          "1000000011110110",
          "sign-only-one",
          "只补了一个符号1",
          "新增的全部高位都要复制原符号位；只放一个1会改变位权和真值。",
          "新增8位都写1。",
        ),
        W(
          "1111111100001010",
          "absolute-extension",
          "扩展前误取了绝对值",
          "低8位必须保持原来的11110110；扩位不是重新编码绝对值10。",
          "保留原位串，再填新增高位。",
        ),
      ],
    ),
  ],
};
export const integers = pack(
  "network-engineer:01.01.02",
  "原码、反码、补码与移码",
  [
    encodingSection("sign"),
    encodingSection("ones"),
    encodingSection("twos"),
    range,
    bias,
    overflow,
  ],
  [
    { title: "考匠已审核课程 · 数制与编码", path: "network-engineer:01.01.02" },
    {
      title: "Cornell CS3410 · 有符号整数",
      url: "https://www.cs.cornell.edu/courses/cs3410/2025fa/notes/numbers.html",
    },
  ],
  "a392357d4f09acbe314f",
);

integers.course.version = "20261012-v2";
