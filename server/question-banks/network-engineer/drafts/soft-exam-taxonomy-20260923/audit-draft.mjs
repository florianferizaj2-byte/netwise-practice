import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const draftRoot = path.dirname(fileURLToPath(import.meta.url));
const certRoot = path.resolve(draftRoot, '..', '..');
const questionsRoot = path.join(draftRoot, 'questions');
const categoryFiles = fs.readdirSync(questionsRoot).filter((name) => name.endsWith('.json')).sort();
const chapters = {
  '计算机基础知识': ['数制与编码', '校验码', '存储器与可靠性', '计算机组成', '操作系统'],
  '网络体系结构与 TCP/IP': ['网络模型', '数据通信与传输', 'IPv4 与子网', '网际层协议', '传输层', '应用层协议与端口', 'IPv6'],
  '局域网与交换技术': ['以太网', 'VLAN', 'STP', '交换安全与管理', '无线局域网'],
  '路由与广域网': ['路由基础', 'RIP', 'OSPF', 'BGP', '广域网链路'],
  '网络安全': ['密码技术与摘要算法', 'PKI、数字证书与吊销', '访问控制与地址转换', '防火墙、DMZ、IDS/IPS', '网络攻击与防护', 'VPN：IPsec、SSL VPN'],
  '服务器配置': ['Windows', 'Linux'],
  '网络管理': ['网络管理五大功能', 'SNMP、MIB 与版本', '故障排查工具', '日志与远程管理'],
  '综合布线与网络规划': ['综合布线子系统', '双绞线与光纤', '带宽、时延、丢包率、吞吐量'],
  '项目管理与法律法规': ['CPM、PERT、甘特图', '风险、质量与配置管理', '网络安全、数据安全、知识产权与等保'],
  '新技术': ['SDN 与 NFV', '云计算与容器', '5G 与 NB-IoT'],
};

const drafts = categoryFiles.flatMap((file) => JSON.parse(fs.readFileSync(path.join(questionsRoot, file), 'utf8')));
const activeFiles = [
  path.join(certRoot, 'questions', 'original.json'),
  ...fs.readdirSync(path.join(certRoot, 'questions', 'user-collection'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(certRoot, 'questions', 'user-collection', name)),
];
const existing = activeFiles.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')));

const errors = [];
const pointCounts = new Map();
const ids = new Set();
for (const q of drafts) {
  if (ids.has(q.id)) errors.push(`重复草稿 ID: ${q.id}`);
  ids.add(q.id);
  if (q.type !== 'single_choice') errors.push(`${q.id}: 非单选题`);
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) errors.push(`${q.id}: 难度字段非法`);
  if (!q.question || !q.analysis || q.analysis.length < 12) errors.push(`${q.id}: 缺题干或解析过短`);
  if (!['A', 'B', 'C', 'D'].every((key) => typeof q.options?.[key] === 'string')) errors.push(`${q.id}: A-D 选项不完整`);
  if (new Set(Object.values(q.options ?? {}).map((option) => option.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))).size !== 4) errors.push(`${q.id}: 选项内容有重复`);
  if (q.answer?.length !== 1 || !['A', 'B', 'C', 'D'].includes(q.answer[0])) errors.push(`${q.id}: 答案结构非法`);
  if (!chapters[q.chapter]?.includes(q.knowledgePoint)) errors.push(`${q.id}: 分类不在用户新分类清单中`);
  if (!q.tags?.includes(q.knowledgePoint)) errors.push(`${q.id}: 缺知识点标签`);
  const key = `${q.chapter}\t${q.knowledgePoint}`;
  pointCounts.set(key, (pointCounts.get(key) ?? 0) + 1);
}
for (const [chapter, points] of Object.entries(chapters)) {
  for (const point of points) {
    const count = pointCounts.get(`${chapter}\t${point}`) ?? 0;
    if (count !== 10) errors.push(`${chapter} / ${point}: ${count} 题，期望 10 题`);
  }
}
for (const q of existing) {
  if (ids.has(q.id)) errors.push(`与现有题库 ID 冲突: ${q.id}`);
}

