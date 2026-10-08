import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const draftRoot = path.dirname(fileURLToPath(import.meta.url));
const bankRoot = path.resolve(draftRoot, '..', '..');
const manifestPath = path.join(bankRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const questionRoot = path.join(draftRoot, 'questions');
const draftQuestions = fs.readdirSync(questionRoot)
  .filter((name) => name.endsWith('.json'))
  .flatMap((name) => JSON.parse(fs.readFileSync(path.join(questionRoot, name), 'utf8')))
  .sort((a, b) => Number(a.id.slice(-3)) - Number(b.id.slice(-3)));

const targetByCode = new Map();
for (const module of manifest.taxonomy.modules) {
  for (const section of module.sections) {
    for (const point of section.knowledgePoints) {
      targetByCode.set(point.code, {
        chapter: module.name,
        knowledgeSection: section.name,
        knowledgePoint: point.name,
        point,
      });
    }
  }
}

const run = (code, count) => Array.from({ length: count }, () => code);
const runs = (...segments) => segments.flatMap(([code, count]) => run(code, count));
const targetCodesByGroup = [
  ['数制与编码', runs(['01.01.01', 2], ['01.01.02', 5], ['01.01.01', 2], ['01.01.02', 1])],
  ['校验码', ['01.02.01', '01.02.02', '01.02.02', '01.02.03', '01.02.03', '01.02.01', '01.02.01', '01.02.02', '01.02.01', '01.02.03']],
  ['存储器与可靠性', runs(['01.03.01', 3], ['01.03.02', 3], ['01.03.04', 2], ['01.03.02', 2])],
  ['计算机组成', runs(['01.04.01', 5], ['01.04.02', 5])],
  ['操作系统', ['01.05.01', '01.05.01', '01.05.01', '01.05.01', '01.05.02', '01.05.02', '01.05.02', '01.05.02', '01.05.02', '01.05.01']],
  ['网络模型', ['02.01.03', '02.01.03', '02.05.04', '03.01.03', '02.05.04', '02.01.02', '02.05.01', '02.01.01', '02.01.01', '02.01.03']],
  ['数据通信与传输', ['02.02.05', '02.02.03', '02.02.01', '02.02.03', '02.02.02', '02.02.02', '02.02.02', '02.02.02', '02.02.04', '02.02.01']],
  ['IPv4 与子网', ['02.03.01', '02.03.02', '02.03.02', '02.03.01', '02.03.05', '02.03.02', '02.03.05', '02.03.05', '02.03.04', '02.03.03']],
  ['网际层协议', ['02.04.01', '02.04.01', '02.04.01', '02.04.02', '02.04.02', '02.04.02', '02.04.01', '02.04.02', '02.04.01', '02.04.02']],
  ['传输层', ['02.05.01', '02.05.02', '02.05.02', '02.05.01', '02.05.03', '02.05.01', '02.05.01', '02.05.02', '02.05.04', '02.05.01']],
  ['应用层协议与端口', ['02.06.01', '02.06.01', '02.06.01', '02.06.02', '02.06.04', '02.06.05', '02.06.03', '02.06.03', '02.06.02', '02.06.03']],
  ['IPv6', ['02.07.01', '02.07.01', '02.07.01', '02.07.01', '02.07.01', '02.07.01', '02.07.03', '02.07.03', '02.07.01', '02.07.01']],
  ['以太网', ['03.01.01', '03.01.01', '03.01.02', '03.01.01', '03.01.01', '03.01.03', '03.01.03', '03.01.03', '03.01.01', '03.01.01']],
  ['VLAN', ['03.02.01', '03.02.01', '03.02.01', '03.02.02', '03.02.02', '03.02.02', '03.04.02', '03.02.02', '03.02.02', '03.02.02']],
  ['STP', ['03.03.02', '03.03.02', '03.03.02', '03.03.02', '03.03.02', '03.03.02', '03.03.03', '03.03.03', '03.03.03', '03.03.03']],
  ['交换安全与管理', ['03.04.02', '03.04.02', '03.04.02', '03.04.02', '03.04.02', '03.04.01', '03.04.02', '03.04.02', '03.04.02', '03.01.02']],
  ['无线局域网', ['03.05.01', '03.05.01', '03.05.02', '03.05.02', '05.07.01', '03.05.01', '03.05.02', '03.05.02', '03.05.01', '03.05.01']],
  ['路由基础', ['04.01.01', '04.01.01', '04.01.02', '04.01.01', '04.01.02', '04.01.01', '04.01.01', '04.01.01', '04.01.03', '04.01.02']],
  ['RIP', ['04.02.01', '04.02.01', '04.02.01', '04.02.02', '04.02.02', '04.02.01', '04.02.01', '04.02.01', '04.02.01', '04.02.02']],
  ['OSPF', ['04.03.01', '04.03.01', '04.03.01', '04.03.01', '04.03.01', '04.03.01', '04.03.01', '04.03.01', '04.03.02', '04.03.01']],
  ['BGP', ['04.04.02', '04.04.02', '04.04.02', '04.04.01', '04.04.01', '04.04.02', '04.04.01', '04.04.02', '04.04.02', '04.04.02']],
  ['广域网链路', run('04.05.01', 10)],
  ['密码技术与摘要算法', ['05.01.01', '05.01.02', '05.01.02', '05.01.02', '05.02.01', '05.01.02', '05.02.01', '05.01.01', '05.01.03', '05.02.01']],
  ['PKI、数字证书与吊销', ['05.02.01', '05.02.02', '05.02.02', '05.02.02', '05.02.02', '05.02.01', '05.02.02', '05.02.02', '05.02.02', '05.02.02']],
  ['访问控制与地址转换', ['05.03.01', '05.03.01', '05.03.02', '05.03.02', '05.03.01', '05.03.02', '05.04.01', '05.03.02', '05.06.01', '05.03.01']],
  ['防火墙、DMZ、IDS/IPS', ['05.04.01', '05.04.02', '05.04.02', '05.05.03', '05.04.01', '05.04.01', '05.04.01', '05.04.01', '05.04.03', '05.04.01']],
  ['网络攻击与防护', ['05.05.03', '05.05.02', '05.05.02', '03.04.02', '05.05.03', '05.05.02', '05.04.03', '05.04.03', '05.05.03', '05.05.03']],
  ['VPN：IPsec、SSL VPN', ['05.06.01', '05.06.01', '05.06.01', '05.06.01', '05.06.01', '05.06.01', '05.06.01', '05.06.02', '05.06.01', '05.06.01']],
  ['Windows', ['06.01.01', '06.01.02', '06.01.01', '06.01.03', '06.01.02', '06.01.01', '06.01.03', '06.01.03', '06.01.03', '06.01.02']],
  ['Linux', ['06.02.02', '06.02.03', '06.02.01', '06.02.01', '06.02.02', '06.02.02', '06.02.03', '06.02.03', '06.02.02', '06.02.03']],
  ['网络管理五大功能', run('07.01.01', 10)],
  ['SNMP、MIB 与版本', run('07.02.01', 10)],
  ['故障排查工具', ['07.03.02', '07.03.02', '07.03.01', '07.03.02', '07.03.02', '07.03.02', '07.03.03', '07.03.02', '07.03.02', '07.03.01']],
  ['日志与远程管理', ['07.02.02', '07.03.03', '07.02.02', '07.03.03', '07.02.02', '07.02.02', '07.03.03', '07.02.02', '07.03.03', '07.02.02']],
  ['综合布线子系统', ['08.01.01', '08.01.01', '08.01.01', '08.01.01', '08.01.01', '08.01.01', '08.01.02', '08.01.02', '08.01.01', '08.01.02']],
  ['双绞线与光纤', ['08.02.01', '08.02.04', '08.02.02', '08.02.02', '08.02.03', '08.02.04', '08.02.01', '08.02.01', '08.02.01', '08.02.03']],
  ['带宽、时延、丢包率、吞吐量', run('08.03.02', 10)],
  ['CPM、PERT、甘特图', ['09.01.01', '09.01.02', '09.01.01', '09.01.01', '09.01.01', '09.01.01', '09.01.01', '09.01.01', '09.01.01', '09.01.01']],
  ['风险、质量与配置管理', ['09.02.01', '09.02.01', '09.02.01', '09.02.01', '09.02.02', '09.02.03', '09.02.03', '09.02.03', '09.02.02', '09.02.03']],
  ['网络安全、数据安全、知识产权与等保', ['09.03.01', '09.03.01', '09.03.01', '09.03.01', '09.03.01', '09.03.03', '09.03.03', '09.03.02', '09.03.02', '09.03.02']],
  ['SDN 与 NFV', ['10.01.01', '10.01.01', '10.01.01', '10.01.01', '10.01.02', '10.01.01', '10.01.01', '10.01.01', '10.01.02', '10.01.02']],
  ['云计算与容器', run('10.01.03', 10)],
  ['5G 与 NB-IoT', ['10.02.01', '10.02.01', '10.02.01', '10.02.01', '10.02.01', '10.02.01', '10.02.02', '10.02.02', '10.02.01', '10.02.01']],
];

if (draftQuestions.length !== 430 || targetCodesByGroup.length !== 43)
  throw new Error(`草稿或映射组数量异常：${draftQuestions.length} / ${targetCodesByGroup.length}`);

const groups = [];
for (const question of draftQuestions) {
  let group = groups.at(-1);
  if (!group || group.key !== `${question.chapter}\t${question.knowledgePoint}`) {
    group = { key: `${question.chapter}\t${question.knowledgePoint}`, questions: [] };
    groups.push(group);
  }
  group.questions.push(question);
}
if (groups.length !== targetCodesByGroup.length)
  throw new Error(`新旧分类小知识点数量不符：${groups.length} / ${targetCodesByGroup.length}`);

const formalQuestions = [];
for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
  const group = groups[groupIndex];
  const [expectedPoint, codes] = targetCodesByGroup[groupIndex];
  if (group.questions.length !== 10 || group.key.split('\t')[1] !== expectedPoint || codes.length !== 10)
    throw new Error(`草稿分类映射不匹配：${group.key} / ${group.questions.length} / ${codes.length}`);
  for (let index = 0; index < group.questions.length; index++) {
    const question = group.questions[index];
    const target = targetByCode.get(codes[index]);
    if (!target) throw new Error(`服务器分类代码不存在：${codes[index]}`);
    formalQuestions.push({
      ...question,
      id: `ne-20260923-${question.id.slice(-3)}`,
      chapter: target.chapter,
      knowledgeSection: target.knowledgeSection,
      knowledgePoint: target.knowledgePoint,
      tags: [target.knowledgePoint],
    });
  }
}

