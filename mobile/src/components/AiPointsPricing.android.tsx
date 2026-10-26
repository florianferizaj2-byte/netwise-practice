import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { androidPointsApi } from '../api/points.android';
import type { PointServicesResponse } from '../api/pointsTypes';
import { AnimatedPressable } from './Motion';
import { useAppActive, useScreenActive } from '../navigation/ScreenActivity';
import { useThemedStyles, type ThemeColors } from '../theme';

export function AiPointsPricing({ userId, preview = false }: { userId?: string; preview?: boolean }) {
  const s = useThemedStyles(styles);
  const active = useScreenActive(), appActive = useAppActive();
  const [data, setData] = useState<PointServicesResponse | null>(null);
  const [modelId, setModelId] = useState('');
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setData(null); setError(''); setModelId(''); }, [userId, preview]);
  useEffect(() => {
    if (!userId || preview || !active || !appActive) return;
    const controller = new AbortController();
    let live = true;
    setLoading(true); setError(''); setData(null);
    androidPointsApi.services(controller.signal).then(next => {
      if (!live) return;
      setData(next);
      setModelId(previous => next.models.some(m => m.id === previous) ? previous : next.models[0]?.id || '');
    }).catch(cause => { if (live) setError(cause.message || '费用暂未读取，请重试'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [userId, preview, active, appActive, retry]);
  const model = data?.models.find(m => m.id === modelId);
  const format = (units: number) => (units / (data?.scale || 1000)).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
  return <View style={s.card} testID="android-points-services">
    <Text accessibilityRole="header" style={s.title}>AI 服务积分价目</Text>
    <Text style={s.text}>不是固定按次收费。成功按实际用量结算，失败退回该任务预扣；审核与重试的模型调用也计入任务成本。</Text>
    {!userId || preview ? <Text style={s.muted}>登录后查看当前接口的费用示例。</Text> : <>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="刷新服务积分价目"
        disabled={loading} onPress={() => setRetry(n => n + 1)} style={s.button}>
        {loading && <ActivityIndicator size="small" />}
        <Text style={s.buttonText}>{loading ? '正在读取费用…' : '刷新服务积分价目'}</Text>
      </AnimatedPressable>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {data && !data.available && <Text style={s.warning}>当前 AI 接口未就绪或价格待核对。以下如有数字，仅为内置参考价，不表示服务可用。</Text>}
      {!!data?.models.length && <Text style={s.muted}>接口按管理员优先级使用；点击下列接口仅查看费用，不改变调用顺序。</Text>}
      {data?.models.map(m => <AnimatedPressable key={m.id} accessibilityRole="button"
        accessibilityLabel={`查看${m.name}积分费用`} accessibilityState={{ selected: m.id === modelId }}
        onPress={() => setModelId(m.id)} style={[s.model, m.id === modelId && s.selected]}>
        <Text style={s.modelName}>{m.name}</Text>
        <Text style={s.muted}>{m.kind === 'reference' ? '参考价 · 非当前可用接口' : `${m.id === data.primaryModelId ? '当前优先' : '备用'} · 优先级 ${m.priority}`}</Text>
      </AnimatedPressable>)}
      {model && data && <>
        <Text style={s.text}>{model.model}{model.priceBandLabel ? ` · ${model.priceBandLabel}` : ''}：每 1000 输入 Token {format(model.inputUnitsPer1000)} 积分，输出 {format(model.outputUnitsPer1000)} 积分，缓存命中输入 {format(model.cachedInputUnitsPer1000)} 积分。</Text>
        <Text style={s.muted}>计价有效至 {new Date(model.expiresAt).toLocaleDateString('zh-CN')} · 套餐面值 {data.pointsPerCny} 积分 / 元</Text>
        {data.billingPolicy && <Text style={s.muted}>按模型成本 × {data.billingPolicy.serviceMultiplier} 换算积分；只按账户积分限制调用。</Text>}
        <Text style={s.warning}>{data.assumptions.notice}</Text>
        {model.services.map(service => <View key={service.id} style={s.row}>
          <View style={s.description}><Text style={s.serviceName}>{service.name}</Text>
            <Text style={s.muted}>{service.steps.length} 轮模型调用 · 示例总输出 {service.steps.reduce((n, step) => n + step.outputTokens, 0)} Token</Text>
            {model.comparison && <Text style={s.muted}>高峰 {format(model.comparison.peak.services.find(row => row.id === service.id)?.sampleUnits ?? service.sampleUnits)} / 空闲 {format(model.comparison.offPeak.services.find(row => row.id === service.id)?.sampleUnits ?? service.sampleUnits)} 积分</Text>}</View>
          <Text style={s.price}>{format(service.sampleUnits)} 积分 / 示例</Text>
        </View>)}
      </>}
      {data?.models.length === 0 && <Text style={s.error}>暂无有效计价，不能把未知价格当成 0 积分。</Text>}
      {data?.freeServices.map(service => <View key={service.id} style={s.row}>
        <Text style={[s.serviceName, s.description]}>{service.name}</Text><Text style={s.price}>0 积分</Text>
      </View>)}
    </>}
  </View>;
}

const styles = (c: ThemeColors) => StyleSheet.create({
  card: { margin: 20, padding: 16, gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16 },
  title: { color: c.text, fontSize: 18, fontWeight: '700' },
  text: { color: c.text, fontSize: 14, lineHeight: 22 },
  muted: { color: c.text, fontSize: 13, lineHeight: 20 },
  warning: { color: c.text, fontSize: 14, lineHeight: 22, padding: 12, backgroundColor: c.background, borderRadius: 12 },
  error: { color: c.warning, fontSize: 14, lineHeight: 22 },
  button: { minHeight: 48, padding: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: c.background, borderRadius: 12 },
  buttonText: { color: c.brand, fontSize: 15, fontWeight: '600' },
  model: { minHeight: 48, padding: 12, gap: 4, borderWidth: 1, borderColor: c.border, borderRadius: 12 },
  selected: { borderColor: c.brand },
  modelName: { color: c.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  description: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: 4 },
  serviceName: { color: c.text, fontSize: 15, lineHeight: 22 },
  price: { color: c.brand, fontSize: 14, lineHeight: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
