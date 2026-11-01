import {staticFile} from 'remotion';

// 全部截图来自 https://aceexam.top 公开页面（scripts/capture*.mjs，deviceScaleFactor 2/3）
export type ShotInfo = {src: string; w: number; h: number};
const s = (name: string, w: number, h: number): ShotInfo => ({
  src: staticFile(`shots/${name}.png`),
  w,
  h,
});

export const SHOT = {
  hero: s('d-hero', 3200, 2000),
  downloads: s('d-downloads', 3200, 2000),
  features: s('d-features', 2560, 2084),
  certificates: s('d-certificates', 2560, 804),
  devices: s('d-devices', 2560, 770),
  q1: s('d-trial-q1', 1218, 1066),
  q1Selected: s('d-trial-q1-selected', 1218, 1066),
  q1Result: s('d-trial-q1-result', 1218, 1230),
  q2: s('d-trial-q2', 1218, 1066),
  aiExplain: s('d-ai-explain', 1360, 1800),
  aiAnalyze: s('d-ai-analyze', 1360, 1132),
  mobileHome: s('m-home', 1170, 2532),
  mobileEntry: s('m-entry', 1170, 2532),
};

export const LOGO = staticFile('brand/logo.png');

// 试做卡片内关键位置（截图像素坐标）
export const CARD_POS = {
  optionA: {x: 330, y: 440},
  optionB: {x: 330, y: 545},
  confirm: {x: 1066, y: 986},
  aiExplainBtn: {x: 155, y: 1044},
  aiAnalyzeBtn: {x: 373, y: 1044},
  explainBox: {x: 609, y: 906},
};

// 首页“全部功能”截图中每张卡片的区域（截图像素）
const COLS = [0, 853, 1706];
const ROWS = [357, 751, 1146, 1541];
const FW = 853;
const FH = 394;
export const FEATURE_NAMES = [
  'AI 精讲与练习', '章节练习', '错题复习',
  'AI 专项训练', '模拟考试', '知识掌握度',
  '共享题库', '社区交流', '考试与证书指南',
  '会员与 AI 服务',
];
export const FEATURE_DESC = [
  '会员知识点精讲、填空练习和随时答疑。',
  '沿着章节与知识点，把基础练扎实。',
  '留下易错之处，按复习安排逐个消化。',
  '围绕薄弱知识点，生成针对性的练习。',
  '在完整的计时考试里，检验备考状态。',
  '从作答记录中，看见每个知识点的进步。',
  '发现其他学习者分享的 AI 题组。',
  '交流备考经验，也分享你的解题思路。',
  '了解备考目标，找到自己的学习方向。',
  '查看服务额度、会员方案与兑换入口。',
];
export const featureRect = (i: number) => ({
  x: COLS[i % 3] + 2,
  y: ROWS[Math.floor(i / 3)] + 2,
  w: FW - 4,
  h: FH - 4,
});

export const CERTS = [
  '软考网络工程师',
  'HCIA-Datacom V2.0',
  'NCRE 二级 MS Office',
  '执业兽医（全科类）',
  '四川专升本 · 计算机',
];

// AI 分析错题的真实输出（2026-10-09 实拍，免登录体验）
export const AI_ANALYZE_TITLE = 'OSI传输层与网络层功能区分：端到端可靠传输、路由与寻址';
export const AI_ANALYZE_BODY =
  '选项A网络层主要负责逻辑寻址、路由选择和分组转发，通常提供尽力而为的不可靠传输；端到端可靠传输由传输层通过TCP等协议实现。选择A可能说明把网络层的端到端寻址/路由功能误认为端到端传输功能，混淆了网络层与传输层的职责。';
export const AI_EXPLAIN_ITEMS = [
  {k: 'A', name: '网络层', text: '逻辑寻址和路由选择，IP 本身尽力而为', ok: false},
  {k: 'B', name: '传输层', text: '端到端通信、分段重组与可靠性控制', ok: true},
  {k: 'C', name: '数据链路层', text: '相邻节点之间的帧传输、MAC 寻址', ok: false},
  {k: 'D', name: '会话层', text: '建立、管理、同步和终止会话', ok: false},
];

export const sfx = (name: string) => staticFile(`sfx/${name}.wav`);
export const music = (name: string) => staticFile(`audio/${name}.wav`);
