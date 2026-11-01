import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import './points-activity.css';

export const formatPoints=units=>((units||0)/1000).toLocaleString('zh-CN',{maximumFractionDigits:3});
export const pointsTaskLabels={
  'question-generation':'AI 出题','question-review':'题目独立审核','question-explanation':'详细解析',
  'question-hint':'AI 提示','hint-review':'提示审核','mistake-analysis':'错因分析','daily-plan':'学习计划',
  'study-generation':'课程生成','study-content-review':'课程审核','study-grading':'AI 判分',
  'study-teacher':'AI 老师','interactive-tutor-teacher':'互动课答疑','interactive-tutor-review':'答疑审核',
  'connection-test':'服务连接测试','admin-connection-test':'后台连接测试',
};
export function PointsActivity({api,userId}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[tick,setTick]=useState(0),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();let live=true;
    setLoading(true);setError('');
    api('/account/points/operations?limit=20',undefined,'GET',{cache:false,signal:controller.signal})
      .then(value=>{if(live)setData(value);}).catch(cause=>{if(live&&!controller.signal.aborted)setError(cause.message);})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;controller.abort();};
  },[api,userId,tick]);
  useEffect(()=>{
    const refresh=()=>setTick(value=>value+1);
    window.addEventListener('kaojiang-points-changed',refresh);
    return()=>window.removeEventListener('kaojiang-points-changed',refresh);
  },[]);
  return <section className="vip-surface points-activity" aria-labelledby="points-history-title">
    <div className="points-activity-heading"><div><h2 id="points-history-title">积分使用记录</h2><p>成功按实际用量结算，失败退还预扣积分。</p></div>
      <button type="button" disabled={loading} onClick={()=>setTick(value=>value+1)} aria-label="刷新积分使用记录"><RefreshCw size={17}/></button></div>
    {error&&<p role="alert">{error}</p>}
    {loading&&!data&&<p role="status">正在读取积分记录…</p>}
    {data&&!data.rows.length&&<p>还没有 AI 积分使用记录。读取题库、已有课程和缓存解析不消耗积分。</p>}
    <div className="points-activity-list">{data?.rows.map(row=>{
      const calls=data.calls.filter(call=>call.operationId===row.id);
      const label=pointsTaskLabels[calls[0]?.taskType]||'AI 学习';
      const state=row.state==='pending'?'处理中 · 预扣中':row.state==='refunded'?'失败 · 预扣已退还':calls.length?'已结算':'未调用 AI';
      return <article key={row.id}><div><strong>{label}</strong><small>{new Date(row.createdAt).toLocaleString('zh-CN')}</small></div>
        <div><strong>{row.state==='pending'?`预扣 ${formatPoints(row.heldUnits)}`:row.state==='refunded'?`退回 ${formatPoints(row.heldUnits)}`:`−${formatPoints(row.chargedUnits)}`} 积分</strong><small>{state}</small></div></article>;
    })}</div>
  </section>;
}
