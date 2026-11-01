import {useEffect,useRef,useState} from 'react';
import {api} from '../../api.js';
import {Panel,requestId,date} from './shared.jsx';

const tiers=[['free','免费'],['vip','VIP'],['svip','SVIP'],['ssvip','SSVIP']];
export function CheckInPolicyPanel() {
  const [policy,setPolicy]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const nonce=useRef(null),saving=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    api('/admin/points/check-in-policy',undefined,'GET',{cache:false,signal:controller.signal})
      .then(data=>setPolicy(data.policy)).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[]);
  const reload=async()=>{
    setError('');
    try{const data=await api('/admin/points/check-in-policy',undefined,'GET',{cache:false});setPolicy(data.policy);}
    catch(e){setError(e.message);}
  };
  async function save(event) {
    event.preventDefault();if(saving.current||!policy)return;
    const form=new FormData(event.currentTarget);
    const body={revision:policy.revision,enabled:form.get('enabled')==='on',requireFunded:form.get('funded')==='on',
      dailyPoints:Object.fromEntries(tiers.map(([id])=>[id,Number(form.get(id))])),reason:String(form.get('reason')||'')};
    const signature=JSON.stringify(body);
    if(nonce.current?.signature!==signature)nonce.current={signature,id:requestId()};
    saving.current=true;setBusy(true);setError('');setNotice('');
    try{
      const data=await api('/admin/points/check-in-policy',{...body,requestId:nonce.current.id},'PUT');
      setPolicy(data.policy);nonce.current=null;
      setNotice('签到配置已保存。已签到账号保留原领取记录，不会补发或重复发放。');
    }catch(e){setError(e.message);}
    finally{saving.current=false;setBusy(false);}
  }
  return <Panel title="每日签到积分" description="按账号当前会员等级领取；北京时间每天一次，积分当日有效。不再自动整笔发月积分。">
    {error&&<p role="alert" className="ac-error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!policy?<p role="status">正在读取签到配置…</p>:<form key={policy.revision} onSubmit={save} aria-label="每日签到积分配置">
      <label><input type="checkbox" name="enabled" defaultChecked={policy.enabled}/>开启每日签到</label>
      {tiers.map(([id,label])=><label key={id}>{label}每日签到积分<input name={id} type="number" inputMode="numeric" min="1" max="100000" step="1" required defaultValue={policy.dailyPoints[id]}/></label>)}
      <label><input type="checkbox" name="funded" defaultChecked={policy.requireFunded}/>发放前校验运营预算</label>
      <p>默认按运营赠送发放并记入积分账本，不伪造销售收入。开启预算校验后，预算不足时不发放；此开关不修改真实 AI 调用的成本保护规则。</p>
      <label>调整说明<input name="reason" minLength={8} maxLength={500} required defaultValue="调整每日签到积分配置"/></label>
      <div><button type="submit" disabled={busy}>{busy?'保存中…':'保存签到配置'}</button><button type="button" disabled={busy} onClick={()=>void reload()}>重新读取配置</button></div>
      <p>配置版本 {policy.revision} · 更新于 {date(policy.updatedAt)}。已领过本期整笔会员积分的账号，按原到期日转入每日领取，旧余额不扣回。</p>
    </form>}
  </Panel>;
}