const normalize = (value) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const exactMap = new Map();
for (const q of existing) {
  const key = normalize(q.question ?? '');
  if (key) exactMap.set(key, q);
}
const exactDuplicates = drafts.flatMap((q) => {
  const found = exactMap.get(normalize(q.question));
  return found ? [{ draftId: q.id, existingId: found.id, question: q.question }] : [];
});
const draftQuestionMap = new Map();
const internalExactDuplicates = [];
for (const q of drafts) {
  const key = normalize(q.question);
  const previous = draftQuestionMap.get(key);
  if (previous) internalExactDuplicates.push({ draftId: q.id, otherDraftId: previous.id, question: q.question });
  else draftQuestionMap.set(key, q);
}

const docs = [...drafts, ...existing].map((q) => normalize(q.question ?? ''));
const grams = (text) => {
  const out = new Map();
  for (const n of [2, 3]) {
    for (let i = 0; i + n <= text.length; i++) {
      const gram = `${n}:${text.slice(i, i + n)}`;
      out.set(gram, (out.get(gram) ?? 0) + 1);
    }
  }
  return out;
};
const features = docs.map(grams);
const df = new Map();
for (const vector of features) for (const gram of vector.keys()) df.set(gram, (df.get(gram) ?? 0) + 1);
const total = features.length;
const idf = (gram) => Math.log(1 + total / (1 + (df.get(gram) ?? 0)));
const weighted = features.map((vector) => {
  const out = new Map();
  let norm = 0;
  for (const [gram, count] of vector) {
    const value = (1 + Math.log(count)) * idf(gram);
    out.set(gram, value);
    norm += value * value;
  }
  return { values: out, norm: Math.sqrt(norm) || 1 };
});
const nearReviewNotes = {
  'ne-draft-20260923-053': '与旧题仅共享 TCP/IP 协议栈背景；本题考端口号与传输层复用，旧题考 ARP 地址解析，考点与答案均不同。',
  'ne-draft-20260923-088': '与旧题共享“主要作用”措辞；本题问 ICMP 的网络层差错报告与诊断，旧题问 ARP 的 IPv4 地址解析，协议和考查结论不同。',
  'ne-draft-20260923-094': '本题问 TCP 首部的最小长度；旧题问以太网帧长度下限，协议层次、单位语境和结论不同。',
  'ne-draft-20260923-107': '相似处只是 HTTP 状态码问法；本题的 401 表示缺少有效认证凭据，旧题的 404 表示目标资源未找到。',
  'ne-draft-20260923-113': '本题问 IPv6 全零地址 :: 的未指定地址含义；旧题讨论双冒号压缩地址表示语法，语义不同。',
  'ne-draft-20260923-123': '本题考 VLAN 划分广播域；旧题考 SVI 作为三层网关的用途，虽都涉及 VLAN，网络行为不同。',
  'ne-draft-20260923-133': '本题考 VID=0 的优先级标签语义；旧题考 VLAN ID 字段宽度，字段取值含义与字段长度是不同知识点。',
  'ne-draft-20260923-219': '相似处是“主要目的”句式；本题考 PPP 多链路捆绑，旧题考 STP 防环，技术目标不同。',
  'ne-draft-20260923-313': '本题考 SNMPv1/v2c community 明文共享口令的安全局限；旧题考 SNMPv3 安全增强，题目对象和所问结论不同。',
  'ne-draft-20260923-397': '两题都属于网络安全法规领域；本题区分数据分类分级保护与网络安全等级保护制度，旧题问等保制度本身，法律概念有关联但不等同。',
  'ne-draft-20260923-425': '相似处仅是“主要目的”问法；本题考 5G 切片提供逻辑隔离的差异化网络能力，旧题考 STP 消除二层环路。'
};
const nearReviewCandidates = [];
const nearDuplicates = [];
for (let i = 0; i < drafts.length; i++) {
  let best = null;
  for (let j = drafts.length; j < total; j++) {
    const a = weighted[i];
    const b = weighted[j];
    const [small, large] = a.values.size < b.values.size ? [a.values, b.values] : [b.values, a.values];
    let dot = 0;
    for (const [gram, value] of small) dot += value * (large.get(gram) ?? 0);
    const score = dot / (a.norm * b.norm);
    if (!best || score > best.score) best = { score, q: existing[j - drafts.length] };
  }
  if (best?.score >= 0.28) {
    const candidate = { draftId: drafts[i].id, similarity: Number(best.score.toFixed(3)), existingId: best.q.id, chapter: best.q.chapter, knowledgePoint: best.q.knowledgePoint, question: drafts[i].question, existingQuestion: best.q.question };
    const note = nearReviewNotes[drafts[i].id];
    nearReviewCandidates.push({ ...candidate, reviewStatus: note ? 'reviewed_distinct' : 'unresolved', reviewNote: note ?? null });
    if (best.score >= 0.35) nearDuplicates.push(candidate);
  }
}
const internalNearDuplicates = [];
for (let i = 0; i < drafts.length; i++) {
  let best = null;
  for (let j = i + 1; j < drafts.length; j++) {
    const a = weighted[i];
    const b = weighted[j];
    const [small, large] = a.values.size < b.values.size ? [a.values, b.values] : [b.values, a.values];
    let dot = 0;
    for (const [gram, value] of small) dot += value * (large.get(gram) ?? 0);
    const score = dot / (a.norm * b.norm);
    if (!best || score > best.score) best = { score, q: drafts[j] };
  }
  if (best?.score >= 0.45) internalNearDuplicates.push({ draftId: drafts[i].id, similarity: Number(best.score.toFixed(3)), otherDraftId: best.q.id, question: drafts[i].question, otherQuestion: best.q.question });
}

