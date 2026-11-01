// Reviewed correction revisions shared by interactive lessons and demo export.
// Original published lesson packages and their independent reviews remain unchanged.
export const pcmNodeId = "network-engineer:02.02.05";
export const pcmOriginalVersion = "f6da3eae529751850ab3";
export const pcmCorrectedVersion = pcmOriginalVersion + "-demo-pcm-r1";
export const ipv4OriginalVersions = {
  "network-engineer:02.03.01": "be16e6cdbe1b64981099",
  "network-engineer:02.03.02": "bd9425374e6729eb3350",
};
export const ipv4CorrectedVersions = Object.fromEntries(
  Object.entries(ipv4OriginalVersions).map(([id, version]) => [
    id,
    version + "-demo-ipv4-r1",
  ]),
);
export const subnetOriginalVersions = {
  "network-engineer:02.03.03": "3fd21c407a8f41168902",
  "network-engineer:02.03.04": "229a57c6b2178b8df359",
};
export const subnetCorrectedVersions = Object.fromEntries(
  Object.entries(subnetOriginalVersions).map(([id, v]) => [
    id,
    v + "-demo-subnet-r1",
  ]),
);
function correctSubnetLesson(node) {
  const v = subnetCorrectedVersions[node.id],
    old = subnetOriginalVersions[node.id];
  if (![v, old].includes(node.version))
    throw new Error("子网来源版本变化，必须重新审核演示修订");
  if (node.version === v) return structuredClone(node);
  const isVlsm = node.id.endsWith("03");
  const expected = isVlsm
    ? "主机数需求决定主机位：可用主机数约为2^h-2，h为前缀之外的主机位数。"
    : "路由聚合要求被汇总的多个前缀在二进制上连续且能由同一更短前缀覆盖，合并后得到超网。";
  if (
    node.lesson.points[isVlsm ? 0 : 2] !== expected ||
    node.questions.length !== 6 ||
    !["q1", "q2", "q3", "q4", "q5", "q6"].every((id) =>
      node.questions.some((q) => q.id === id),
    )
  )
    throw new Error("子网源内容或练习结构变化，必须重新审核");
  const n = structuredClone(node),
    q = (id) => n.questions.find((q) => q.id === id);
  n.version = v;
  if (isVlsm) {
    n.lesson.points[0] =
      "普通IPv4多访问子网且主机位至少2位时，可分配数量为2^h−2。先说明需求是否含网关和预留，再找最小足够h；地址块最小对应最长可行前缀32−h，不是数值最小的前缀长度。";
    n.lesson.points[2] +=
      " 常用大块优先策略，但仍须检查对齐、父块包含、不重叠和剩余容量；不把该策略当作任意碎片布局一定成功的证明。";
    q("q2").stem = "普通IPv4多访问子网，不另扣网关，" + q("q2").stem;
    q("q4").stem =
      "普通IPv4多访问子网需要至少50个可分配主机地址，需求含网关且不另预留；满足需求且地址块最小的最长可行前缀是/{{b1}}。";
    q("q4").explanation +=
      "/26是本题最长可行前缀，对应最小足够块；不要把它称为数值最小的前缀长度。";
    q("q5").stem =
      "普通多访问子网，需求含网关且不另预留，按地址递增选择第一个可用位置。" +
      q("q5").stem;
  } else {
    n.lesson.points[2] =
      "精确聚合要求原地址并集恰好填满一个规范对齐的父块；仅相邻不充分，混合前缀可逐级合并。最小单一覆盖可能多包含地址，必须与精确合并区分；实际发布还需拓扑、策略及空洞处理。";
    n.lesson.pitfall =
      "相邻前缀也可能跨父块边界。没有单一精确汇总时可保留多条前缀；允许覆盖超集时仍须评估额外地址与丢弃兜底。转发先筛出匹配项，再选择最长前缀。";
    q("q3").stem =
      "把地址并集恰好填满同一对齐父块的多个前缀精确合并为一个更短前缀的过程称为{{b1}}。";
    q("q4").stem =
      "精确合并时，多个子块的地址集合必须{{b1}}、按父块边界对齐并恰好填满该父块，不能有空洞或额外覆盖。";
    q("q4").explanation =
      "连续只是必要条件之一；还需规范对齐并恰好填满父块。混合长度的原始前缀可逐级合并。";
    q("q4").hint = "先看是否有空洞，再检查父块对齐与覆盖总量。";
    q("q6").explanation =
      "未评估的超集聚合可能覆盖未授权或不可达地址，造成错误转发或环路；允许额外覆盖不等于精确聚合，需明确拓扑、策略和空洞丢弃兜底。";
  }
  return n;
}
function correctIPv4Lesson(node) {
  const original = ipv4OriginalVersions[node.id],
    version = ipv4CorrectedVersions[node.id];
  if (![original, version].includes(node.version))
    throw new Error("IPv4来源版本变化，必须重新审核演示修订");
  if (node.version === version) return structuredClone(node);
  const address = node.id === "network-engineer:02.03.01";
  const expected = address
    ? "给定掩码时，网络地址由IP与掩码按位与得到，广播地址为主机位全1，可用主机地址范围介于两者之间。"
    : "可用主机地址是网络地址加一到广播地址减一，数量为块大小减二";
  if (
    node.lesson.points[2] !== expected ||
    node.questions.length !== 6 ||
    !["q1", "q2", "q3", "q4", "q5", "q6"].every((id) =>
      node.questions.some((q) => q.id === id),
    )
  )
    throw new Error("IPv4源内容或练习结构变化，必须重新审核");
  const n = structuredClone(node),
    q = (id) => n.questions.find((item) => item.id === id);
  n.version = version;
  if (address) {
    n.lesson.points[0] =
      "历史有类编址按首字节高位区分A/B/C单播、D类组播和E类保留；0/8、127/8及受限广播另有特殊用途。实际网络边界按明确的CIDR前缀，不由历史默认掩码决定。";
    n.lesson.points[2] =
      "网络地址是IP与连续掩码按位与。普通多访问子网且至少2个主机位时，定向广播为主机位全1，可分配范围介于两者之间；点到点/31和/32另按其语境处理。";
    for (const id of ["q1", "q6"]) {
      q(id).stem = "按历史有类编址，" + q(id).stem;
      q(id).explanation +=
        "这是历史默认值，实际网络计算须使用明确给定的前缀或掩码。";
    }
    q("q3").explanation +=
      "是否启用该回退机制取决于系统配置；RFC3927动态选址只选169.254.1.0至169.254.254.255，并进行冲突探测。";
  } else {
    n.lesson.points[1] =
      "普通IPv4多访问子网的定向广播地址是本块最后一个地址，即下一子网起点减一；点到点/31不套这一广播解释。";
    n.lesson.points[2] =
      "普通多访问子网且至少2个主机位时，可分配范围为网络地址加一到广播地址减一，共2^h−2个。支持RFC3021的点到点/31有两个端点，/32主机路由覆盖一个地址。";
    n.lesson.pitfall =
      "先读链路和前缀条件，再决定是否扣网络与广播。普通多访问子网不能分配这两个边界地址，但不能把减2公式无条件套在点到点/31或/32上。";
    for (const id of ["q1", "q2", "q3"]) {
      q(id).stem = "普通IPv4多访问子网，主机位至少2位，" + q(id).stem;
      q(id).explanation +=
        "这里限定普通多访问子网，不包括RFC3021点到点/31或/32主机路由。";
    }
  }
  return n;
}
export function correctHomeBlueLesson(node) {
  if (subnetOriginalVersions[node.id]) return correctSubnetLesson(node);
  if (ipv4OriginalVersions[node.id]) return correctIPv4Lesson(node);
  if (node.id !== pcmNodeId) return node;
  if (![pcmOriginalVersion, pcmCorrectedVersion].includes(node.version))
    throw new Error("PCM来源版本变化，必须重新审核演示修订");
  const corrected = structuredClone(node);
  if (
    node.version === pcmOriginalVersion &&
    node.lesson.points[0] !==
      "采样定理：为无失真恢复原信号，采样频率应不低于信号最高频率的两倍，该下限称为奈奎斯特频率。"
  )
    throw new Error("PCM源内容变化，必须重新审核演示修订");
  if (
    corrected.questions.length !== 6 ||
    !["q1", "q2", "q3", "q4", "q5", "q6"].every((id) =>
      corrected.questions.some((q) => q.id === id),
    )
  )
    throw new Error("PCM练习结构变化，必须重新审核");
  corrected.version = pcmCorrectedVersion;
  corrected.lesson.points[0] =
    "基带带限信号的奈奎斯特速率为2fmax；给定采样率fs的奈奎斯特频率为fs/2。为避免临界频率与相位等问题，通常取fs>2fmax并给实际滤波器留余量。";
  corrected.lesson.example =
    "基带信号最高频率为3kHz，其奈奎斯特速率为6kHz；若选8kHz采样，采样器的奈奎斯特频率为4kHz。采样前进行抗混叠低通滤波，再对样值量化、编码。";
  corrected.lesson.pitfall =
    "不要把2fmax的奈奎斯特速率与fs/2的奈奎斯特频率混为一谈；等号处不是任意信号相位的恢复保证。采样前滤波用于抗混叠，量化则产生幅度近似误差。";
  const q = (id) => corrected.questions.find((q) => q.id === id);
  q("q1").stem = "基带带限信号最高频率为fmax时，奈奎斯特速率为fmax的{{b1}}。";
  q("q1").blanks[0].label = "奈奎斯特速率与最高频率的关系";
  q("q1").explanation =
    "奈奎斯特速率为2fmax；给定采样率fs的奈奎斯特频率为fs/2。这两个术语不能互换；实际通常采用高于该速率的采样并留出滤波器余量。";
  q("q1").hint = "本题问信号决定的速率，不是采样器频率上限。";
  q("q4").stem =
    "针对基带采样，为抑制输入中会混叠进目标频带的高频分量，通常在ADC采样前使用{{b1}}滤波器。";
  q("q4").explanation =
    "基带采样的抗混叠低通滤波器在ADC之前衰减不需要的高频分量，并给实际滤波器过渡带留余量；采样后通常无法区分已经重叠的频率来源。";
  q("q5").stem =
    "某基带带限信号最高频率为4kHz，该信号的奈奎斯特速率为{{b1}}kHz。";
  q("q5").blanks[0].label = "该信号的奈奎斯特速率";
  q("q5").explanation =
    "奈奎斯特速率=2×4kHz=8kHz；这不是“采样器的奈奎斯特频率”，也不是任意边界信号在恰好8kHz时必可恢复的承诺。";
  return corrected;
}
