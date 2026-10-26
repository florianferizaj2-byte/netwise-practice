import { useEffect, useState } from 'react';
import { formatPoints } from './points-activity.jsx';
import './ai-points-pricing.css';

// Disclosure is read-only and lazy: opening a price list never starts an AI call.
export function AiPointsPricing({ api, userId }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [modelId, setModelId] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open || !userId) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    api('/account/points/services', undefined, 'GET', { cache: false, signal: controller.signal })
      .then(next => { if (!controller.signal.aborted) { setData(next); setModelId(next.primaryModelId || next.models[0]?.id || ''); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message || '费用暂未读取，请重试'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, userId, open, revision]);
  const model = data?.models.find(row => row.id === modelId);
  return <details className="ai-points-pricing panel" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>AI 服务参考积分<span>按实际用量结算</span></summary>
    {open && <div className="ai-points-pricing-content">
      <div className="ai-points-pricing-tools"><p>这里只查看价格，不会发起 AI 请求或扣除积分。</p><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? '正在读取…' : '刷新价目'}</button></div>
      {error && <p role="alert">{error}</p>}
      {data && <>
        {!data.available && <p role="status">当前接口未就绪；下列为参考价，不表示服务可用。</p>}
        {data.models.length > 1 && <label>查看接口<select value={modelId} onChange={event => setModelId(event.target.value)}>{data.models.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        {model && <>
          <h3>{model.name} · {model.priceBandLabel || '当前费率'}</h3>
          <p>每 1000 Token：输入 {formatPoints(model.inputUnitsPer1000)}、输出 {formatPoints(model.outputUnitsPer1000)}、缓存输入 {formatPoints(model.cachedInputUnitsPer1000)} 积分。</p>
          <p>{data.assumptions.notice}</p>
          <dl>{model.services.map(service => {
            const peak = model.comparison?.peak.services.find(row => row.id === service.id);
            const off = model.comparison?.offPeak.services.find(row => row.id === service.id);
            return <div key={service.id}><dt>{service.name}</dt><dd>{peak && off ? `高峰 ${formatPoints(peak.sampleUnits)} / 空闲 ${formatPoints(off.sampleUnits)} 积分` : `${formatPoints(service.sampleUnits)} 积分 / 示例`}</dd></div>;
          })}</dl>
        </>}
        {data.models.length === 0 && <p role="status">当前没有有效费率，未知价格不按零积分处理。</p>}
        <p>普通题库、已有解析、缓存结果和确定性判分：0 积分。任务失败退回全部预扣，已发生的上游成本由平台承担。</p>
      </>}
    </div>}
  </details>;
}