const newBank = {
  id: 'network-engineer-supplement-20260923',
  name: '网络工程师原创补充题（2026-09-23）',
  description: '按已确认服务器分类整理的原创单选练习题，答案与解析已复核；非官方真题。',
  source: 'network_engineer_supplement',
  path: 'questions/network-engineer-supplement-20260923.json',
};
const priorBankIndex = manifest.banks.findIndex((bank) => bank.id === newBank.id);
if (manifest.banks.some((bank) => bank.id !== newBank.id && bank.source === newBank.source))
  throw new Error('题库 source 已分配给其他分组');
if (priorBankIndex >= 0) manifest.banks.splice(priorBankIndex, 1);
manifest.banks.splice(1, 0, newBank);
const outputPath = path.join(bankRoot, newBank.path);
fs.writeFileSync(outputPath, JSON.stringify(formalQuestions, null, 2).replaceAll('\n', '\r\n') + '\r\n', 'utf8');

function jsonFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    return entry.isDirectory() ? jsonFiles(child) : entry.name.endsWith('.json') ? [child] : [];
  });
}
for (const module of manifest.taxonomy.modules)
  for (const section of module.sections)
    for (const point of section.knowledgePoints) point.questionCount = 0;
let bankQuestionCount = 0;
for (const bank of manifest.banks) {
  for (const file of jsonFiles(path.join(bankRoot, bank.path))) {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    bankQuestionCount += rows.length;
    for (const question of rows) {
      const target = targetByCodeValue(manifest, question);
      if (!target) throw new Error(`题目未归入服务器分类：${question.id} / ${question.chapter} / ${question.knowledgeSection} / ${question.knowledgePoint}`);
      target.questionCount++;
    }
  }
}
if (bankQuestionCount !== 920) throw new Error(`现有题库加新增题目的总量异常：${bankQuestionCount}`);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2).replaceAll('\n', '\r\n') + '\r\n', 'utf8');

