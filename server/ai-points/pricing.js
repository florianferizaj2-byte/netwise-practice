import { cnyMicros, integer, pointsError } from './money.js';

export const pricingSource = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
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
  expiresAt: '2026-11-22T00:00:00.000Z',basis: 'peak-ceiling',
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
  return validRateCard(card,now);
}
export function inputTokenCeiling(messages) {
  // For the current text-only Chat Completions protocol, UTF-8 bytes bound text
  // tokens; extra allowance includes role framing and server-side separators.
  if (!Array.isArray(messages) || messages.some(message=>typeof message.content!=='string'))
    throw pointsError('该 AI 输入类型尚未配置成本上限', 'AI_POINTS_UNBOUNDED_INPUT', 503);
  return integer(Buffer.byteLength(JSON.stringify(messages),'utf8') + messages.length*256 + 1024,'输入上限');
}
