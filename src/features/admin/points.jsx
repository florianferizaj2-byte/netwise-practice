import {useEffect,useRef,useState} from 'react';
import {api} from '../../api.js';
import {Panel,Table,Pagination,date,requestId} from './shared.jsx';
import {formatPoints,pointsTaskLabels} from '../../components/points-activity.jsx';
import './points.css';
import {CheckInPolicyPanel} from './check-in-policy.jsx';

const yuan=micros=>'¥ '+((micros||0)/1000000).toLocaleString('zh-CN',{maximumFractionDigits:6});
const stateName={pending:'预扣中',settled:'已结算',refunded:'已退款'};
export function PointsBilling(){
  const [data,setData]=useState(null),[configuration,setConfiguration]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [days,setDays]=useState('30'),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[tick,setTick]=useState(0),[busy,setBusy]=useState(false);
  const [user,setUser]=useState(null),[detail,setDetail]=useState(null),[detailOffset,setDetailOffset]=useState(0),[review,setReview]=useState(null);
  const nonce=useRef({}),revision=useRef(0);
  useEffect(()=>{
    const controller=new AbortController();const current=++revision.current;
    setError('');
    Promise.all([api(`/admin/points/usage?days=${days}&search=${encodeURIComponent(search)}&offset=${offset}`,undefined,'GET',{cache:false,signal:controller.signal}),api('/admin/points/configuration',undefined,'GET',{cache:false,signal:controller.signal})])
      .then(([usage,config])=>{if(current===revision.current){setData(usage);setConfiguration(config);}})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
    return()=>{controller.abort();};
  },[days,search,offset,tick]);
  useEffect(()=>{
    if(!user){setDetail(null);return;}
    const controller=new AbortController();setDetail(null);
    api(`/admin/points/users/${encodeURIComponent(user.userId)}?limit=10&offset=${detailOffset}`,undefined,'GET',{cache:false,signal:controller.signal})
      .then(setDetail).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
    return()=>controller.abort();
  },[user,detailOffset,tick]);
  async function post(path,body,{idempotent=true}={}){
    if(busy)return false;setBusy(true);setError('');setNotice('');
    const signature=path+JSON.stringify(body);
    const id=nonce.current[signature]||(nonce.current[signature]=requestId());
    try{
      await api('/admin/points'+path,idempotent?{...body,requestId:id}:body);
      delete nonce.current[signature];
      setNotice('已保存。余额、收支与成本记录已重新计算。');setTick(value=>value+1);return true;
    }catch(cause){setError(cause.message);return false;}finally{setBusy(false);}
  }
  const finance=data?.finance;
  const rateCards=configuration?[...new Map([...configuration.officialRateCards,...configuration.customRateCards].map(row=>[row.provider+':'+row.model,row])).values()]:[];
  return <div className="ac-points-billing">
    {error&&<p role="alert" className="ac-error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!data&&<p role="status">正在读取所有用户的积分和用量…</p>}
    {finance&&<>
      <div className="ac-metrics">{[
        ['已登记销售收入',yuan(finance.revenueMicros)],['AI 已发生成本',yuan(finance.aiSpentMicros)],
        ['未用积分履约预留',yuan(finance.pointLiabilityMicros)],['参考预算余量（不拦截调用）',yuan(finance.availableCostMicros)],
      ].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <Panel title="扣费与成本核算" description="新调用按用户正余额准入，按实际用量结算后允许扣成负数；负数或零余额暂停新付费调用，不依赖登记收入，也不设平台每日成本上限。模型价格与用量仍需有效且可核对。">
        <p>参考核算包含已记录 AI 成本 {yuan(finance.aiSpentMicros)}、调用中的预留 {yuan(finance.aiHeldMicros)}、未用积分未来成本 {yuan(finance.pointLiabilityMicros)} 和其他已登记支出 {yuan(finance.otherExpenseMicros)}。</p>
        <p>会员码与赠送积分不自动当作收入。销售收入按客户实际支付、未扣手续费的金额登记；支付手续费和经营支出分别登记，未登记费用不代表零成本。</p>
        {data.history.unknownCostCalls>0&&<p role="status">历史有 {data.history.unknownCostCalls} 次调用成本未知，未计作零成本，因此历史实际毛利尚不能确认。</p>}
        {finance.overBudgetMicros>0&&<p role="alert">已登记费用或积分承诺超出预算 {yuan(finance.overBudgetMicros)}，这只是收支提示，不会因此阻止有正余额的用户调用 AI。</p>}
        {!data.audit.passed&&<p role="alert">积分账本核对未通过，请先核对记录。</p>}
      </Panel>
    </>}
    {configuration?.costForecast&&<Panel title="会员签到成本测算" description="按当前每日额度全部领取并用于 AI 计算；不是已经实现的毛利。修改签到配置后刷新测算。" actions={<button onClick={()=>setTick(value=>value+1)}>刷新测算</button>}>
      <Table rowKey="id" rows={configuration.costForecast.plans} columns={[
        {key:'name',label:'套餐 / 售价',render:row=>`${row.name} / ¥ ${(row.priceCents/100).toFixed(2)}`},
        {key:'dailyPoints',label:'每日签到积分'},
        {key:'cost30',label:'已发积分对应成本（30 / 31 次）',render:row=>row.scenarios.map(scenario=>yuan(scenario.aiCostCeilingMicros)).join(' / ')},
        {key:'margin',label:'再预留 5% 后剩余比例（30 / 31 次）',render:row=>row.scenarios.map(scenario=>(scenario.remainingMarginBps/100).toFixed(2)+'%').join(' / ')},
      ]}/>
      <p>允许单笔结算透支；本表不包括未收回欠分风险，不代表实际费用上限。当前待抵扣欠分 {formatPoints(configuration.costForecast.outstandingDebtUnits||0)} 积分。</p>
      <p>免费用户每日 {configuration.costForecast.free.dailyPoints} 积分，30 次签到全部用完对应 AI 成本参考 {yuan(configuration.costForecast.free.cost30DaysMicros)}。积分按成本的 {configuration.costForecast.serviceMultiplier} 倍面值结算；100 积分面值为 1 元。</p>
      <p>{configuration.costForecast.notice}</p>
    </Panel>}
    <CheckInPolicyPanel/>
    <Panel title="所有用户的积分与用量" description="包含普通账号、会员、管理员与访客；可展开查看每个任务的扣款、退款、模型和 Token。">
      <form className="ac-toolbar" onSubmit={event=>{event.preventDefault();setOffset(0);setTick(value=>value+1);}}>
        <label>账号或用户编号<input value={search} onChange={event=>{setSearch(event.target.value);setOffset(0);}}/></label>
        <label>时间范围<select value={days} onChange={event=>{setDays(event.target.value);setOffset(0);}}><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option><option value="365">最近一年</option></select></label>
        <button disabled={busy}>刷新</button>
      </form>
      {data&&<><Table rowKey="userId" rows={data.rows} columns={[
        {key:'username',label:'账号',render:row=><button onClick={()=>{setUser(row);setDetailOffset(0);setReview(null);}}>{row.username}</button>},
        {key:'balance',label:'可用 / 预扣积分',render:row=>`${formatPoints(row.wallet.availableUnits)} / ${formatPoints(row.wallet.heldUnits)}`},
        {key:'calls',label:'调用次数',render:row=>`${row.calls} 次 · 历史 ${row.legacyCalls} 次`},
        {key:'tokens',label:'输入 / 输出 Token',render:row=>`${row.inputTokens} / ${row.outputTokens}`},
        {key:'chargedUnits',label:'已扣积分',render:row=>formatPoints(row.chargedUnits)},
        {key:'refundedUnits',label:'退回预扣',render:row=>formatPoints(row.refundedUnits)},
        {key:'costMicros',label:'成本 / 待核对',render:row=>`${yuan(row.costMicros)} / ${row.costReviewCalls+row.legacyUnknownCostCalls} 次`},
      ]}/><Pagination {...data} onChange={setOffset}/></>}
    </Panel>
    {user&&<Panel title={`${user.username} · 任务明细`} actions={<button onClick={()=>{setUser(null);setReview(null);}}>收起</button>}>
      {!detail?<p role="status">正在读取任务…</p>:<>
        <Table rows={detail.rows} columns={[
          {key:'createdAt',label:'时间',render:row=>date(row.createdAt)},
          {key:'feature',label:'任务',render:row=>pointsTaskLabels[detail.calls.find(call=>call.operationId===row.id)?.taskType]||row.feature},
          {key:'state',label:'状态',render:row=>stateName[row.state]},
          {key:'chargedUnits',label:'已扣 / 预扣积分',render:row=>`${formatPoints(row.chargedUnits)} / ${formatPoints(row.heldUnits)}`},
          {key:'costMicros',label:'上游成本',render:row=>yuan(row.costMicros)},
        ]}/><Pagination {...detail} onChange={setDetailOffset}/>
        <Table rows={detail.calls} columns={[
          {key:'taskType',label:'模型调用',render:row=>pointsTaskLabels[row.taskType]||row.taskType},
          {key:'model',label:'模型'},
          {key:'tokens',label:'输入 / 输出 / 缓存 Token',render:row=>row.measured?`${row.usage.prompt_tokens} / ${row.usage.completion_tokens} / ${row.usage.cached_prompt_tokens||0}`:'上游未返回可靠用量'},
          {key:'costMicros',label:'成本',render:row=>`${yuan(row.costMicros)}${row.costVerified?'':'（保守预留）'}`},
          {key:'needsReview',label:'核对',render:row=>row.needsReview?<button onClick={()=>setReview(row)}>核对上游账单</button>:row.reconciliation?'已人工核对':'已记录'},
        ]}/>
        {detail.legacyTotal>0&&<><h3>历史调用记录 · 共 {detail.legacyTotal} 次</h3><Table rows={detail.legacyRows} columns={[
          {key:'createdAt',label:'时间',render:row=>date(row.createdAt)},{key:'model',label:'模型'},
          {key:'taskType',label:'功能',render:row=>pointsTaskLabels[row.taskType]||row.taskType||'未分类历史调用'},
          {key:'tokens',label:'输入 / 输出 Token',render:row=>row.hasUsage?`${row.inputTokens} / ${row.outputTokens}`:'用量未知'},
          {key:'estimatedCostCny',label:'已知成本',render:row=>typeof row.estimatedCostCny==='number'?'¥ '+row.estimatedCostCny:'未知，待核对'},
        ]}/></>}
      </>}
    </Panel>}
    {review&&<Panel title="核对上游真实账单" description="只校正成本记录，不会再次扣除已经退还用户的积分。">
      <form onSubmit={async event=>{event.preventDefault();const values=new FormData(event.currentTarget);if(await post(`/calls/${review.id}/reconcile`,{costCny:String(values.get('cost')),reference:String(values.get('reference'))}))setReview(null);}}>
        <label>上游实际成本（元）<input name="cost" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,6})?" defaultValue={String(review.costMicros/1000000)}/></label>
        <label>账单依据<input name="reference" required minLength={8} maxLength={500}/></label>
        <button disabled={busy}>确认真实成本</button><button type="button" onClick={()=>setReview(null)}>取消</button>
      </form>
    </Panel>}
    <Panel title="发放积分与登记收支" description="这三项分别记账；发放积分不会自动增加实收收入。">
      <details><summary>登记实收收入或经营支出</summary><form onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,values=new FormData(form);if(await post('/finance',{kind:String(values.get('kind')),amountCny:String(values.get('amount')),userId:String(values.get('userId')||'')||null,reference:String(values.get('reference'))}))form.reset();}}>
        <label>类别<select name="kind"><option value="revenue">客户实付销售收入（未扣手续费）</option><option value="expense">支付手续费或经营支出</option></select></label>
        <label>实际金额（元）<input name="amount" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,6})?"/></label>
        <label>对应用户编号（可选）<input name="userId" maxLength={150}/></label>
        <label>唯一收款或支出凭据编号<input name="reference" minLength={8} maxLength={500} required/></label><button disabled={busy}>登记金额</button>
      </form></details>
      <details><summary>追加积分</summary><form onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,values=new FormData(form);if(await post('/grants',{userId:String(values.get('userId')),points:String(values.get('points')),reason:String(values.get('reason')),expiresAt:values.get('expiresAt')?new Date(String(values.get('expiresAt'))).toISOString():null}))form.reset();}}>
        <label>用户编号<input name="userId" required maxLength={150}/></label><label>发放积分<input name="points" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,3})?"/></label>
        <label>到期时间（可选）<input name="expiresAt" type="datetime-local"/></label><label>发放依据<input name="reason" required minLength={8} maxLength={500}/></label><button disabled={busy}>发放积分</button>
      </form></details>
    </Panel>
    <Panel title="模型成本价格" description="价格与服务地址、模型严格绑定；价格过期或用量待核对时暂停新调用。">
      {configuration&&<Table rowKey={row=>row.provider+row.model} rows={rateCards} columns={[
        {key:'model',label:'模型'},{key:'provider',label:'服务地址'},
        {key:'inputMicrosPerMillion',label:'输入 / 输出 / 缓存（每百万 Token）',render:row=>row.schedule==='deepseek-cn-2026'?<span>高峰：{yuan(row.peakRates.inputMicrosPerMillion)} / {yuan(row.peakRates.outputMicrosPerMillion)} / {yuan(row.peakRates.cachedMicrosPerMillion)}<br/>空闲：{yuan(row.offPeakRates.inputMicrosPerMillion)} / {yuan(row.offPeakRates.outputMicrosPerMillion)} / {yuan(row.offPeakRates.cachedMicrosPerMillion)}</span>:`${yuan(row.inputMicrosPerMillion)} / ${yuan(row.outputMicrosPerMillion)} / ${yuan(row.cachedMicrosPerMillion)}`},
        {key:'expiresAt',label:'价格有效期',render:row=>date(row.expiresAt)},
        {key:'paused',label:'状态',render:row=>row.paused?'待核对，已暂停':Date.parse(row.expiresAt)>Date.now()?'有效':'已过期'},
      ]}/>}
      <details><summary>确认或更新模型价格</summary><form onSubmit={async event=>{event.preventDefault();const values=new FormData(event.currentTarget);await post('/rates',{provider:String(values.get('provider')),model:String(values.get('model')),inputCnyPerMillion:String(values.get('input')),outputCnyPerMillion:String(values.get('output')),cachedCnyPerMillion:String(values.get('cached')),source:String(values.get('source')),verifiedAt:new Date().toISOString(),expiresAt:new Date(String(values.get('expiry'))).toISOString()},{idempotent:false});}}>
        <label>服务地址<input name="provider" type="url" required/></label><label>模型名<input name="model" required/></label>
        <label>输入价（元 / 百万 Token）<input name="input" inputMode="decimal" required/></label><label>输出价（元 / 百万 Token）<input name="output" inputMode="decimal" required/></label><label>缓存输入价（元 / 百万 Token）<input name="cached" inputMode="decimal" required/></label>
        <label>价格依据或账单说明<input name="source" required minLength={8}/></label><label>价格复核截止<input name="expiry" type="datetime-local" required/></label><button disabled={busy}>确认成本价格</button>
      </form></details>
    </Panel>
  </div>;
}
