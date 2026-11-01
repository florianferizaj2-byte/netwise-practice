import { cnyMicros, integer, pointsError } from './money.js';

export const pricingSource = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';

export const pricingRecheckedOn='2026-10-26';
export const holidaySource='https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568275.html';
const holidayRanges2026=[['01-01','01-03'],['02-15','02-23'],['04-04','04-06'],['05-01','05-05'],['06-19','06-21'],['09-25','09-27'],['10-01','10-07']];
export function deepSeekPriceBand(at=Date.now()) {
  if(!Number.isFinite(at))throw pointsError('计价时间无效','AI_POINTS_PRICING_UNAVAILABLE',503);
  const local=new Date(at+8*3600000);
  // Official built-in cards expire within 2026. Never invent a future year's
  // public-holiday calendar when a newly confirmed card is later introduced.
  if(local.getUTCFullYear()!==2026)throw pointsError('该年度的分时计价日历待核对','AI_POINTS_PRICING_UNAVAILABLE',503);
  const monthDay=local.toISOString().slice(5,10),weekday=local.getUTCDay();
  const holiday=holidayRanges2026.some(([start,end])=>monthDay>=start&&monthDay<=end);
  const minute=local.getUTCHours()*60+local.getUTCMinutes();
  return weekday!==0&&weekday!==6&&!holiday&&((minute>=540&&minute<720)||(minute>=840&&minute<1080))?'peak':'off-peak';
}
export function officialRateAt(card,at=Date.now()) {
  if(card.schedule!=='deepseek-cn-2026'||normalizeProvider(card.provider)!=='https://api.deepseek.com'||card.priceBand)return card;
  const priceBand=deepSeekPriceBand(at);
  return {...card,...(priceBand==='peak'?card.peakRates:card.offPeakRates),
    priceBand,basis:'public-request-start-rate',appliedAt:new Date(at).toISOString()};
}

export function normalizeProvider(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw pointsError('计费服务地址无效', 'AI_POINTS_INVALID_PROVIDER', 400);
  const provider=`${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  return provider==='https://api.deepseek.com/v1'?'https://api.deepseek.com':provider;
}
const official = (model, input, output, cached) => ({
  id: `official-deepseek-20261023-${model}`,
  model, provider: 'https://api.deepseek.com',
  inputMicrosPerMillion: cnyMicros(input),outputMicrosPerMillion: cnyMicros(output),
  cachedMicrosPerMillion: cnyMicros(cached),
  source: pricingSource,verifiedAt: '2026-10-23T00:00:00.000Z',
  expiresAt: '2026-11-22T00:00:00.000Z',basis: 'peak-reference',
  recheckedOn:pricingRecheckedOn,schedule:'deepseek-cn-2026',
  peakRates:{inputMicrosPerMillion:cnyMicros(input),outputMicrosPerMillion:cnyMicros(output),cachedMicrosPerMillion:cnyMicros(cached)},
  offPeakRates:{inputMicrosPerMillion:cnyMicros(input)/2,outputMicrosPerMillion:cnyMicros(output)/2,cachedMicrosPerMillion:cnyMicros(cached)/2},
});
export const officialRateCards = [
  official('deepseek-flash','2','8','0.04'),
  official('deepseek-v4-flash','2','8','0.04'),
  official('deepseek-v4-flash-vision-exp','2','8','0.04'),
  official('deepseek-v4-pro','9','27','0.30'),
];
export function validRateCard(card, now = Date.now()) {
  if (!card || typeof card.model !== 'string' || !card.model ||
      !Number.isFinite(Date.parse(card.verifiedAt)) || Date.parse(card.verifiedAt) > now ||
      !Number.isFinite(Date.parse(card.expiresAt)) || Date.parse(card.expiresAt) <= now ||
      Date.parse(card.expiresAt)>Date.parse(card.verifiedAt)+31*86400000 ||
      typeof card.source !== 'string' || card.source.trim().length < 8)
    throw pointsError('模型成本价格缺失或已过期，请管理员核对后再使用', 'AI_POINTS_PRICING_UNAVAILABLE', 503);
  normalizeProvider(card.provider);
  for (const key of ['inputMicrosPerMillion','outputMicrosPerMillion','cachedMicrosPerMillion'])integer(card[key],key);
  return card;
}
export function resolveRateCard(settings, custom = [], now = Date.now()) {
  const provider = normalizeProvider(settings.baseUrl);
  // /v1 is the documented OpenAI-compatible endpoint of the same official API.
  const officialProvider = provider === 'https://api.deepseek.com/v1'
    ? 'https://api.deepseek.com' : provider;
  const card = custom.find(row=>normalizeProvider(row.provider)===provider&&row.model===settings.model) ||
    officialRateCards.find(row=>row.provider===officialProvider&&row.model===settings.model);
  return officialRateAt(validRateCard(card,now),now);
}
export function inputTokenCeiling(messages) {
  // For the current text-only Chat Completions protocol, UTF-8 bytes bound text
  // tokens; extra allowance includes role framing and server-side separators.
  if (!Array.isArray(messages) || messages.some(message=>typeof message.content!=='string'))
    throw pointsError('该 AI 输入类型尚未配置成本上限', 'AI_POINTS_UNBOUNDED_INPUT', 503);
  return integer(Buffer.byteLength(JSON.stringify(messages),'utf8') + messages.length*256 + 1024,'输入上限');
}
