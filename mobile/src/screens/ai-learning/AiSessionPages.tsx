import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, View } from "react-native";
import { AnimatedPressable, AnimatedProgressBar } from "../../components/Motion";
import { QuestionImages } from "../../components/QuestionImages";
import { mobileApi, type Question } from "../../api/client";
import type { AiLearningJob, AiLearningSummary } from "../../api/aiLearningTypes";
import { AiButton, AiCard, AiFooter, AiHeader, AiIcon, AiMetricRow, AiNotice, AiRing, AiSheet, AiSteps, AiTag, AiText, aiGoalTitle, useAiDesign } from "./AiElements";

export const aiClock=(ms:number)=>{const n=Math.ceil(Math.max(0,ms)/1000);return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");};
const blocked=(job:AiLearningJob)=>job.status==="blocked"||job.status==="canceled";
export function AiMonitorPage({job,live,busy,onBack,onStart,onRetry,onCancel,onWallet,onHistory}:{
  job:AiLearningJob;live:boolean;busy:boolean;onBack:()=>void;onStart:()=>void;onRetry:()=>void;onCancel:()=>void;onWallet:()=>void;onHistory:()=>void;
}){
  const {p}=useAiDesign(),stopped=blocked(job),done=job.status==="completed",canStart=job.readyCount>0&&(job.readyCount>=3||stopped||done);
  const pointError=/POINTS/.test(job.errorCode||"");
  const stage=job.progress?.stage,stageLabel=stage==="generate"?"正在生成":stage==="validate"?"正在程序校验":stage==="review"?"正在独立审核":stage==="retrying"?"正在安排重试":"正在准备";
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title={job.kind==="exam"?"AI 组卷":"专属题组"} onBack={onBack} action="记录" onAction={onHistory}/>
    <ScrollView contentContainerStyle={{padding:20,paddingTop:8,gap:18}}>
      <AiTag tone={stopped?"amber":"blue"}>{aiGoalTitle(job.strategy)} · {job.kind==="exam"?"模拟考试":"专属练习"}</AiTag>
      <AiText type="hero">{done?"这一组，已准备好":stopped?"进度保留，稍后继续":"题目逐步就绪，\n先做已备好的"}</AiText>
      <AiText type="small" tone="muted">{done?"题目均已通过交付检查并保存至本次私有题组。":stopped?"已就绪题目与作答都保留，不会为了补齐题量降低标准。":"每道题先生成、校验并独立审核，通过后才会交付。"}</AiText>
      <AiRing value={job.readyCount} total={job.targetCount} label="题已就绪"/>
      <AiSteps stage={done?"done":stopped?"queued":stage}/>
      <AiCard style={{paddingVertical:8}}>
        {[{icon:"check",title:"已就绪",value:job.readyCount+"道",tone:"green" as const},
          {icon:done?"check":stopped?"pause":"hourglass",title:done?"本组全部就绪":stopped?"后续生成已暂停":stageLabel+"第"+Math.min(job.progress?.position||job.readyCount+1,job.targetCount)+"题",value:done?"已保存":stopped?"可保留成果":"处理中",tone:"blue" as const},
          {icon:"clock",title:"待交付",value:job.targetCount-job.readyCount+"道",tone:"muted" as const}].map(row=><View key={row.title} style={{flexDirection:"row",gap:10,minHeight:42,alignItems:"center"}}>
            <AiIcon name={row.icon} tone={row.tone} size={18}/><AiText type="small" tone={row.tone} style={{flex:1}}>{row.title}</AiText><AiText type="tiny" tone="muted">{row.value}</AiText></View>)}
      </AiCard>
      {stopped?<AiNotice tone="amber" icon="warning" title={pointError?"积分余额暂不足":job.status==="canceled"?"已停止后续生成":"后续题目暂未交付"}
        detail={job.error||"已有题目与作答继续保留，可按已就绪题目完成本次练习。"}/>:<AiNotice icon="cloud" title="切换页面，不会取消生成" detail={live?"实时进度已连接，后续题目会自动加入。":"正在恢复实时连接，已交付题目仍保留。"}/>}
      <AiText type="tiny" tone="muted">已结算 {(job.billing.chargedUnits/job.billing.scale).toFixed(2)} 积分 · 预占 {(job.billing.heldUnits/job.billing.scale).toFixed(2)} 积分。失败会释放对应预占，按实际用量结算。</AiText>
      {stopped&&job.status==="blocked"&&<AiButton label={pointError?"查看积分":job.retryable?"恢复后续生成":"本题重试已达上限"} onPress={pointError?onWallet:onRetry} variant="secondary" disabled={!pointError&&!job.retryable||busy}/>}
      {!stopped&&!done&&<AiButton label="停止后续生成" onPress={onCancel} variant="text" disabled={busy}/>}
    </ScrollView><AiFooter><AiButton label={job.startedAt?"继续作答":canStart?"开始作答":"等待首批题目就绪"} onPress={onStart} disabled={!canStart} busy={busy} icon={canStart?"right":undefined}/>
      <AiText type="tiny" tone="muted" style={{textAlign:"center"}}>{canStart?"先做已就绪的，后续题目审核后自动加入":"首批3题就绪即可开始，不需要等待整组完成"}</AiText></AiFooter>
  </View>;
}

export function AiAnswerPage({job,answers,index,onIndex,onChoose,remaining,saveState,live,busy,onBack,onSubmit,onSync,onResolve,onMonitor}:{
  job:AiLearningJob;answers:Record<string,string[]>;index:number;onIndex:(n:number)=>void;onChoose:(id:string,value:string[])=>void;
  remaining:number|null;saveState:string;live:boolean;busy:boolean;onBack:()=>void;onSubmit:()=>void;onSync:()=>void;onResolve:()=>void;onMonitor:()=>void;
}){
  const {p}=useAiDesign(),[card,setCard]=useState(false),q=job.questions[index],selected=q?answers[q.id]||[]:[];
  const answered=job.questions.filter(q=>(answers[q.id]||[]).length).length,stopped=blocked(job),expired=remaining===0;
  const locked=expired||saveState==="conflict"||saveState==="expired",saved=saveState==="saved";
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title={job.kind==="exam"?"AI 个性化考试":"专属练习"} onBack={onBack} action="答题卡" onAction={()=>setCard(true)}/>
    <View style={{paddingHorizontal:20,gap:9,paddingBottom:10}}>
      <View style={{flexDirection:"row",gap:8,alignItems:"center"}}><AiIcon name={job.waiting?"pause":"clock"} size={17} tone={job.waiting?"amber":"muted"}/>
        <AiText type="small" tone={job.waiting?"amber":"muted"} style={{flex:1}}>{remaining===null?"不限时练习":job.waiting?"计时已暂停 · "+aiClock(remaining):"剩余 "+aiClock(remaining)}</AiText>
        <AiText type="tiny" tone="muted">已答 {answered}/{job.targetCount}</AiText></View>
      <AnimatedProgressBar value={answered/job.targetCount*100} color={p.blue} trackColor={p.line}/>
      <View style={{backgroundColor:p.soft,paddingHorizontal:10,paddingVertical:7,borderRadius:9,flexDirection:"row",alignItems:"center",gap:7}}>
        <AiIcon name={job.status==="completed"?"check":stopped?"pause":"cloud"} size={16}/><AiText type="tiny" tone="blue" style={{flex:1}}>
          已就绪 {job.readyCount}/{job.targetCount} 题 · {job.status==="completed"?"本组已全部保存":stopped?"后续暂未交付":"后续题目审核后自动加入"}</AiText></View>
    </View>
    <ScrollView key={q?.id||"waiting-"+index} contentContainerStyle={{paddingHorizontal:20,paddingTop:6,paddingBottom:22,gap:16}}>
      {saveState==="local"||saveState==="saving"?<AiNotice tone={saveState==="local"?"amber":"blue"} icon={saveState==="local"?"offline":"cloud"}
        title={saveState==="local"?"本机暂存，待同步":"正在同步本次作答"} detail="尚未收到服务器确认，请保留本机记录。" action={saveState==="local"?"重试":undefined} onAction={onSync}/>:
        saveState==="conflict"||saveState==="expired"?<AiNotice tone="amber" icon="warning" title={saveState==="expired"?"本机作答晚于考试截止":"另一设备更新了作答"}
          detail="本机改动尚未覆盖服务器，请先确认采用哪份记录。" action="处理" onAction={onResolve}/>:!live&&!saved?<AiNotice tone="amber" title="正在恢复连接" detail="已交付题目仍可使用，作答会尝试暂存。"/>:null}
      {expired&&<AiNotice tone="amber" title="考试时间已到" detail="以服务器截止前确认的作答为准，请核对后交卷。" action="交卷" onAction={onSubmit}/>}
      {q?<>
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><AiTag>第 {q.position} 题 / 共 {job.targetCount} 题</AiTag>
          <AiText type="small" tone="muted">{q.type==="multiple_choice"?"多选题":q.type==="true_false"?"判断题":"单选题"}</AiText></View>
        {!!q.sharedStem&&<AiCard soft><AiText type="body">{q.sharedStem}</AiText></AiCard>}
        <AiText type="heading" style={{fontSize:19,lineHeight:31}}>{q.question}</AiText><QuestionImages question={q}/>
        <View style={{gap:12}}>{Object.entries(q.options).map(([letter,text])=><AnimatedPressable key={letter}
          accessibilityRole={q.type==="multiple_choice"?"checkbox":"radio"} accessibilityLabel={letter+" "+text} accessibilityState={{checked:selected.includes(letter),disabled:locked}}
          disabled={locked} onPress={()=>onChoose(q.id,q.type==="multiple_choice"?(selected.includes(letter)?selected.filter(x=>x!==letter):[...selected,letter]):selected.includes(letter)?[]:[letter])}
          style={{minHeight:62,flexDirection:"row",alignItems:"flex-start",padding:15,gap:12,borderWidth:selected.includes(letter)?1.3:1,borderRadius:13,borderColor:selected.includes(letter)?p.blue:p.line,backgroundColor:selected.includes(letter)?p.soft:p.card,opacity:locked?0.7:1}}>
          <View style={{width:28,height:28,borderRadius:8,alignItems:"center",justifyContent:"center",backgroundColor:selected.includes(letter)?p.blue:p.bg}}>
            <AiText type="small" style={{fontWeight:"600",color:selected.includes(letter)?"#FFF":p.muted}}>{letter}</AiText></View>
          <AiText type="body" style={{flex:1,paddingTop:1,color:selected.includes(letter)?p.link:p.ink}}>{text}</AiText>
        </AnimatedPressable>)}</View>
        <AiText type="tiny" tone="muted">{q.type==="multiple_choice"?"可选择多个选项；交卷后统一查看解析。":"作答自动保存；交卷后统一查看答案与解析。"}</AiText>
      </>:<View style={{gap:20,paddingTop:22}}>
        <View style={{width:72,height:72,backgroundColor:stopped?p.amberSoft:p.soft,alignSelf:"center",borderRadius:22,alignItems:"center",justifyContent:"center"}}><AiIcon name={stopped?"pause":"hourglass"} size={34} tone={stopped?"amber":"blue"}/></View>
        <AiText type="title" style={{textAlign:"center"}}>{stopped?"这一题，暂未交付":"下一题正在准备中"}</AiText>
        <AiText type="body" tone="muted" style={{textAlign:"center"}}>{stopped?"已作答内容保留，可以返回进度页恢复，或明确选择部分交卷。":"通过检查后会自动显示在这里，先别急。"}</AiText>
        <AiCard><AiMetricRow items={[{value:job.readyCount,label:"题已就绪"},{value:answered,label:"题已作答"},{value:job.targetCount-job.readyCount,label:"题待交付"}]}/></AiCard>
        {job.waiting?<AiNotice tone="green" icon="pause" title="服务器已暂停计时" detail="等待缺题期间不占用考试时间，后续题目交付后恢复。"/>:
          remaining!==null?<AiNotice tone="amber" icon="clock" title={answered<job.readyCount?"还有已就绪题未作答，计时继续":"等待服务器确认作答"} detail="仅在服务器确认已交付题目全部作答且仍缺题时暂停计时。"/>:
          <AiNotice icon="cloud" title="不限时练习，进度持续保留" detail="可回看已有题目；后续生成不会因离开这个页面而取消。"/>}
        <AiButton label="回看已就绪题目" variant="secondary" onPress={()=>onIndex(Math.max(0,job.readyCount-1))}/>
        {stopped&&<AiButton label="查看生成进度" variant="text" onPress={onMonitor}/>}
      </View>}
    </ScrollView>
    <AiFooter><View style={{flexDirection:"row",gap:10}}><AiButton label="上一题" variant="secondary" disabled={index===0} onPress={()=>onIndex(index-1)} style={{flex:0.8}}/>
      <AiButton label={expired||index>=job.targetCount-1?"核对并交卷":q?"下一题":"等待后续题目"} disabled={!q&&!expired&&index<job.targetCount-1} busy={busy}
        onPress={()=>expired||index>=job.targetCount-1?onSubmit():onIndex(index+1)} style={{flex:1.4}}/></View>
      <View style={{flexDirection:"row",alignItems:"center",gap:6,justifyContent:"center"}}><AiIcon name={saved?"check":"cloud"} size={13} tone={saved?"green":"muted"}/><AiText type="tiny" tone="muted">{saved?"当前作答已同步":saveState==="saving"?"正在同步":"本机作答待确认"}</AiText></View>
    </AiFooter>
    <AiSheet visible={card} onClose={()=>setCard(false)} title="答题卡"><AiText type="small" tone="muted">点击题号切换；待生成题通过审核后才会显示。</AiText>
      <ScrollView style={{maxHeight:410}} contentContainerStyle={{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:10}}>
        {Array.from({length:job.targetCount},(_,i)=>{const question=job.questions[i],isAnswered=question&&(answers[question.id]||[]).length>0,current=i===index;
          return <AnimatedPressable key={i} accessibilityRole="button" accessibilityLabel={"第"+(i+1)+"题，"+(isAnswered?"已答":question?"就绪":"待生成")} accessibilityState={{selected:current}}
            onPress={()=>{onIndex(i);setCard(false);}} style={{width:"17.5%",minHeight:46,alignItems:"center",justifyContent:"center",borderRadius:9,
              backgroundColor:isAnswered?p.blue:question?p.soft:p.card,borderColor:current?p.ink:question?p.blue:p.line,borderWidth:current?2:1,borderStyle:question?"solid":"dashed"}}>
            <AiText type="small" style={{fontWeight:"600",color:isAnswered?"#FFF":question?p.link:p.muted}}>{i+1}</AiText></AnimatedPressable>;})}
      </ScrollView>
      <View style={{flexDirection:"row",justifyContent:"space-between"}}>{[{label:"已答",color:p.blue},{label:"就绪",color:p.soft},{label:"待生成",color:p.card}].map(item=><View key={item.label} style={{flexDirection:"row",gap:6,alignItems:"center"}}><View style={{width:12,height:12,borderRadius:3,backgroundColor:item.color,borderWidth:1,borderColor:p.line}}/><AiText type="tiny" tone="muted">{item.label}</AiText></View>)}</View>
      <AiMetricRow items={[{label:"已作答",value:answered},{label:"未作答就绪题",value:job.readyCount-answered},{label:"待生成",value:job.targetCount-job.readyCount}]}/>
      <AiButton label="核对并交卷" onPress={()=>{setCard(false);onSubmit();}} busy={busy}/>
    </AiSheet>
  </View>;
}

export function AiResultPage({job,onBack,onReview,onAgain}:{job:AiLearningJob;onBack:()=>void;onReview:()=>void;onAgain:(names:string[])=>void}){
  const {p}=useAiDesign(),result=job.result!;
  const wrong=new Map<string,number>();for(const q of result.results)if(!q.correct){const name=q.knowledgePoint||q.chapter||"待归类知识点";wrong.set(name,(wrong.get(name)||0)+1);}
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title="本次成绩" onBack={onBack}/>
    <ScrollView contentContainerStyle={{padding:20,paddingTop:8,gap:18}}><AiTag tone={result.partial?"amber":"green"}>{result.partial?"部分完成":"本次训练已完成"}</AiTag>
      <AiText type="hero">{wrong.size?"找到薄弱点，就是进步的起点":"这一组，稳稳拿下"}</AiText>
      <AiRing value={result.score} total={result.maxScore} label="题答对"/>
      <AiMetricRow items={[{label:"正确率",value:result.maxScore?Math.round(result.score/result.maxScore*100)+"%":"—"},{label:"实际用时",value:aiClock(result.elapsed)},{label:"待巩固知识点",value:wrong.size}]}/>
      {result.partial&&<AiNotice tone="amber" title="本次按已就绪题目计分" detail={"已计分"+result.maxScore+"/"+result.targetCount+"题，未生成题未计错，不作为完整模拟考试成绩。"}/>}
      <AiCard><AiText type="heading">{wrong.size?"这几个点，再巩固一下":"下一步怎么练"}</AiText>
        {wrong.size?[...wrong].slice(0,4).map(([name,n])=><View key={name} style={{flexDirection:"row",gap:10,alignItems:"center",paddingVertical:5}}><View style={{width:5,height:5,borderRadius:3,backgroundColor:p.red}}/><AiText type="small" style={{flex:1}}>{name}</AiText><AiText type="tiny" tone="red">{n}道未答对</AiText></View>):
          <AiText type="small" tone="muted">保持间隔巩固，累积不同题目的稳定掌握证据，再逐步挑战更难内容。</AiText>}</AiCard>
      <AiCard><AiText type="heading">方案回顾</AiText><AiText type="small" tone="muted">{aiGoalTitle(job.strategy)} · {job.blueprint.reasons.map(q=>q.knowledgePoint).join(" / ")}</AiText>
        <AiText type="tiny" tone="muted">{result.notice}</AiText></AiCard>
    </ScrollView><AiFooter><AiButton label="查看逐题解析" onPress={onReview}/><AiButton label={wrong.size?"再练错题范围":"继续专属训练"} variant="secondary" onPress={()=>onAgain([...wrong.keys()])}/></AiFooter>
  </View>;
}

export function AiReviewPage({job,onBack}:{job:AiLearningJob;onBack:()=>void}){
  const {p}=useAiDesign(),[filter,setFilter]=useState<"all"|"wrong">("all"),[index,setIndex]=useState(0),[options,setOptions]=useState(false);
  const results=job.result!.results,items=filter==="wrong"?results.filter(q=>!q.correct):results,q=items[Math.min(index,items.length-1)];
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title="逐题解析" onBack={onBack}/>
    <View style={{flexDirection:"row",gap:8,paddingHorizontal:20,paddingBottom:12}}>{([{id:"all",label:"全部 "+results.length},{id:"wrong",label:"错题 "+results.filter(q=>!q.correct).length}] as const).map(item=><AnimatedPressable key={item.id}
      accessibilityRole="tab" accessibilityState={{selected:filter===item.id}} onPress={()=>{setFilter(item.id);setIndex(0);setOptions(false);}} style={{borderRadius:9,paddingHorizontal:16,minHeight:42,justifyContent:"center",backgroundColor:filter===item.id?p.blue:p.card,borderWidth:1,borderColor:filter===item.id?p.blue:p.line}}>
      <AiText type="small" style={{color:filter===item.id?"#FFF":p.muted,fontWeight:"600"}}>{item.label}</AiText></AnimatedPressable>)}</View>
    <ScrollView key={q?.id||"none"} contentContainerStyle={{padding:20,paddingTop:8,gap:16}}>{q?<>
      <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><AiTag tone={q.correct?"green":"red"}>{q.correct?"已答对":"需要巩固"}</AiTag><AiText type="small" tone="muted">第 {index+1} 题 / {items.length} 题</AiText></View>
      {!!q.sharedStem&&<AiCard soft><AiText>{q.sharedStem}</AiText></AiCard>}<AiText type="heading" style={{fontSize:19,lineHeight:31}}>{q.question}</AiText><QuestionImages question={q}/>
      <View style={{flexDirection:"row",gap:10}}><AiCard style={{flex:1,backgroundColor:q.correct?p.greenSoft:p.redSoft,borderWidth:0,gap:6}}><AiText type="tiny" tone={q.correct?"green":"red"}>你的答案</AiText><AiText type="heading" tone={q.correct?"green":"red"}>{q.selected.join("、")||"未作答"}</AiText></AiCard>
        <AiCard style={{flex:1,backgroundColor:p.greenSoft,borderWidth:0,gap:6}}><AiText type="tiny" tone="green">正确答案</AiText><AiText type="heading" tone="green">{q.answer?.join("、")||"—"}</AiText></AiCard></View>
      <AiCard><AiText type="heading">解题思路</AiText><AiText type="body" style={{lineHeight:27}}>{q.analysis||"本题暂无解析，原作答与评分保留。"}</AiText>
        {!!q.knowledgePoint&&<AiTag>{q.knowledgePoint}</AiTag>}</AiCard>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel={options?"收起全部选项":"查看全部选项"} onPress={()=>setOptions(!options)} style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:8}}>
        <AiIcon name="book" size={18}/><AiText type="small" tone="blue">{options?"收起全部选项":"查看全部选项"}</AiText></AnimatedPressable>
      {options&&Object.entries(q.options).map(([key,value])=><View key={key} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:p.line}}><AiText type="body" tone={q.answer?.includes(key)?"green":"ink"}>{key}  {value}</AiText></View>)}
    </>:<AiCard><AiIcon name="check" tone="green" size={32}/><AiText type="heading">本次没有错题</AiText><AiText type="small" tone="muted">切换“全部”可查看每道题的解题思路。</AiText></AiCard>}</ScrollView>
    <AiFooter><View style={{flexDirection:"row",gap:10}}><AiButton label="上一题解析" variant="secondary" disabled={!q||index===0} onPress={()=>{setIndex(index-1);setOptions(false);}} style={{flex:1}}/>
      <AiButton label={index>=items.length-1?"返回成绩":"下一题解析"} onPress={()=>{if(index>=items.length-1)onBack();else{setIndex(index+1);setOptions(false);}}} disabled={!q} style={{flex:1}}/></View></AiFooter>
  </View>;
}