const importRecord = {
  importedAt: '2026-09-23',
  sourceTaxonomy: 'server/question-banks/network-engineer/manifest.json',
  sourceDraftQuestions: draftQuestions.length,
  serverTaxonomyPointCount: targetByCode.size,
  bankQuestionCount,
  newBank,
  mappedDraftGroups: groups.map((group, groupIndex) => ({
    sourceKnowledgePoint: group.key.split('\t')[1],
    questionCount: group.questions.length,
    targetPoints: [...new Set(targetCodesByGroup[groupIndex][1])].map((code) => ({
      code,
      ...targetByCode.get(code),
      questionCountFromDraft: targetCodesByGroup[groupIndex][1].filter((targetCode) => targetCode === code).length,
    })),
  })),
  finalServerTaxonomyCounts: manifest.taxonomy.modules.flatMap((module) => module.sections.flatMap((section) => section.knowledgePoints.map((point) => ({
    module: module.name,
    section: section.name,
    code: point.code,
    knowledgePoint: point.name,
    questionCount: point.questionCount,
  })))),
};
for (const group of importRecord.mappedDraftGroups) {
  for (const point of group.targetPoints) delete point.point;
}
fs.writeFileSync(path.join(draftRoot, 'server-taxonomy-import-record.json'), JSON.stringify(importRecord, null, 2) + '\n', 'utf8');

function targetByCodeValue(currentManifest, question) {
  for (const module of currentManifest.taxonomy.modules) {
    if (module.name !== question.chapter) continue;
    for (const section of module.sections) {
      if (section.name !== question.knowledgeSection) continue;
      const point = section.knowledgePoints.find((item) => item.name === question.knowledgePoint);
      if (point) return point;
    }
  }
  return null;
}

console.log(JSON.stringify({
  added: formalQuestions.length,
  bank: newBank,
  serverTaxonomyPoints: targetByCode.size,
  pointCounts: Object.fromEntries(manifest.taxonomy.modules.flatMap((module) => module.sections.flatMap((section) => section.knowledgePoints.map((point) => [point.code, point.questionCount])))),
  totalAcrossBanks: bankQuestionCount,
}, null, 2));
