// Money is integer micro-CNY; balances are integer milli-points. No floating
// point value is allowed to become an authoritative accounting amount.
export const MICRO_CNY = 1_000_000;
export const POINT_SCALE = 1000;
export const MICRO_CNY_PER_MILLI_POINT = 10; // 100 points = CNY 1
export const TARGET_MARGIN_BPS = 7000;
export const SERVICE_MARGIN_BPS = 7500; // 25% fulfilment + 5% failure/operating reserve
export function pointLiabilityMicros(units) {
  integer(units,'待履约积分');
  return safeNumber(ceilRatio(BigInt(units)*10n*BigInt(10000-SERVICE_MARGIN_BPS),10000n));
}
export const pointsError = (message, code, status = 409) =>
  Object.assign(new Error(message), { code, status });
export function integer(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw pointsError(`${name}不是有效的整数金额`, 'AI_POINTS_INVALID_AMOUNT', 400);
  return value;
}
export function safeNumber(value, name = '金额') {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw pointsError(`${name}超出记账范围`, 'AI_POINTS_AMOUNT_OVERFLOW', 400);
  return Number(value);
}
export const ceilRatio = (numerator, denominator) => {
  if (denominator <= 0n) throw new Error('Accounting denominator must be positive');
  return (numerator + denominator - 1n) / denominator;
};
export function cnyMicros(value) {
  const text = String(value);
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(text))
    throw pointsError('金额最多保留六位小数', 'AI_POINTS_INVALID_AMOUNT', 400);
  const [whole, fraction = ''] = text.split('.');
  return safeNumber(BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')));
}
export function chargeUnits(costMicros, marginBps = TARGET_MARGIN_BPS) {
  integer(costMicros, '成本');integer(marginBps, '毛利率', { max: 9500 });
  return safeNumber(ceilRatio(BigInt(costMicros) * 10_000n,
    BigInt(MICRO_CNY_PER_MILLI_POINT) * BigInt(10_000 - marginBps)), '积分');
}
export function costAllowance(revenueMicros, marginBps = TARGET_MARGIN_BPS) {
  integer(revenueMicros, '收入');integer(marginBps, '毛利率', { max: 9500 });
  return safeNumber(BigInt(revenueMicros) * BigInt(10_000 - marginBps) / 10_000n);
}
export function tokenCost(usage, rates) {
  const input = integer(usage.prompt_tokens, '输入 Token'),
    output = integer(usage.completion_tokens, '输出 Token'),
    cached = integer(usage.cached_prompt_tokens ?? 0, '缓存 Token', { max: input });
  for (const key of ['inputMicrosPerMillion','outputMicrosPerMillion','cachedMicrosPerMillion'])
    integer(rates[key], key);
  const numerator = BigInt(input - cached) * BigInt(rates.inputMicrosPerMillion) +
    BigInt(cached) * BigInt(rates.cachedMicrosPerMillion) +
    BigInt(output) * BigInt(rates.outputMicrosPerMillion);
  return safeNumber(ceilRatio(numerator, 1_000_000n), '成本');
}
export const displayPoints = units => integer(units, '积分', {min:-Number.MAX_SAFE_INTEGER}) / POINT_SCALE;
export function pointUnits(value) {
  const text=String(value);
  if(!/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(text))
    throw pointsError('积分最多保留三位小数','AI_POINTS_INVALID_AMOUNT',400);
  const [whole,fraction='']=text.split('.');
  return safeNumber(BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0')),'积分');
}