export function AiHistoryPage({initialKind,onBack,onOpen}:{initialKind:"practice"|"exam";onBack:()=>void;onOpen:(id:string)=>void}){
  const {p}=useAiDesign(),[kind,setKind]=useState(initialKind),[list,setList]=useState<AiLearningSummary[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[nonce,setNonce]=useState(0);
  useEffect(()=>{let alive=true;setLoading(true);setError("");void mobileApi.aiLearningJobs().then(r=>{if(alive)setList(r.jobs);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:"记录读取失败");}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[nonce]);
  const date=(createdAt:string)=>{const d=new Date(createdAt);return Number.isFinite(d.getTime())?d.toLocaleDateString("zh-CN",{month:"long",day:"numeric"})+" "+d.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}):"较早记录";};
  const status=(job:AiLearningSummary)=>job.submitted?"已完成":job.status==="completed"?"题目已就绪":job.status==="blocked"?"待恢复":job.status==="canceled"?"已停止":"生成中";
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title="生成记录" onBack={onBack} action="刷新" onAction={()=>setNonce(n=>n+1)}/>
    <View style={{flexDirection:"row",gap:4,marginHorizontal:20,padding:4,borderRadius:12,backgroundColor:p.line}}>{([{id:"practice",label:"专属练习"},{id:"exam",label:"AI 考试"}] as const).map(item=><AnimatedPressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:kind===item.id}}
      onPress={()=>setKind(item.id)} style={{flex:1,minHeight:42,borderRadius:9,alignItems:"center",justifyContent:"center",backgroundColor:kind===item.id?p.blue:"transparent"}}>
      <AiText type="small" style={{color:kind===item.id?"#FFF":p.muted}}>{item.label}</AiText></AnimatedPressable>)}</View>
    <FlatList data={list.filter(job=>job.kind===kind)} keyExtractor={q=>q.id} contentContainerStyle={{padding:20,gap:12}} initialNumToRender={12} refreshing={loading} onRefresh={()=>setNonce(n=>n+1)}
      ListHeaderComponent={error?<AiNotice tone="amber" title="记录读取暂未完成" detail={error} action="重试" onAction={()=>setNonce(n=>n+1)}/>:<AiText type="tiny" tone="muted">仅展示当前账号、当前证书的题组</AiText>}
      renderItem={({item:job})=><AnimatedPressable accessibilityRole="button" accessibilityLabel={aiGoalTitle(job.strategy)+" "+status(job)+" "+date(job.createdAt)} onPress={()=>onOpen(job.id)}>
        <AiCard style={{gap:12}}><View style={{flexDirection:"row",gap:10,alignItems:"center"}}><View style={{width:34,height:34,borderRadius:10,backgroundColor:p.soft,justifyContent:"center",alignItems:"center"}}><AiIcon name={kind==="exam"?"document":"book"} size={20}/></View>
          <View style={{flex:1,gap:3}}><AiText type="body" style={{fontWeight:"600"}}>{aiGoalTitle(job.strategy)}</AiText><AiText type="tiny" tone="muted">{date(job.createdAt)}</AiText></View><AiIcon name="right" tone="muted" size={18}/></View>
          <View style={{flexDirection:"row",gap:10,alignItems:"center"}}><AiTag tone={job.submitted?"green":job.status==="blocked"?"amber":job.status==="canceled"?"muted":"blue"}>{status(job)}</AiTag><AiText type="tiny" tone="muted" style={{flex:1,textAlign:"right"}}>就绪 {job.readyCount}/{job.targetCount} · 已答 {job.answeredCount}</AiText></View>
        </AiCard></AnimatedPressable>}
      ListEmptyComponent={<View style={{paddingTop:35,gap:12,alignItems:"center"}}>{loading?<ActivityIndicator color={p.blue}/>:<><AiIcon name="document" size={36}/><AiText type="heading">还没有生成记录</AiText><AiText type="small" tone="muted">确认专属方案后，进度会自动保留在这里。</AiText></>}</View>}/>
  </View>;
}
