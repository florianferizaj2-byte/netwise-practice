import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, ScrollView, View } from "react-native";
import { AppAlert as Alert } from "../components/AppAlert";
import { useAiLearningFocus } from "../components/AiLearningFocus";
import { mobileApi, type AuthResponse } from "../api/client";
import { useAiLearning } from "../api/useAiLearning";
import { studyRequestId } from "../api/studyTypes";
import type { AiLearningKind, AiLearningQuote, AiLearningSetup } from "../api/aiLearningTypes";
import { useScreenActive } from "../navigation/ScreenActivity";
import type { AppTab, NavigationOptions } from "../types";
import { AiButton, AiIcon, AiMetricRow, AiNotice, AiSheet, AiText, useAiDesign } from "./ai-learning/AiElements";
import { AiAnalysisPage, AiHomePage, AiPlanPage, AiSettingsPage, type AiUiSettings } from "./ai-learning/AiSetupPages";
import { AiAnswerPage, AiHistoryPage, AiMonitorPage, AiResultPage, AiReviewPage } from "./ai-learning/AiSessionPages";

type Page="home"|"analysis"|"settings"|"plan"|"monitor"|"answer"|"result"|"review"|"history";
export function AiLearningScreen({kind="practice",preview=false,user,certificateName="当前证书",onNavigate,onExamFocus,homeAccessory}:{
  kind?:AiLearningKind;preview?:boolean;user?:AuthResponse["user"];certificateName?:string;
  onNavigate:(tab:AppTab,options?:NavigationOptions)=>void;onExamFocus?:(focus:boolean)=>void;homeAccessory?:ReactNode;
}){
  const active=useScreenActive(),{p}=useAiDesign(),a=useAiLearning(user?.id,user?.certificateId,kind,active,preview),{job,profile}=a;
  const [page,setPage]=useState<Page>("home"),[index,setIndex]=useState(0),[sheet,setSheet]=useState<"submit"|"cancel"|"wallet"|null>(null);
  const [settings,setSettings]=useState<AiUiSettings>({strategy:"weakness",count:kind==="exam"?30:10,duration:40,pointIds:[]});
  const [quote,setQuote]=useState<AiLearningQuote|null>(null),quoted=useRef<AiLearningSetup|null>(null),request=useRef("");
  const settingsBack=useRef<Page>("home"),historyBack=useRef<Page>("home"),focused=active&&page!=="home";
  useAiLearningFocus(focused);
  useEffect(()=>{onExamFocus?.(focused);return()=>onExamFocus?.(false);},[focused,onExamFocus]);
  useEffect(()=>{
    if(!job)return;setIndex(0);setSheet(null);
    setPage(job.submitted?"result":job.startedAt?"answer":"monitor");
    if(job.submitted)void a.reload();
  },[job?.id,job?.startedAt,job?.submitted]);
  useEffect(()=>{if(a.error&&/积分余额|余额不足|积分不足|POINTS_INSUFFICIENT/.test(a.error))setSheet("wallet");},[a.error]);
  const back=async()=>{
    if(a.busy)return;
    if(sheet){setSheet(null);return;}
    if(page==="answer"){await a.flush();setPage("monitor");return;}
    if(page==="review"){setPage("result");return;}
    if(page==="history"){setPage(historyBack.current);return;}
    if(page==="settings"){setPage(settingsBack.current);return;}
    setPage("home");
  };
  useEffect(()=>{
    if(!active||page==="home")return;
    const subscription=BackHandler.addEventListener("hardwareBackPress",()=>{void back();return true;});
    return()=>subscription.remove();
  },[active,page,sheet,a.busy,a.flush]);
  const showHistory=()=>{historyBack.current=page;setPage("history");};
  const showSettings=()=>{settingsBack.current=page==="plan"?"plan":"home";setPage("settings");};
  const previewPlan=async(next=settings)=>{
    if(preview||!user?.id){a.setError("登录后即可根据实际作答记录定制方案。");return;}
    if(job&&!job.submitted&&(job.status==="running"||job.status==="queued")){setPage("monitor");a.setError("当前题组仍在生成，请先继续现有题组，或明确停止后再新建。");return;}
    a.setBusy(true);a.setError("");setQuote(null);setPage("plan");
    try{
      const setup:AiLearningSetup={kind,strategy:next.strategy,count:kind==="practice"?10:next.count,durationMinutes:next.duration,pointIds:next.pointIds};
      const value=await mobileApi.aiLearningQuote(setup);quoted.current=setup;request.current=studyRequestId();setQuote(value);
    }catch(e){a.setError(e instanceof Error?e.message:"方案读取失败，请重试");}finally{a.setBusy(false);}
  };
  const generate=async()=>{
    if(!quote||!quoted.current||a.busy)return;
    if(!await a.flush()){a.setError("请先同步当前作答，避免丢失本机改动。");return;}
    a.setBusy(true);a.setError("");
    try{
      a.acceptCreated(await mobileApi.createAiLearningJob(quoted.current,request.current,quote.profileRevision));
      setQuote(null);setPage("monitor");setIndex(0);
    }catch(e){a.setError(e instanceof Error?e.message:"请求暂未确认，重试会复用本次请求编号");}finally{a.setBusy(false);}
  };
  const resolve=()=>Alert.alert(a.saveState==="expired"?"按到期前服务器作答继续？":"确认采用服务器记录？",
    a.saveState==="expired"?"本机晚到作答将单独暂存，交卷以服务器截止前确认的记录为准。":"服务器记录会保留；本机冲突改动将单独暂存，不再覆盖服务器。",
    [{text:"取消",style:"cancel"},{text:"确认",onPress:()=>void a.useServer()}]);
  const open=async(id:string)=>{const next=await a.open(id);if(next){setIndex(0);setPage(next.submitted?"result":next.startedAt?"answer":"monitor");}};
  const start=()=>{if(job?.startedAt)setPage("answer");else void a.action("start");};
  const submit=async()=>{if(!job)return;await a.submit(job.readyCount<job.targetCount);};
  const again=(names:string[])=>{
    const ids=(profile?.points||[]).filter(point=>names.includes(point.knowledgePoint)||names.includes(point.chapter)).map(point=>point.id).slice(0,4);
    setSettings(s=>({...s,strategy:names.length?"weakness":"review",pointIds:ids}));setPage("home");void a.reload();
  };
  const error=a.error&&!sheet&&a.saveState!=="conflict"&&a.saveState!=="expired"?<View style={{paddingHorizontal:20,paddingTop:6}}>
    <AiNotice tone="amber" title={a.error.includes("Network")||a.error.includes("network")?"连接暂未恢复":a.error} detail={page==="plan"?"方案尚未确认；已有题目与作答保留。":undefined}
      action={page==="plan"?"重读方案":"重试"} onAction={()=>page==="plan"?void previewPlan():void a.reload()}/>
  </View>:null;
  let content;
  if(page==="settings")content=<AiSettingsPage profile={profile} kind={kind} settings={settings} onChange={setSettings} onBack={()=>void back()}
    onSave={next=>{if(settingsBack.current==="plan")void previewPlan(next||settings);else setPage("home");}}/>;
  else if(page==="analysis")content=<AiAnalysisPage profile={profile} onBack={()=>void back()} onPlan={ids=>{const next={...settings,pointIds:ids};setSettings(next);void previewPlan(next);}}/>;
  else if(page==="plan")content=<AiPlanPage quote={quote} onBack={()=>void back()} onSettings={showSettings} onConfirm={()=>void generate()} busy={a.busy}/>;
  else if(page==="history")content=<AiHistoryPage initialKind={kind} onBack={()=>void back()} onOpen={id=>void open(id)}/>;
  else if(page==="answer"&&job?.startedAt&&!job.submitted)content=<AiAnswerPage job={job} answers={a.answers} index={index} onIndex={setIndex} onChoose={a.choose}
    remaining={a.remaining} saveState={a.saveState} live={a.live} busy={a.busy} onBack={()=>void back()} onSubmit={()=>setSheet("submit")} onSync={()=>void a.flush()}
    onResolve={resolve} onMonitor={()=>setPage("monitor")}/>;
  else if(page==="result"&&job?.result)content=<AiResultPage job={job} onBack={()=>setPage("home")} onReview={()=>setPage("review")} onAgain={again}/>;
  else if(page==="review"&&job?.result)content=<AiReviewPage job={job} onBack={()=>setPage("result")}/>;
  else if(page==="monitor"&&job)content=<AiMonitorPage job={job} live={a.live} busy={a.busy} onBack={()=>setPage("home")} onStart={start} onRetry={()=>void a.action("retry")}
    onCancel={()=>setSheet("cancel")} onWallet={()=>setSheet("wallet")} onHistory={showHistory}/>;
  else content=<AiHomePage kind={kind} profile={profile} loading={a.busy} settings={settings} onChange={strategy=>setSettings(s=>({...s,strategy}))}
    onPlan={()=>void previewPlan()} onSettings={showSettings} onAnalysis={()=>setPage("analysis")} onHistory={showHistory} certificateName={certificateName}
    activeJob={job} accessory={homeAccessory} onContinue={()=>setPage(job?.submitted?"result":job?.startedAt?"answer":"monitor")}/>;
  const answered=job?.questions.filter(q=>(a.answers[q.id]||[]).length).length||0,partial=!!job&&job.readyCount<job.targetCount;
  return <View style={{flex:1,backgroundColor:p.bg}}>{error}{content}
    <AiSheet visible={sheet==="submit"} onClose={()=>{if(!a.busy)setSheet(null);}} title={partial?"确认部分交卷":"核对并交卷"}>
      <AiMetricRow items={[{label:"题已就绪",value:job?.readyCount||0},{label:"题已作答",value:answered},{label:"题待生成",value:(job?.targetCount||0)-(job?.readyCount||0)}]}/>
      <AiNotice tone={partial?"amber":"blue"} title={partial?"只按已就绪题目计分":"交卷后显示答案与解析"} detail={partial?
        "未生成题不算错，结果不作为完整模拟考试成绩；确认后会停止后续生成。":"已就绪但未作答的题目会计为错误，确认前可继续核对。"} />
      {!!a.error&&<AiText type="small" tone="amber">{a.error}</AiText>}
      <AiButton label={partial?"确认部分交卷":"确认交卷"} onPress={()=>void submit()} busy={a.busy}/>
      <AiButton label="继续作答" variant="secondary" onPress={()=>setSheet(null)} disabled={a.busy}/>
    </AiSheet>
    <AiSheet visible={sheet==="cancel"} onClose={()=>setSheet(null)} title="停止后续生成？">
      <AiNotice tone="amber" title="已有题目与作答会保留" detail="仅停止尚未交付的题目；已结算的有效生成按原积分规则处理，未结算预占会释放。"/>
      <AiButton label="确认停止后续生成" onPress={()=>void a.action("cancel").then(()=>setSheet(null))} busy={a.busy}/>
      <AiButton label="继续生成" variant="secondary" onPress={()=>setSheet(null)} disabled={a.busy}/>
    </AiSheet>
    <AiSheet visible={sheet==="wallet"} onClose={()=>setSheet(null)} title="积分准备好，再继续">
      <View style={{width:58,height:58,borderRadius:18,backgroundColor:p.soft,justifyContent:"center",alignItems:"center"}}><AiIcon name="wallet" size={29}/></View>
      <AiText type="body">当前积分或服务条件尚未满足，已交付题目与作答会保留。</AiText>
      <AiNotice tone="blue" title="按实际用量结算" detail={a.error||"余额、服务价格与扣费明细以积分中心的实时信息为准。失败会释放对应预占。"} />
      <AiButton label="前往积分中心" onPress={()=>{setSheet(null);onNavigate("vip");}}/>
      <AiButton label="先继续已有题目" variant="secondary" onPress={()=>{setSheet(null);if(job)setPage(job.startedAt?"answer":"monitor");}}/>
    </AiSheet>
  </View>;
}
