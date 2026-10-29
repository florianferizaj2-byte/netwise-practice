import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { mobileApi } from "./client";
import type { AiLearningJob, AiLearningKind, AiLearningProfile, AiLearningSummary } from "./aiLearningTypes";

const text=(e:unknown)=>e instanceof Error?e.message:"请求失败，请稍后重试";
export function useAiLearning(userId:string|undefined,certificateId:string|null|undefined,kind:AiLearningKind,active:boolean,preview:boolean){
  const [profile,setProfile]=useState<AiLearningProfile|null>(null),[jobs,setJobs]=useState<AiLearningSummary[]>([]);
  const [job,setJob]=useState<AiLearningJob|null>(null),[answers,setAnswers]=useState<Record<string,string[]>>({});
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[saveState,setSaveState]=useState("saved");
  const [live,setLive]=useState(false),[tick,setTick]=useState(Date.now()),[receivedAt,setReceivedAt]=useState(Date.now());
  const ref=useRef<AiLearningJob|null>(null),pending=useRef<Record<string,string[]>>({}),version=useRef(0),cursor=useRef(0);
  const opening=useRef(false);
  const mounted=useRef(true),saving=useRef(false),conflict=useRef(false),expired=useRef(false),chain=useRef(Promise.resolve());
  const flushRef=useRef<()=>Promise<boolean>>(async()=>true),refreshRef=useRef<()=>Promise<void>>(async()=>{});
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),refreshing=useRef(false);
  const key=(id:string)=>"kaojiang-ai-learning-draft:"+userId+":"+certificateId+":"+id;
  const persist=()=>{
    if(!ref.current||!userId)return;
    const path=key(ref.current.id),data=JSON.stringify({version:version.current,answers:pending.current});
    chain.current=chain.current.catch(()=>{}).then(()=>AsyncStorage.setItem(path,data));
    void chain.current.catch(()=>{if(mounted.current)setError("本机暂存失败，请保持页面并重试同步。");});
  };
  const apply=(next:AiLearningJob,ack=false)=>{
    if(!mounted.current||ref.current&&ref.current.id!==next.id)return;
    if(ref.current?.id===next.id&&next.eventId<ref.current.eventId)return;
    if(!ack&&saving.current){setJob(j=>j?{...j,questions:next.questions,readyCount:next.readyCount,status:next.status}:next);return;}
    if(!ack&&Object.keys(pending.current).length&&version.current!==next.answersVersion){
      const same=Object.entries(pending.current).every(([id,a])=>JSON.stringify(a)===JSON.stringify(next.answers[id]||[]));
      if(same)pending.current={};else conflict.current=true;
    }
    if(!conflict.current)version.current=next.answersVersion;
    ref.current=next;setJob(next);setAnswers({...next.answers,...pending.current});
    setReceivedAt(Date.now());setTick(Date.now());cursor.current=Math.max(cursor.current,next.eventId);
    if(next.remainingMs===0&&Object.keys(pending.current).length)expired.current=true;
    setSaveState(conflict.current?"conflict":expired.current&&Object.keys(pending.current).length?"expired":Object.keys(pending.current).length?"local":"saved");
    if(next.submitted){
      if(Object.keys(pending.current).length){
        const archiveKey=key(next.id)+":after-submit",archive=JSON.stringify({version:version.current,answers:pending.current,archivedAt:new Date().toISOString()});
        chain.current=chain.current.catch(()=>{}).then(()=>AsyncStorage.setItem(archiveKey,archive));
        setError("该题组已交卷，本机未同步作答已单独暂存，不覆盖已提交结果。");
      }
      pending.current={};conflict.current=false;expired.current=false;persist();
    }
  };
  const refresh=async()=>{
    const id=ref.current?.id;if(!id||refreshing.current||!active)return;
    refreshing.current=true;
    try{const next=await mobileApi.aiLearningJob(id);if(ref.current?.id===id)apply(next);}
    catch{if(mounted.current)setLive(false);}
    finally{refreshing.current=false;}
  };
  refreshRef.current=refresh;
  const flush=async()=>{
    if(saving.current||conflict.current||expired.current)return false;
    const current=ref.current;if(!current||!Object.keys(pending.current).length)return true;
    const delta={...pending.current};saving.current=true;setSaveState("saving");
    try{
      const next=await mobileApi.aiLearningAction(current.id,"answers",{expectedVersion:version.current,answers:delta});
      if(!mounted.current||ref.current?.id!==current.id)return false;
      for(const [id,a] of Object.entries(delta))if(JSON.stringify(a)===JSON.stringify(pending.current[id]))delete pending.current[id];
      version.current=Math.max(version.current,next.answersVersion);apply(next,true);persist();return Object.keys(pending.current).length===0;
    }catch(e){
      if(mounted.current){
        if(text(e).includes("另一设备"))conflict.current=true;
        if(text(e).includes("考试时间已到"))expired.current=true;
        setSaveState(conflict.current?"conflict":expired.current?"expired":"local");setError("作答已暂存，待同步："+text(e));
      }
      return false;
    }finally{saving.current=false;}
  };
  flushRef.current=flush;
  const open=async(id:string)=>{
    if(opening.current)return;opening.current=true;
    if(!await flushRef.current()){opening.current=false;setError("请先同步当前暂存作答或处理冲突。");return;}
    setBusy(true);setError("");
    try{
      const next=await mobileApi.aiLearningJob(id);
      await chain.current.catch(()=>{});
      const raw=await AsyncStorage.getItem(key(id));
      if(!mounted.current)return;
      pending.current={};conflict.current=false;expired.current=false;version.current=next.answersVersion;
      if(raw&&!next.submitted)try{
        const draft=JSON.parse(raw);
        if(Number.isInteger(draft.version)&&draft.answers&&typeof draft.answers==="object"){
          const ready=new Map(next.questions.map(q=>[q.id,q]));
          pending.current=Object.fromEntries(Object.entries(draft.answers).filter(([qid,a])=>ready.has(qid)&&Array.isArray(a)&&a.every(v=>typeof v==="string"&&Object.hasOwn(ready.get(qid)!.options,v)))) as Record<string,string[]>;
          version.current=draft.version;
        }
      }catch{setError("本机暂存记录损坏，服务器记录仍保留。");}
      ref.current=next;cursor.current=next.eventId;apply(next);return next;
    }catch(e){if(mounted.current)setError(text(e));}finally{opening.current=false;if(mounted.current)setBusy(false);}
  };
  const reload=async()=>{
    if(!userId||!certificateId||preview)return;
    setError("");
    try{
      const [next,list]=await Promise.all([mobileApi.aiLearningProfile(),mobileApi.aiLearningJobs()]);
      if(!mounted.current)return;
      setProfile(next);setJobs(list.jobs.filter(j=>j.kind===kind));
      if(ref.current)await refreshRef.current();
    }catch(e){if(mounted.current)setError(text(e));}
  };
  const reloadJobs=async()=>{
    const list=await mobileApi.aiLearningJobs();
    if(mounted.current)setJobs(list.jobs.filter(j=>j.kind===kind));return list.jobs;
  };
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);};
  },[]);
  useEffect(()=>{
    if(!active||preview||!userId||!certificateId)return;
    let alive=true;
    void Promise.all([mobileApi.aiLearningProfile(),mobileApi.aiLearningJobs()]).then(([p,list])=>{
      if(!alive)return;setProfile(p);setJobs(list.jobs.filter(j=>j.kind===kind));
      const unfinished=list.jobs.find(j=>j.kind===kind&&!j.submitted&&j.status!=="canceled");
      if(unfinished&&!ref.current)void open(unfinished.id);
    }).catch(e=>{if(alive)setError(text(e));});
    return()=>{alive=false;};
  },[active,preview,userId,certificateId,kind]);
  useEffect(()=>{
    if(!active||!job?.id||job.submitted||preview)return;
    const controller=new AbortController(),id=job.id;
    let failures=0,refreshTimer:ReturnType<typeof setTimeout>|null=null;
    void (async()=>{
      while(!controller.signal.aborted){
        try{await mobileApi.subscribeAiLearning(id,cursor.current,e=>{
          if(controller.signal.aborted)return;
          cursor.current=Math.max(cursor.current,e.id);failures=0;setLive(true);
          if(!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=null;void refreshRef.current();},250);
        },controller.signal,()=>{if(!controller.signal.aborted)setLive(true);});}
        catch{if(!controller.signal.aborted&&mounted.current)setLive(false);}
        if(controller.signal.aborted)break;
        await new Promise(resolve=>setTimeout(resolve,Math.min(10000,1000*2**Math.min(failures++,3))));
      }
    })();
    const poll=setInterval(()=>{void refreshRef.current();void flushRef.current();},6000);
    return()=>{controller.abort();clearInterval(poll);if(refreshTimer)clearTimeout(refreshTimer);};
  },[active,job?.id,job?.submitted,preview]);
  useEffect(()=>{
    if(!active||!job?.startedAt||job.submitted)return;
    const handle=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(handle);
  },[active,job?.id,job?.startedAt,job?.submitted]);
  const choose=(qid:string,selected:string[])=>{
    if(!ref.current?.startedAt||ref.current.submitted||conflict.current)return;
    pending.current={...pending.current,[qid]:selected};setAnswers(a=>({...a,[qid]:selected}));setSaveState("local");persist();
    if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void flushRef.current(),500);
  };
  const action=async(name:"start"|"retry"|"cancel")=>{
    if(!ref.current||busy)return;
    setBusy(true);setError("");
    try{apply(await mobileApi.aiLearningAction(ref.current.id,name));}
    catch(e){setError(text(e));}finally{setBusy(false);}
  };
  const submit=async(partial:boolean)=>{
    if(!ref.current||busy)return;
    if(!await flushRef.current()){setError("请先同步所有暂存作答，再交卷。");return;}
    setBusy(true);setError("");
    try{apply(await mobileApi.aiLearningAction(ref.current.id,"submit",{expectedVersion:version.current,partial}));}
    catch(e){setError(text(e));}finally{setBusy(false);}
  };
  const acceptCreated=(next:AiLearningJob)=>{
    ref.current=null;pending.current={};conflict.current=false;expired.current=false;apply(next,true);void reloadJobs().catch(()=>{});
  };
  const useServer=async()=>{
    if(!ref.current)return;
    if(Object.keys(pending.current).length){
      try{
        await chain.current.catch(()=>{});
        await AsyncStorage.setItem(key(ref.current.id)+(expired.current?":expired":":conflict"),JSON.stringify({version:version.current,answers:pending.current,archivedAt:new Date().toISOString()}));
      }catch{setError("本机作答归档失败，请保持当前页面并重试。");return;}
    }
    pending.current={};conflict.current=false;expired.current=false;version.current=ref.current.answersVersion;
    setAnswers(ref.current.answers);setSaveState("saved");setError("");persist();
  };
  const remaining=job?.remainingMs===null||job?.remainingMs===undefined?null:Math.max(0,job.remainingMs-(job.waiting?0:Math.max(0,tick-receivedAt)));
  return {profile,jobs,job,answers,error,setError,busy,setBusy,saveState,live,remaining,open,choose,action,submit,flush,reloadJobs,reload,acceptCreated,useServer};
}
