// Durable, account-scoped write-behind. No token, answer key or explanation is
// persisted. The server grades; local feedback is only a responsive preview.
export type PracticeSubmission={questionId:string;selected:string[];timeMs:number;response?:string;clientAttemptId:string};
export type PracticeResult={questionId:string;selected:string[];correct:boolean;timeMs:number;answer:string[];analysis?:string;expectedAnswer?:string};
export type PracticeSyncEntry={id:string;payload:PracticeSubmission;status:'queued'|'saving'|'failed'|'saved';attempts:number;error:string;result?:PracticeResult};
type Dependencies={storage:{getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<unknown>};session:()=>{token:string|null;revision:number};send:(payload:PracticeSubmission)=>Promise<PracticeResult>;id:()=>string;schedule?:(run:()=>void,ms:number)=>ReturnType<typeof setTimeout>;cancel?:(timer:ReturnType<typeof setTimeout>)=>void};
export function createPracticeAttemptQueue(deps:Dependencies){
  let state:{owner:string|null;ready:boolean;entries:PracticeSyncEntry[]}={owner:null,ready:false,entries:[]};
  let epoch=0,revision=-1,active=true,busy=false,writes:Promise<unknown>=Promise.resolve(),timer:ReturnType<typeof setTimeout>|undefined;
  const listeners=new Set<()=>void>(),schedule=deps.schedule||setTimeout,cancel=deps.cancel||clearTimeout;
  const emit=()=>{state={...state,entries:[...state.entries]};listeners.forEach(run=>run());};
  const key=(owner:string)=>'kaojiang-practice-outbox-v1:'+encodeURIComponent(owner);
  const owned=(version=epoch)=>version===epoch&&!!state.owner&&!!deps.session().token&&revision===deps.session().revision;
  const persisted=new Map<string,{body:string;job:Promise<unknown>}>();
  const persist=(owner:string,entries:PracticeSyncEntry[])=>{
    const body=JSON.stringify(entries.filter(e=>e.status!=='saved').map(e=>({id:e.id,payload:e.payload,status:'queued',attempts:0,error:''})));
    const previous=persisted.get(owner);if(previous?.body===body)return previous.job;
    const job=writes.then(()=>deps.storage.setItem(key(owner),body));
    persisted.set(owner,{body,job});
    writes=job.catch(()=>{if(persisted.get(owner)?.job===job)persisted.delete(owner);});return job;
  };
  const replace=(id:string,patch:Partial<PracticeSyncEntry>)=>{state.entries=state.entries.map(e=>e.id===id?{...e,...patch}:e);emit();};
  const stopTimer=()=>{if(timer){cancel(timer);timer=undefined;}};
  async function pump(){
    if(busy||!active||!state.ready||!owned())return;
    const entry=state.entries.find(e=>e.status==='queued');if(!entry)return;
    const version=epoch,owner=state.owner!;busy=true;replace(entry.id,{status:'saving',error:''});
    try{
      // Persist before POST: a lost acknowledgement can always be replayed with
      // the SAME clientAttemptId after navigation, logout or process restart.
      await persist(owner,state.entries);if(!owned(version))return;
      const result=await deps.send(entry.payload);if(!owned(version))return;
      replace(entry.id,{status:'saved',result,error:''});
      try{await persist(owner,state.entries);}catch{/* Server acknowledged; persisted replay remains idempotent. */}
      const completed=state.entries.filter(e=>e.status==='saved');if(completed.length>100){const keep=new Set(completed.slice(-100).map(e=>e.id));state.entries=state.entries.filter(e=>e.status!=='saved'||keep.has(e.id));emit();}
    }catch(cause){
      if(!owned(version))return;
      const error=cause as {message?:string;status?:number},attempts=entry.attempts+1;
      const retryable=!error.status||error.status>=500||[408,429].includes(error.status);
      const retry=retryable&&attempts<3;
      replace(entry.id,{status:retry?'queued':'failed',attempts,error:error.message||'答题记录尚未同步'});
      if(retry){stopTimer();timer=schedule(()=>{timer=undefined;void pump();},attempts*2000);}
    }finally{
      busy=false;
      if(!timer&&owned()&&active&&state.entries.some(e=>e.status==='queued'))void Promise.resolve().then(pump);
    }
  }
  const api={
    getSnapshot:()=>state,subscribe:(run:()=>void)=>{listeners.add(run);return()=>{listeners.delete(run);};},
    activate(owner:string|null):void{
      const nextRevision=deps.session().revision;if(state.owner===owner&&revision===nextRevision)return;
      persisted.clear();epoch++;stopTimer();revision=nextRevision;state={owner,ready:!owner,entries:[]};emit();if(!owner)return;
      const version=epoch;
      void deps.storage.getItem(key(owner)).then(raw=>{
        if(!owned(version))return;
        if(raw&&raw.length>1500000)throw Error('本机待同步数据过大，未发送或覆盖原记录');
        const parsed=raw?JSON.parse(raw):[];if(!Array.isArray(parsed)||parsed.length>200)throw Error('本机待同步记录格式无效');
        const valid=parsed.filter(e=>e&&typeof e.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e.id)&&e.payload?.clientAttemptId===e.id&&typeof e.payload.questionId==='string'&&e.payload.questionId.length>0&&e.payload.questionId.length<=512&&Array.isArray(e.payload.selected)&&e.payload.selected.length>=1&&e.payload.selected.length<=5&&e.payload.selected.every((x:unknown)=>typeof x==='string'&&/^[A-E]$/.test(x))&&Number.isSafeInteger(e.payload.timeMs)&&e.payload.timeMs>=0&&e.payload.timeMs<=86400000&&(e.payload.response===undefined||typeof e.payload.response==='string'&&e.payload.response.length<=5000));
        if(valid.length!==parsed.length)throw Error('本机待同步记录损坏，未发送');
        const live=new Set(state.entries.map(e=>e.id));state.entries=[...valid.filter(e=>!live.has(e.id)).map(e=>({...e,status:'queued' as const,attempts:0,error:''})),...state.entries];state.ready=true;emit();void pump();
      }).catch(cause=>{if(!owned(version))return;state.ready=false;state.entries=[{id:'storage-error',payload:{questionId:'',selected:[],timeMs:0,clientAttemptId:'storage-error'},status:'failed',attempts:0,error:cause?.message||'无法读取本机待同步记录'}];emit();});
    },
    enqueue(payload:Omit<PracticeSubmission,'clientAttemptId'>){
      if(!owned()||!state.ready)throw Error('答题同步尚未就绪，请稍后重试');
      if(state.entries.filter(e=>e.status!=='saved').length>=200)throw Error('已有 200 条答题记录待同步，请先联网同步后继续');
      const id=deps.id();state.entries=[...state.entries,{id,payload:{...payload,selected:[...payload.selected],clientAttemptId:id},status:'queued',attempts:0,error:''}];emit();const version=epoch;void persist(state.owner!,state.entries).catch(cause=>{if(owned(version))replace(id,{status:'failed',error:cause?.message||'本机暂存失败，请重试'});});void pump();return id;
    },
    retry(id?:string):void{if(!owned())return;if(!state.ready){const owner=state.owner;revision=-1;api.activate(owner);return;}stopTimer();state.entries=state.entries.map(e=>e.status!=='saved'&&e.status!=='saving'&&(!id||id===e.id)?{...e,status:'queued',attempts:0,error:''}:e);emit();void pump();},
    setActive(value:boolean){active=value;if(value)void pump();else stopTimer();},
  };
  return api;
}