const categoryCounts = Object.fromEntries(Object.entries(chapters).map(([chapter, points]) => [chapter, points.reduce((sum, point) => sum + (pointCounts.get(`${chapter}\t${point}`) ?? 0), 0)]));
const answerByPoint = new Map();
const answerTotals = { A: 0, B: 0, C: 0, D: 0 };
for (const q of drafts) {
  const key = `${q.chapter}\t${q.knowledgePoint}`;
  const counts = answerByPoint.get(key) ?? { A: 0, B: 0, C: 0, D: 0 };
  if (q.answer?.length === 1 && answerTotals[q.answer[0]] !== undefined) {
    counts[q.answer[0]]++;
    answerTotals[q.answer[0]]++;
  }
  answerByPoint.set(key, counts);
}
const expectedAnswerCounts = { A: 3, B: 3, C: 2, D: 2 };
for (const [key, counts] of answerByPoint) {
  if (Object.keys(expectedAnswerCounts).some((letter) => counts[letter] !== expectedAnswerCounts[letter])) errors.push(`${key.replace('\t', ' / ')}: 答案位置分布不符合 A3/B3/C2/D2`);
}
const unresolvedNearDuplicates = nearReviewCandidates.filter((candidate) => candidate.reviewStatus !== 'reviewed_distinct');
const report = {
  reviewedAt: '2026-09-23',
  status: errors.length || exactDuplicates.length || internalExactDuplicates.length || unresolvedNearDuplicates.length || internalNearDuplicates.length ? 'needs_review' : 'passed',
  draftCount: drafts.length,
  existingCount: existing.length,
  existingSources: { original: 47, userCollection: 443 },
  categoryCount: Object.keys(chapters).length,
  knowledgePointCount: Object.values(chapters).flat().length,
  perCategory: categoryCounts,
  perKnowledgePoint: [...pointCounts].map(([key, count]) => ({ category: key.split('\t')[0], knowledgePoint: key.split('\t')[1], count })),
  schemaAndCoverageErrors: errors,
  exactDuplicateCount: exactDuplicates.length,
  exactDuplicates,
  internalExactDuplicateCount: internalExactDuplicates.length,
  internalExactDuplicates,
  nearDuplicateThreshold: 0.35,
  nearDuplicateCandidateCount: nearDuplicates.length,
  nearDuplicates,
  manuallyReviewedNearCandidateThreshold: 0.28,
  manuallyReviewedNearCandidateCount: nearReviewCandidates.length,
  reviewedNearCandidates: nearReviewCandidates,
  unresolvedNearDuplicateCount: unresolvedNearDuplicates.length,
  answerPositionDistribution: { total: answerTotals, perKnowledgePointTarget: expectedAnswerCounts },
  internalNearDuplicateThreshold: 0.45,
  internalNearDuplicateCandidateCount: internalNearDuplicates.length,
  internalNearDuplicates,
  contentReview: {
    pass: 'Single correct answer, distractors, explanation logic, topic fit, key calculations and current standards/law were reviewed while drafting and in a separate pass.',
    sources: [
      { name: 'RFC Editor: TCP RFC 9293', url: 'https://www.rfc-editor.org/rfc/rfc9293.html' },
      { name: 'RFC Editor: IPv6 RFC 8200', url: 'https://www.rfc-editor.org/rfc/rfc8200.html' },
      { name: 'RFC Editor: IPv4 RFC 791', url: 'https://www.rfc-editor.org/rfc/rfc791.html' },
      { name: 'RFC Editor: ARP RFC 826', url: 'https://www.rfc-editor.org/rfc/rfc826.html' },
      { name: 'RFC Editor: ICMP RFC 792', url: 'https://www.rfc-editor.org/rfc/rfc792.html' },
      { name: 'RFC Editor: UDP RFC 768', url: 'https://www.rfc-editor.org/rfc/rfc768.html' },
      { name: 'RFC Editor: OSPFv2 RFC 2328', url: 'https://www.rfc-editor.org/info/rfc2328/' },
      { name: 'RFC Editor: OSPF NSSA RFC 1587', url: 'https://www.rfc-editor.org/rfc/rfc1587.html' },
      { name: 'RFC Editor: RIP v2 RFC 2453', url: 'https://www.rfc-editor.org/info/rfc2453/' },
      { name: 'RFC Editor: BGP-4 RFC 4271', url: 'https://www.rfc-editor.org/info/rfc4271/' },
      { name: 'RFC Editor: PPP RFC 1661', url: 'https://www.rfc-editor.org/info/rfc1661/' },
      { name: 'RFC Editor: DHCP RFC 2131', url: 'https://www.rfc-editor.org/info/rfc2131/' },
      { name: 'RFC Editor: IPv4 point-to-point /31 RFC 3021', url: 'https://www.rfc-editor.org/info/rfc3021/' },
      { name: 'RFC Editor: DHCP Relay Agent Information Option RFC 3046', url: 'https://www.rfc-editor.org/info/rfc3046/' },
      { name: 'RFC Editor: IP Encapsulating Security Payload RFC 4303', url: 'https://www.rfc-editor.org/rfc/rfc4303.html' },
      { name: 'RFC Editor: Negative DNS Caching RFC 2308', url: 'https://www.rfc-editor.org/info/rfc2308/' },
      { name: 'RFC Editor: Message Submission RFC 6409', url: 'https://www.rfc-editor.org/info/rfc6409/' },
      { name: 'RFC Editor: HTTP Semantics RFC 9110', url: 'https://www.rfc-editor.org/rfc/rfc9110.html' },
      { name: 'Wi-Fi Alliance: WPA3-Personal certification record including SAE', url: 'https://api.cert.wi-fi.org/api/certificate/download/public?variantId=139865' },
      { name: 'NPC: Cybersecurity Law amendment decision, effective 2026-01-01', url: 'https://www.npc.gov.cn/npc/c1773/c1848/c21114/wlaqfxz/wlaqfxz002/202511/t20251103_449242.html' },
      { name: 'NPC: Personal Information Protection Law', url: 'https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html' },
      { name: 'NPC: Data Security Law', url: 'https://www.npc.gov.cn/npc/c2/c30834/202106/t20210610_311888.html' },
      { name: 'SAMR: GB/T 22239-2019 current status', url: 'https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=BAFB47E8874764186BDB7865E8344DAF' },
      { name: 'NPC: Computer Software Protection Regulation', url: 'https://www.npc.gov.cn/WZWSREL3pncmR3Ly9ucGMvL2h1aXlpL2xmenQvcXF6cmZjYS8yMDA4LTEyLzIxL2NvbnRlbnRfMTQ2Mjg2NC5odG0=' }
    ]
  }
};
const serializedReport = JSON.stringify(report, null, 2);
fs.writeFileSync(path.join(draftRoot, 'review-record.json'), `${serializedReport}\n`, 'utf8');
console.log(serializedReport);
