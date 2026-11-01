import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppAlert as Alert } from "../components/AppAlert";
import { AppIcon } from "../components/AppIcon";
import { AnimatedPressable, AnimatedProgressBar } from "../components/Motion";
import { QuestionImages } from "../components/QuestionImages";
import { useAiLearningFocus } from "../components/AiLearningFocus";
import { mobileApi, type AuthResponse } from "../api/client";
import { useAiLearning } from "../api/useAiLearning";
import { studyRequestId } from "../api/studyTypes";
import type { AiLearningKind, AiLearningQuote, AiLearningSetup, AiLearningStrategy } from "../api/aiLearningTypes";
import { useScreenActive } from "../navigation/ScreenActivity";
import { useTheme, useThemedStyles, type ThemeColors } from "../theme";
import type { AppTab, NavigationOptions } from "../types";

const modes=[
  {id:"weakness" as const,title:"攻克不会的",description:"先补短板，再做变式",icon:"wrong"},
  {id:"challenge" as const,title:"挑战更难的",description:"在已掌握基础上进阶",icon:"chart"},
  {id:"review" as const,title:"巩固易忘的",description:"把答对的真正记牢",icon:"refresh"},
  {id:"balanced" as const,title:"综合提分",description:"补弱项，也保住强项",icon:"exam"},
];
const title=(id:string)=>modes.find(m=>m.id===id)?.title||"个性化练习";
const clock=(ms:number)=>{const seconds=Math.ceil(Math.max(0,ms)/1000);return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");};
export function AiLearningScreen({kind="practice",preview=false,user,certificateName="当前证书",onNavigate,onExamFocus}:{
  kind?:AiLearningKind;preview?:boolean;user?:AuthResponse["user"];certificateName?:string;
  onNavigate:(tab:AppTab,options?:NavigationOptions)=>void;onExamFocus?:(focus:boolean)=>void;
}){
  const active=useScreenActive(),s=useThemedStyles(styles),{colors:c}=useTheme();
  const a=useAiLearning(user?.id,user?.certificateId,kind,active,preview),{job,profile}=a;
  const [strategy,setStrategy]=useState<AiLearningStrategy>("weakness"),[count,setCount]=useState<10|20|30|50>(kind==="exam"?30:10);
  const [duration,setDuration]=useState(40),[pointIds,setPointIds]=useState<string[]>([]),[scopeOpen,setScopeOpen]=useState(false);
  const [scopeSearch,setScopeSearch]=useState("");
  const [history,setHistory]=useState(false),[quote,setQuote]=useState<AiLearningQuote|null>(null),[index,setIndex]=useState(0),[answerMode,setAnswerMode]=useState(false);
  const quoted=useRef<AiLearningSetup|null>(null),request=useRef("");
  const focused=kind==="exam"&&answerMode&&!!job?.startedAt&&!job.submitted;
  useAiLearningFocus(focused);
  useEffect(()=>{onExamFocus?.(focused);return()=>onExamFocus?.(false);},[focused,onExamFocus]);
  useEffect(()=>{setIndex(0);setAnswerMode(!!job?.startedAt&&!job.submitted);},[job?.id,job?.startedAt,job?.submitted]);
  useEffect(()=>{
    if(!active||!answerMode)return;
    const listener=BackHandler.addEventListener("hardwareBackPress",()=>{void a.flush().then(()=>setAnswerMode(false));return true;});
    return()=>listener.remove();
  },[active,answerMode,a.flush]);
  const button=(label:string,fn:()=>void,disabled=false,secondary=false)=><AnimatedPressable accessibilityRole="button" accessibilityState={{disabled}} onPress={fn} disabled={disabled}
    style={[s.button,secondary?s.secondary:s.primary,disabled&&s.disabled]}><Text style={secondary?s.link:s.white}>{label}</Text></AnimatedPressable>;
  const errors=a.error?<View accessibilityLiveRegion="polite" style={s.errorPanel}><Text style={s.error}>{a.error}</Text></View>:null;
  const previewPlan=async()=>{
    if(preview||!user?.id){a.setError("登录后即可分析你的实际作答记录。");return;}
    a.setBusy(true);a.setError("");
    try{
      const setup:AiLearningSetup={kind,strategy,count:kind==="practice"?10:count,durationMinutes:duration,pointIds};
      const q=await mobileApi.aiLearningQuote(setup);quoted.current=setup;request.current=studyRequestId();setQuote(q);
    }catch(e){a.setError(e instanceof Error?e.message:"方案读取失败");}finally{a.setBusy(false);}
  };
  const generate=async()=>{
    if(!quote||!quoted.current||a.busy)return;
    if(!await a.flush()){a.setError("请先同步当前作答。");return;}
    a.setBusy(true);a.setError("");
    try{a.acceptCreated(await mobileApi.createAiLearningJob(quoted.current,request.current,quote.profileRevision));setQuote(null);}
    catch(e){a.setError(e instanceof Error?e.message:"提交失败，重试会复用本次请求编号");}finally{a.setBusy(false);}
  };
  const submit=()=>{
    if(!job)return;
    const partial=job.readyCount<job.targetCount;
    Alert.alert(partial?"题目尚未全部就绪":"确认交卷",partial?"将按已就绪题目部分交卷，未生成题不算错，也不作为完整模拟考试成绩。":"未作答题将计为错误，交卷后显示答案与解析。",
      [{text:"继续作答",style:"cancel"},{text:partial?"部分交卷":"确认交卷",onPress:()=>void a.submit(partial)}]);
  };
  const stopped=job?.status==="blocked"||job?.status==="canceled";
  if(answerMode&&job?.startedAt&&!job.submitted){
    const q=job.questions[index],selected=q?a.answers[q.id]||[]:[];
    const answered=job.questions.filter(q=>(a.answers[q.id]||[]).length).length;
    return <View style={s.screen}>
      <View style={s.header}><AnimatedPressable accessibilityRole="button" accessibilityLabel="暂存返回" onPress={()=>void a.flush().then(()=>setAnswerMode(false))} style={{minWidth:64,minHeight:48,justifyContent:"center"}}><Text style={s.link}>‹ 返回</Text></AnimatedPressable><Text accessibilityRole="header" style={s.headerTitle}>{kind==="exam"?"AI 个性化考试":"专属练习"}</Text>
        <AnimatedPressable accessibilityRole="button" disabled={a.busy} onPress={submit}><Text style={s.link}>交卷</Text></AnimatedPressable></View>
      <View style={s.rowBetween}><Text style={s.body}>{a.remaining===null?"不限时练习":"剩余 "+clock(a.remaining)}</Text><Text style={s.body}>已答 {answered} / {job.targetCount}</Text></View>
      <AnimatedProgressBar value={answered/job.targetCount*100} color={c.brand} trackColor={c.border}/>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.soft}><Text style={s.cardTitle}>已就绪 {job.readyCount} / {job.targetCount} 题</Text>
          <Text style={s.muted}>{job.waiting?"等待缺题，服务器已暂停计时":job.status==="completed"?"本卷题目均已审核并保存":stopped?"后续生成已暂停，现有题目与作答保留":"后续题目审核后自动加入，不影响当前作答"}</Text>
          <Text style={s.small}>{a.live?"实时进度已连接":"正在续接实时进度，定期同步仍可用"}</Text></View>{errors}
        {(a.saveState==="conflict"||a.saveState==="expired")&&<View style={s.card}><Text style={s.error}>{a.saveState==="expired"?"考试已到期，本机尚未同步的作答不能覆盖到期前服务器记录。":"另一设备更新了作答，本机改动尚未覆盖服务器。"}</Text>
          {button("使用服务器记录",()=>Alert.alert(a.saveState==="expired"?"按到期前服务器作答继续？":"确认放弃本机冲突改动？",
            a.saveState==="expired"?"本机晚到作答会单独暂存待核对；交卷以服务器已保存记录为准。":"服务器记录将保留。",[{text:"取消",style:"cancel"},{text:"确认",onPress:()=>void a.useServer()}]),false,true)}</View>}
        {q?<View style={s.card}><View style={s.rowBetween}><Text style={s.muted}>第 {q.position} 题 / 共 {job.targetCount} 题</Text><Text style={s.muted}>{q.type==="multiple_choice"?"多选题":q.type==="true_false"?"判断题":"单选题"}</Text></View>
          {!!q.sharedStem&&<Text style={s.body}>{q.sharedStem}</Text>}<Text style={s.question}>{q.question}</Text><QuestionImages question={q}/>
          {Object.entries(q.options).map(([letter,text])=><AnimatedPressable key={letter} accessibilityRole={q.type==="multiple_choice"?"checkbox":"radio"} accessibilityLabel={letter+" "+text}
            accessibilityState={{checked:selected.includes(letter),disabled:a.remaining===0||a.saveState==="conflict"}} disabled={a.remaining===0||a.saveState==="conflict"}
            onPress={()=>a.choose(q.id,q.type==="multiple_choice"?(selected.includes(letter)?selected.filter(x=>x!==letter):[...selected,letter]):selected.includes(letter)?[]:[letter])}
            style={[s.option,selected.includes(letter)&&s.selected]}><Text style={s.optionLetter}>{letter}</Text><Text style={s.optionText}>{text}</Text></AnimatedPressable>)}</View>
          :<View style={s.card}><ActivityIndicator color={c.brand}/><Text style={s.body}>当前题目仍在审核，已答内容不会丢失。</Text></View>}
        <View style={s.row}>{Array.from({length:job.targetCount},(_,i)=>{
          const item=job.questions.find(q=>q.position===i+1),done=item&&(a.answers[item.id]||[]).length>0;
          return <AnimatedPressable key={i} accessibilityRole="button" accessibilityLabel={"第 "+(i+1)+" 题，"+(!item?"待生成":done?"已答":"可答")} disabled={!item}
            onPress={()=>setIndex(job.questions.findIndex(q=>q.id===item?.id))} style={[s.number,!item&&s.pending,done&&s.primary,q?.position===i+1&&s.current]}><Text style={done?s.white:s.body}>{i+1}</Text></AnimatedPressable>;
        })}</View><Text style={s.small}>实线可答 · 虚线待生成 · 已交付题目不替换</Text>
        {job.status==="blocked"&&<><Text style={s.error}>{job.error}</Text>{button("恢复剩余题目生成",()=>void a.action("retry"),a.busy,true)}</>}
        {a.remaining===0&&<Text style={s.error}>考试时间已到，请先同步作答并交卷。</Text>}
      </ScrollView>
      <View style={s.footer}><View style={s.row}>{button("上一题",()=>setIndex(i=>Math.max(0,i-1)),index===0,true)}
        {button(index+1<job.readyCount?"下一题":job.readyCount<job.targetCount?"等待后续题目":"完成并交卷",()=>index+1<job.readyCount?setIndex(i=>i+1):submit(),index+1>=job.readyCount&&job.readyCount<job.targetCount)}</View>
        <Text accessibilityLiveRegion="polite" style={s.small}>{a.saveState==="saved"?"作答已保存":a.saveState==="saving"?"正在同步作答…":a.saveState==="conflict"?"存在作答冲突":a.saveState==="expired"?"到期作答待处理":"作答已暂存，待同步"} · 后台任务独立运行</Text>
        {a.saveState==="local"&&button("立即同步",()=>void a.flush(),a.busy,true)}</View>
    </View>;
  }
  return <View style={s.screen}><ScrollView contentContainerStyle={s.content}>
    <View style={s.header}><View style={s.row}><AppIcon name="sparkles" size={26} color={c.brand}/><Text accessibilityRole="header" style={s.title}>{kind==="exam"?"AI 个性化组卷":"AI 生成"}</Text></View>
      <AnimatedPressable accessibilityRole="button" onPress={()=>{setHistory(v=>!v);if(!preview)void a.reloadJobs().catch(e=>a.setError(String(e)));}}><Text style={s.link}>记录</Text></AnimatedPressable></View>
    <Text style={s.muted}>{certificateName} · 近 30 天作答，结合历史知识点表现</Text>{errors}
    {history&&<View style={s.card}><Text style={s.cardTitle}>我的生成记录</Text>{!a.jobs.length&&<Text style={s.muted}>暂无生成记录</Text>}{a.jobs.map(j=><AnimatedPressable key={j.id} accessibilityRole="button" disabled={a.busy} onPress={()=>void a.open(j.id)} style={s.item}>
      <Text style={s.body}>{title(j.strategy)} · {j.readyCount}/{j.targetCount} 已就绪</Text><Text style={s.muted}>{j.submitted?"已交卷":j.status==="blocked"?"待恢复":j.status==="canceled"?"已停止":j.status==="completed"?"可作答":"后台生成中"} ›</Text></AnimatedPressable>)}</View>}
    {job&&!job.submitted&&<View style={s.soft}><Text style={s.cardTitle}>{title(job.strategy)} · 已就绪 {job.readyCount} / {job.targetCount} 题</Text>
      <Text style={s.small}>累计结算 {(job.billing.chargedUnits/job.billing.scale).toFixed(2)} 积分 · 失败题预扣按规则退回</Text>
      <AnimatedProgressBar value={job.readyCount/job.targetCount*100} color={c.brand} trackColor={c.border}/><Text style={s.muted}>{job.error||"任务在服务器运行，切换页面或退出 App 不会取消。"}</Text>
      {button(job.startedAt?"继续作答":job.readyCount>=3||stopped&&job.readyCount?"开始作答":"首批题目审核中",()=>job.startedAt?setAnswerMode(true):void a.action("start"),a.busy||job.readyCount<(stopped?1:3))}
      {job.status==="blocked"&&button("恢复生成",()=>void a.action("retry"),a.busy,true)}
      {(job.status==="running"||job.status==="queued"||job.status==="blocked")&&button("停止后续生成",()=>Alert.alert("停止后续生成？","已交付题目与作答保留，只停止尚未完成部分。",[{text:"继续生成",style:"cancel"},{text:"停止生成",style:"destructive",onPress:()=>void a.action("cancel")}]),a.busy,true)}
    </View>}
    {job?.submitted&&job.result&&<View style={s.card}><Text style={s.title}>{job.result.score} / {job.result.maxScore}</Text><Text style={s.body}>{job.result.notice}</Text>{job.result.results.map((q,i)=><View key={q.id} style={s.item}>
      <Text style={s.body}>{i+1}. {q.question}</Text><Text style={q.correct?s.success:s.error}>{q.correct?"答对":"答错"} · 正确答案：{q.answer?.join("、")}</Text><Text style={s.muted}>{q.analysis}</Text></View>)}</View>}
    <View style={s.soft}><Text style={s.cardTitle}>从你的每一次作答出发</Text><Text style={s.muted}>答对和答错，都能帮你找到下一步</Text>
      <View style={s.rowBetween}>{[{n:profile?.stats.answered,label:"已答不同题目"},{n:profile?.stats.wrong,label:"最近一次答错"},{n:profile?.stats.accuracy==null?"—":profile.stats.accuracy+"%",label:"正确率"}].map(item=><View key={item.label}><Text style={s.stat}>{item.n??"—"}</Text><Text style={s.small}>{item.label}</Text></View>)}</View>
      <Text style={s.small}>同题重复作答不重复增加掌握证据。{profile?.stats.ambiguousRecords?"部分旧记录缺少证书归属，未用于判断。":""}{profile?.confidence==="insufficient"?"样本不足，本次先诊断，不直接认定掌握。":""}</Text></View>
    <Text style={s.section}>{kind==="exam"?"选择组卷目标":"今天想怎么练？"}</Text><View style={s.grid}>{modes.map(m=><AnimatedPressable key={m.id} accessibilityRole="radio" accessibilityState={{checked:strategy===m.id}} onPress={()=>setStrategy(m.id)} style={[s.mode,strategy===m.id&&s.selected]}>
      <AppIcon name={m.icon} size={26} color={c.brand}/><Text style={s.cardTitle}>{m.title}</Text><Text style={s.muted}>{m.description}</Text>{strategy===m.id&&<Text style={s.link}>已选择 ✓</Text>}</AnimatedPressable>)}</View>
    <View style={s.card}><Text style={s.cardTitle}>本次设置</Text>{kind==="exam"&&<><Text style={s.body}>题目数量</Text><View style={s.row}>{([10,20,30,50] as const).map(n=><AnimatedPressable key={n} accessibilityRole="radio" accessibilityState={{checked:n===count}} onPress={()=>setCount(n)} style={[s.chip,n===count&&s.primary]}><Text style={n===count?s.white:s.body}>{n} 题</Text></AnimatedPressable>)}</View>
      <Text style={s.body}>考试时长</Text><View style={s.row}>{[20,40,60,90].map(n=><AnimatedPressable key={n} accessibilityRole="radio" accessibilityState={{checked:n===duration}} onPress={()=>setDuration(n)} style={[s.chip,n===duration&&s.primary]}><Text style={n===duration?s.white:s.body}>{n} 分</Text></AnimatedPressable>)}</View></>}
      <AnimatedPressable accessibilityRole="button" onPress={()=>setScopeOpen(true)} style={s.item}><Text style={s.body}>知识范围</Text><Text style={s.link}>{pointIds.length?"已选 "+pointIds.length+" 个知识点":"跟随分析，可调整"} ›</Text></AnimatedPressable>
      <Text style={s.small}>{kind==="exam"?"首批 3 题审核后开考；等待缺题由服务器暂停计时。":"每组 10 道 · 先做题，再看解析"}</Text></View>
    {button(kind==="exam"?"生成 AI 试卷":"生成专属练习",()=>void previewPlan(),a.busy||!!job&&!job.submitted&&(job.status==="running"||job.status==="queued"||!!job.startedAt))}
    <Text style={s.small}>生成前确认积分规则 · 逐题审核 · 支持后台生成与断线续接</Text><View style={s.row}>{button("错题本",()=>onNavigate("wrong"),false,true)}{button("题库练习",()=>onNavigate("practice"),false,true)}</View>
  </ScrollView>
  <Modal visible={!!quote} transparent animationType="fade" onRequestClose={()=>{if(!a.busy)setQuote(null);}}><View style={s.overlay}><View style={s.sheet}><ScrollView contentContainerStyle={s.sheetContent}>
    <Text style={s.title}>{title(strategy)} · 本次方案</Text>{quote&&<><Text style={s.body}>{quote.blueprint.notice}</Text>{quote.blueprint.reasons.map(r=><View key={r.pointId} style={s.item}><Text style={s.cardTitle}>{r.knowledgePoint}</Text><Text style={s.muted}>{r.evidence}</Text></View>)}
    <Text style={s.cardTitle}>这次会怎么生成</Text>{Object.entries(quote.blueprint.slots.reduce<Record<string,number>>((all,slot)=>({...all,[slot.stage]:(all[slot.stage]||0)+1}),{})).map(([stage,n])=><Text key={stage} style={s.body}>{stage} · {n} 道</Text>)}
    <Text style={s.small}>{quote.blueprint.weightBasis}</Text><View style={s.soft}><Text style={s.cardTitle}>积分使用确认</Text><Text style={s.body}>{quote.pricing.sampleUnits===null?"暂无可核验的价格示例":"标准用量示例："+(quote.pricing.sampleUnits/quote.pricing.scale).toFixed(2)+" 积分"}</Text><Text style={s.muted}>{quote.pricing.notice}</Text></View></>}
    {errors}{button(a.busy?"正在提交…":"同意积分规则，确认生成",()=>void generate(),a.busy||!quote?.pricing.available)}{button("返回调整",()=>setQuote(null),a.busy,true)}
  </ScrollView></View></View></Modal>
  <Modal visible={scopeOpen} transparent animationType="fade" onRequestClose={()=>setScopeOpen(false)}><View style={s.overlay}><View style={[s.sheet,{height:"88%",padding:16,gap:12}]}>
    <Text style={s.title}>选择知识范围</Text><Text style={s.muted}>未选择时跟随分析；最多选 4 个知识点。</Text>
    <TextInput accessibilityLabel="搜索知识点" placeholder="搜索章节或知识点" placeholderTextColor={c.textMuted} value={scopeSearch} onChangeText={setScopeSearch}
      style={{borderWidth:1,borderColor:c.border,borderRadius:10,minHeight:48,padding:12,color:c.text,fontSize:16}}/>
    <FlatList style={{flex:1}} data={(profile?.points||[]).filter(p=>(p.chapter+p.knowledgePoint).includes(scopeSearch.trim()))}
      keyExtractor={p=>p.id} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5} keyboardShouldPersistTaps="handled"
      renderItem={({item:p})=><AnimatedPressable accessibilityRole="checkbox" accessibilityState={{checked:pointIds.includes(p.id)}} style={s.item}
        onPress={()=>setPointIds(ids=>ids.includes(p.id)?ids.filter(id=>id!==p.id):ids.length<4?[...ids,p.id]:ids)}>
        <Text style={s.body}>{pointIds.includes(p.id)?"✓ ":""}{p.knowledgePoint}</Text><Text style={s.small}>{p.chapter} · {p.recentWrong}/{p.recentCount} 道近期不同题答错</Text></AnimatedPressable>}
      ListEmptyComponent={<Text style={s.muted}>没有匹配的知识点</Text>}/>
    {button("跟随分析",()=>{setPointIds([]);setScopeOpen(false);},false,true)}{button("使用所选范围",()=>setScopeOpen(false))}
  </View></View></Modal></View>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:16,gap:16,paddingBottom:32},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,padding:8},
 headerTitle:{flex:1,color:c.text,fontSize:18,fontWeight:"700",textAlign:"center"},title:{color:c.text,fontSize:24,fontWeight:"700"},section:{color:c.text,fontSize:20,fontWeight:"700"},
 row:{flexDirection:"row",gap:8,alignItems:"center",flexWrap:"wrap"},rowBetween:{flexDirection:"row",justifyContent:"space-between",gap:10,padding:8,alignItems:"center"},
 card:{backgroundColor:c.surface,borderRadius:14,padding:16,gap:12,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border},soft:{backgroundColor:c.brandSoft,borderRadius:14,padding:16,gap:10},
 cardTitle:{fontSize:17,lineHeight:25,fontWeight:"700",color:c.text},body:{fontSize:16,lineHeight:25,color:c.text},muted:{fontSize:14,lineHeight:22,color:c.textMuted},small:{fontSize:12,lineHeight:20,color:c.textMuted},
 link:{color:c.brand,fontSize:14,lineHeight:23,fontWeight:"600"},white:{color:"#FFFFFF",fontSize:15,lineHeight:23,fontWeight:"600"},stat:{color:c.brand,fontSize:28,fontWeight:"700"},
 grid:{flexDirection:"row",gap:10,flexWrap:"wrap"},mode:{width:"48%",minWidth:130,flexGrow:1,padding:14,gap:8,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},
 selected:{borderColor:c.brand,backgroundColor:c.brandSoft},button:{minHeight:48,flexGrow:1,paddingVertical:12,paddingHorizontal:14,alignItems:"center",justifyContent:"center",borderRadius:12},
 primary:{backgroundColor:c.action},secondary:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border},disabled:{opacity:0.5},chip:{minHeight:44,padding:10,borderRadius:9,borderWidth:1,borderColor:c.border,alignItems:"center",flexGrow:1},
 item:{minHeight:48,paddingVertical:12,gap:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.border},errorPanel:{backgroundColor:c.warningSoft,padding:12,borderRadius:10},
 error:{color:c.warning,fontSize:14,lineHeight:22},success:{color:c.success,fontSize:14,lineHeight:22},question:{fontSize:19,lineHeight:31,color:c.text,fontWeight:"600",marginVertical:8},
 option:{minHeight:56,padding:14,borderWidth:1,borderColor:c.border,borderRadius:12,flexDirection:"row",alignItems:"center",gap:12},optionLetter:{fontSize:17,fontWeight:"700",color:c.text},optionText:{flex:1,fontSize:16,lineHeight:25,color:c.text},
 number:{minWidth:44,minHeight:44,padding:8,borderWidth:1,borderColor:c.border,borderRadius:9,alignItems:"center",justifyContent:"center"},pending:{borderStyle:"dashed",opacity:0.5},current:{borderColor:c.brand,borderWidth:2},
 footer:{padding:12,gap:8,borderTopWidth:1,borderTopColor:c.border,backgroundColor:c.surface},overlay:{flex:1,backgroundColor:c.overlay,justifyContent:"flex-end"},
 sheet:{maxHeight:"90%",backgroundColor:c.background,borderTopLeftRadius:20,borderTopRightRadius:20},sheetContent:{padding:20,gap:16,paddingBottom:32},
});
