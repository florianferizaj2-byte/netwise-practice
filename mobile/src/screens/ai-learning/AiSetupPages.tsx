import { useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, ScrollView, TextInput, View } from "react-native";
import { AnimatedPressable, AnimatedProgressBar } from "../../components/Motion";
import type { AiLearningProfile, AiLearningQuote, AiLearningSetup, AiLearningStrategy } from "../../api/aiLearningTypes";
import { AiButton, AiCard, AiDetailRow, AiFooter, AiGoalGrid, AiHeader, AiIcon, AiMetricRow, AiNotice, AiTag, AiText, aiGoalTitle, useAiDesign } from "./AiElements";

type Kind="practice"|"exam";
type Settings={strategy:AiLearningStrategy;count:10|20|30|50;duration:number;pointIds:string[]};
export function AiHomePage({kind,profile,loading,settings,onChange,onPlan,onSettings,onAnalysis,onHistory,certificateName,activeJob,onContinue,accessory}:{
  kind:Kind;profile:AiLearningProfile|null;loading:boolean;settings:Settings;onChange:(strategy:AiLearningStrategy)=>void;
  onPlan:()=>void;onSettings:()=>void;onAnalysis:()=>void;onHistory:()=>void;certificateName:string;
  activeJob?:{readyCount:number;targetCount:number;status:string;submitted:boolean}|null;onContinue:()=>void;accessory?:ReactNode;
}){
  const {p}=useAiDesign(),cold=profile?.confidence==="insufficient";
  const points=profile?.points.filter(q=>q.recentCount>0).slice(0,3)||[];
  return <View style={{flex:1,backgroundColor:p.bg}}>
    <AiHeader home title={kind==="exam"?"考试":"AI 生成"} action="记录" onAction={onHistory}/>{accessory}
    <ScrollView contentContainerStyle={{paddingHorizontal:20,paddingTop:4,paddingBottom:18,gap:16}}>
      <AiText type="tiny" tone="muted" numberOfLines={1}>{certificateName}</AiText>
      <View style={{gap:6}}><AiText type="hero">{kind==="exam"?"一场更适合你的模拟考":cold?"先测一小组，找到你的起点":"下一组，\n练得更有针对性"}</AiText>
        <AiText type="small" tone="muted">{cold?"不急着判断你会不会，先用基础与中等题建立学习画像。":kind==="exam"?"复用你的学习画像，先定方案，再逐题交付。":"根据你的错题与答对记录，为你安排下一步。"}</AiText></View>
      {activeJob&&!activeJob.submitted&&<AnimatedPressable accessibilityRole="button" accessibilityLabel="查看当前生成任务" onPress={onContinue}>
        <AiNotice icon="cloud" title={(activeJob.status==="blocked"?"专属题组待恢复":activeJob.status==="completed"?"专属题组已备好":"专属题组正在后台生成")+" · "+activeJob.readyCount+"/"+activeJob.targetCount}
          detail="已交付题目与作答保留，点击继续。" action="继续" onAction={onContinue}/></AnimatedPressable>}
      {profile?<AiCard style={{gap:10,padding:14}}>
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><AiText type="small" style={{fontWeight:"700"}}>{cold?"学习画像待建立":"近30天学习画像"}</AiText>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="查看分析依据" onPress={onAnalysis} style={{minHeight:36,justifyContent:"center"}}><AiText type="tiny" tone="blue">查看依据 ›</AiText></AnimatedPressable></View>
        <AiMetricRow items={[{value:profile.stats.answered,label:"已答不同题"},{value:profile.stats.wrong,label:"最近答错"},{value:profile.stats.accuracy===null?"—":profile.stats.accuracy+"%",label:"正确率"}]}/>
        {points.length>0&&!cold?<View style={{gap:9}}>{points.map(point=><View key={point.id} style={{flexDirection:"row",alignItems:"center",gap:10}}>
          <AiText type="tiny" style={{width:84}} numberOfLines={1}>{point.knowledgePoint}</AiText><View style={{flex:1}}><AnimatedProgressBar value={100*(point.recentCount-point.recentWrong)/point.recentCount} color={point.stable?p.green:p.blue} trackColor={p.line}/></View>
          <AiText type="tiny" tone="muted" style={{width:34,textAlign:"right"}}>{Math.round(100*(point.recentCount-point.recentWrong)/point.recentCount)}%</AiText></View>)}
          <AiText type="tiny" tone="muted">各知识点最近不同题目表现，不代表考试通过率。</AiText></View>:
          <View style={{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:6}}>{[{icon:"document",text:"做10道诊断题"},{icon:"chart",text:"了解真实掌握"},{icon:"book",text:"再安排训练"}].map((item,i)=><View key={item.text} style={{flex:1,alignItems:"center",gap:7}}>
            <View style={{width:36,height:36,borderRadius:18,backgroundColor:p.soft,alignItems:"center",justifyContent:"center"}}><AiIcon name={item.icon} size={21}/></View><AiText type="tiny" tone="muted" style={{textAlign:"center"}}>{item.text}</AiText></View>)}</View>}
        {cold&&<AiText type="tiny" tone="muted">数据不足时，先诊断，不直接加难或认定掌握。</AiText>}
      </AiCard>:<AiCard><ActivityIndicator color={p.blue}/><AiText type="small" tone="muted">正在读取学习画像…</AiText></AiCard>}
      <View style={{gap:10}}><AiText type="heading">{kind==="exam"?"选择组卷目标":"选择这次的目标"}</AiText><AiGoalGrid value={settings.strategy} onChange={onChange} compact={kind==="exam"} cold={cold}/></View>
      <AiCard style={{paddingVertical:8,paddingHorizontal:14}}>
        <AiDetailRow icon={kind==="exam"?"clock":"document"} label={kind==="exam"?"考试设置":"本次练习"}
          value={kind==="exam"?settings.count+"道 · "+settings.duration+"分钟":"10道题 · 不限时"} onPress={onSettings}/>
        {kind==="exam"&&<AiDetailRow icon="book" label="知识范围" value={settings.pointIds.length?"已选"+settings.pointIds.length+"个知识点":"跟随分析"} onPress={onSettings}/>}
      </AiCard>
      {kind==="exam"&&<AiNotice icon="shield" title="首批3题就绪即可开考" detail="等待缺题由服务器暂停计时；断线可续接，作答自动保存。"/>}
    </ScrollView>
    <AiFooter><AiButton label={kind==="exam"?"查看组卷方案":cold?"查看诊断方案":"查看专属方案"} onPress={onPlan} busy={loading}/>
      <AiText type="tiny" tone="muted" style={{textAlign:"center"}}>先看方案与积分规则，再开始生成</AiText></AiFooter>
  </View>;
}

export function AiPlanPage({quote,onBack,onSettings,onConfirm,busy}:{quote:AiLearningQuote|null;onBack:()=>void;onSettings:()=>void;onConfirm:()=>void;busy:boolean}){
  const {p}=useAiDesign();const groups=quote?Object.entries(quote.blueprint.slots.reduce<Record<string,number>>((out,s)=>({...out,[s.stage]:(out[s.stage]||0)+1}),{})):[];
  const descriptions:Record<string,string>={"补基础":"先拆开概念，再把基础补牢","做变式":"换一种设问，检验是否理解","迁移验证":"用新情境确认掌握","诊断理解":"先用基础与中等题了解真实表现","综合进阶":"在已有掌握证据上增加综合应用","间隔巩固":"换情境确认是否依然记得","补弱项":"优先巩固反复出错的知识点","覆盖验证":"兼顾知识范围与稳定性"};
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title="专属方案" onBack={onBack}/>
    <ScrollView contentContainerStyle={{padding:20,paddingTop:8,gap:16}}>
      {!quote?<AiCard>{busy?<ActivityIndicator color={p.blue}/>:<AiIcon name="warning" tone="amber"/>}<AiText tone="muted">{busy?"正在制定专属方案…":"方案尚未读取成功，可通过上方入口重试。"}</AiText></AiCard>:<>
        <AiTag>{aiGoalTitle(quote.blueprint.strategy)}</AiTag><AiText type="hero">{quote.blueprint.diagnostic?"先了解，再安排进阶":"从薄弱点，走向真正掌握"}</AiText>
        <AiCard><AiText type="heading">为什么这样安排</AiText>{quote.blueprint.reasons.map(reason=><View key={reason.pointId} style={{backgroundColor:p.bg,padding:10,borderRadius:9,gap:4}}>
          <AiText type="small" style={{fontWeight:"600"}}>{reason.knowledgePoint}</AiText><AiText type="tiny" tone="muted">{reason.evidence}</AiText></View>)}
          <AiText type="tiny" tone="muted">按不同题目的实际作答去重；样本不足时先做诊断。</AiText></AiCard>
        <AiCard><AiText type="heading">这次会怎么生成</AiText><View style={{flexDirection:"row",height:7,borderRadius:4,overflow:"hidden"}}>{groups.map(([stage,n],i)=><View key={stage} style={{flex:n,backgroundColor:i===2?p.green:i===1?"#6D9BFF":p.blue}}/>)}</View>
          {groups.map(([stage,n],i)=><View key={stage} style={{flexDirection:"row",gap:12,alignItems:"flex-start",paddingVertical:5}}>
            <View style={{width:32,height:32,borderRadius:16,backgroundColor:i===2?p.greenSoft:p.soft,alignItems:"center",justifyContent:"center"}}><AiText type="small" tone={i===2?"green":"blue"} style={{fontWeight:"700"}}>{String(i+1).padStart(2,"0")}</AiText></View>
            <View style={{flex:1,gap:4}}><View style={{flexDirection:"row",alignItems:"center",gap:8}}><AiText type="heading">{stage}</AiText><AiTag>{n}道</AiTag></View><AiText type="small" tone="muted">{descriptions[stage]||"按已确认的知识点与难度逐题生成"}</AiText></View></View>)}
        </AiCard>
        <AiCard style={{paddingVertical:10}}><AiText type="heading">本次设置</AiText><AiDetailRow label="题目数量" value={quote.blueprint.targetCount+"道"} icon="document" onPress={onSettings}/>
          <AiDetailRow label="知识范围" value={quote.blueprint.reasons.length+"个知识点"} icon="book" onPress={onSettings}/>
          <AiDetailRow label="难度安排" value={quote.blueprint.diagnostic?"基础与中等诊断":"按训练目标安排"} icon="chart"/></AiCard>
        <AiNotice icon="shield" title="积分使用确认" detail={quote.pricing.sampleUnits===null?"暂无可核验的用量示例。":
          "标准用量示例约"+(quote.pricing.sampleUnits/quote.pricing.scale).toFixed(2)+"积分，不是固定价格或扣费上限。"}/>
        <AiText type="tiny" tone="muted">{quote.pricing.notice}</AiText>
        {!quote.pricing.available&&<AiNotice tone="amber" title="当前服务价格尚未就绪" detail="暂不开始收费生成，请先核对积分中心的可用服务。"/>}
      </>}
    </ScrollView><AiFooter><View style={{flexDirection:"row",gap:10}}><AiButton label="返回调整" onPress={onSettings} variant="secondary" disabled={busy} style={{flex:0.8}}/>
      <AiButton label="确认方案，开始生成" onPress={onConfirm} busy={busy} disabled={!quote?.pricing.available} style={{flex:1.5}}/></View></AiFooter>
  </View>;
}

export function AiSettingsPage({profile,kind,settings,onChange,onSave,onBack}:{profile:AiLearningProfile|null;kind:Kind;settings:Settings;
  onChange:(next:Settings)=>void;onSave:(next?:Settings)=>void;onBack:()=>void}){
  const {p}=useAiDesign(),[search,setSearch]=useState("");
  const select=(id:string)=>onChange({...settings,pointIds:settings.pointIds.includes(id)?settings.pointIds.filter(q=>q!==id):settings.pointIds.length<4?[...settings.pointIds,id]:settings.pointIds});
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title="调整练习" onBack={onBack}/>
    <FlatList data={(profile?.points||[]).filter(point=>(point.chapter+point.knowledgePoint).includes(search.trim()))} keyExtractor={q=>q.id}
      initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:20,paddingBottom:20,gap:0}}
      ListHeaderComponent={<View style={{gap:14,paddingVertical:8}}>
        <AiText type="small" tone="muted">训练目标</AiText><AiGoalGrid compact value={settings.strategy} onChange={strategy=>onChange({...settings,strategy})}/>
        <AiCard style={{gap:8}}><AiText type="small" tone="muted">题目数量</AiText>{kind==="practice"?<AiText type="heading">10道</AiText>:<View style={{flexDirection:"row",gap:8}}>{([10,20,30,50] as const).map(n=><AnimatedPressable key={n} accessibilityRole="radio" accessibilityLabel={n+"题"}
          accessibilityState={{checked:settings.count===n}} onPress={()=>onChange({...settings,count:n})} style={{flex:1,minHeight:44,borderRadius:9,backgroundColor:settings.count===n?p.blue:p.bg,alignItems:"center",justifyContent:"center"}}>
          <AiText type="small" style={{color:settings.count===n?"#FFF":p.ink}}>{n}</AiText></AnimatedPressable>)}</View>}
          <AiText type="small" tone="muted">{kind==="exam"?"考试时长":"练习时长"}</AiText>{kind==="practice"?<AiText type="heading">不限时</AiText>:<View style={{flexDirection:"row",gap:8}}>{[20,40,60,90].map(n=><AnimatedPressable key={n} accessibilityRole="radio" accessibilityLabel={n+"分钟"}
            accessibilityState={{checked:settings.duration===n}} onPress={()=>onChange({...settings,duration:n})} style={{flex:1,minHeight:44,borderRadius:9,backgroundColor:settings.duration===n?p.blue:p.bg,alignItems:"center",justifyContent:"center"}}>
            <AiText type="small" style={{color:settings.duration===n?"#FFF":p.ink}}>{n}</AiText></AnimatedPressable>)}</View>}</AiCard>
        <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}><AiText type="heading">知识范围</AiText><AiText type="tiny" tone="muted">已选{settings.pointIds.length}个 · 最多4个</AiText></View>
        <View style={{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:12,borderRadius:10,backgroundColor:p.card,borderWidth:1,borderColor:p.line}}><AiIcon name="search" tone="muted" size={20}/>
          <TextInput accessibilityLabel="搜索知识点" placeholder="搜索章节或知识点" placeholderTextColor={p.muted} value={search} onChangeText={setSearch}
            style={{flex:1,minHeight:48,color:p.ink,fontSize:15}}/></View>
      </View>}
      renderItem={({item:point})=><AnimatedPressable accessibilityRole="checkbox" accessibilityLabel={point.knowledgePoint} accessibilityState={{checked:settings.pointIds.includes(point.id)}} onPress={()=>select(point.id)}
        style={{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:14,borderBottomWidth:1,borderBottomColor:p.line}}>
        <View style={{width:20,height:20,borderRadius:5,borderWidth:1.4,borderColor:settings.pointIds.includes(point.id)?p.blue:p.muted,backgroundColor:settings.pointIds.includes(point.id)?p.blue:"transparent",alignItems:"center",justifyContent:"center"}}>
          {settings.pointIds.includes(point.id)&&<AiIcon name="check" color="#FFF" size={15}/>}</View><View style={{flex:1,gap:3}}><AiText type="body" style={{fontWeight:"600"}}>{point.knowledgePoint}</AiText>
          <AiText type="tiny" tone="muted">{point.chapter}</AiText></View><AiIcon name="right" tone="muted" size={15}/></AnimatedPressable>}
      ListEmptyComponent={<AiText type="small" tone="muted" style={{paddingVertical:20}}>没有匹配的知识点</AiText>}/>
    <AiFooter><AiButton label="保存设置" onPress={()=>onSave(settings)}/><AiButton label="交给AI推荐" variant="text" onPress={()=>{const next={...settings,pointIds:[]};onChange(next);onSave(next);}}/></AiFooter>
  </View>;
}

export function AiAnalysisPage({profile,onBack,onPlan}:{profile:AiLearningProfile|null;onBack:()=>void;onPlan:(ids:string[])=>void}){
  const {p}=useAiDesign(),[period,setPeriod]=useState<"recent"|"history">("recent"),[selected,setSelected]=useState<string|null>(null);
  const points=profile?.points.filter(point=>point.distinctAnswered>0)||[],chosen=points.find(q=>q.id===selected)||points[0];
  const accuracy=(q:typeof points[number])=>period==="recent"?(q.recentCount?Math.round((q.recentCount-q.recentWrong)/q.recentCount*100):0):(q.distinctAnswered?Math.round(q.correct/q.distinctAnswered*100):0);
  return <View style={{flex:1,backgroundColor:p.bg}}><AiHeader title="学习分析" onBack={onBack}/>
    <FlatList data={points} keyExtractor={point=>point.id} initialNumToRender={10} contentContainerStyle={{padding:20,paddingTop:8,gap:12}}
      ListHeaderComponent={<View style={{gap:14,paddingBottom:4}}><AiText type="hero">你该练什么，\n有据可查</AiText>
        <View style={{flexDirection:"row",padding:4,borderRadius:12,backgroundColor:p.line}}>{[{id:"recent",label:"最近表现"},{id:"history",label:"历史表现"}].map(item=><AnimatedPressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:period===item.id}} onPress={()=>setPeriod(item.id as "recent"|"history")} style={{flex:1,minHeight:42,backgroundColor:period===item.id?p.blue:"transparent",borderRadius:9,alignItems:"center",justifyContent:"center"}}>
          <AiText type="small" style={{color:period===item.id?"#FFF":p.muted}}>{item.label}</AiText></AnimatedPressable>)}</View>
        <AiText type="small" tone="muted">{period==="recent"?"各知识点最近最多10道不同题目的表现":"每个知识点不同题目的最近一次作答"}</AiText>
        <AiText type="tiny" tone="muted">近30天：{profile?.stats.answered||0}道不同题 · {profile?.stats.attemptCount||0}次作答</AiText>
      </View>}
      renderItem={({item:point})=><AnimatedPressable accessibilityRole="button" accessibilityLabel={"分析 "+point.knowledgePoint} onPress={()=>setSelected(point.id)}>
        <AiCard style={{gap:9,borderColor:chosen?.id===point.id?p.blue:p.line}}>
          <View style={{flexDirection:"row",gap:10,alignItems:"center"}}><AiText type="small" style={{fontWeight:"600",flex:1}}>{point.knowledgePoint}</AiText>
            <AiTag tone={point.confidence==="low"?"muted":"green"}>{point.confidence==="low"?"继续观察":"样本充足"}</AiTag></View>
          <View style={{flexDirection:"row",alignItems:"center",gap:12}}><View style={{flex:1}}><AnimatedProgressBar value={accuracy(point)} color={point.stable?p.green:p.blue} trackColor={p.line}/></View><AiText type="small" tone="muted">{accuracy(point)}%</AiText></View>
          <AiText type="tiny" tone="muted">{period==="recent"?"最近"+point.recentCount+"道不同题，答错"+point.recentWrong+"道":"共"+point.distinctAnswered+"道不同题，最近答对"+point.correct+"道"}</AiText>
        </AiCard></AnimatedPressable>}
      ListEmptyComponent={<AiCard><AiIcon name="chart" size={32}/><AiText type="heading">还需要一些作答证据</AiText><AiText type="small" tone="muted">先做一组诊断题，之后再看真实的知识点表现。</AiText></AiCard>}
      ListFooterComponent={<View style={{gap:12,paddingTop:12}}><AiNotice icon="info" title="答对一次，不代表稳定掌握" detail="重复做同一题不会反复增加掌握证据；样本不足时先做诊断。"/>
        {!!profile?.stats.ambiguousRecords&&<AiText type="tiny" tone="muted">部分旧共享题缺少证书归属，未猜测归属，也未删除原记录。</AiText>}</View>}/>
    <AiFooter><AiButton label={chosen?"按这个范围制定方案":"先制定诊断方案"} onPress={()=>onPlan(chosen?[chosen.id]:[])}/></AiFooter>
  </View>;
}
export type AiUiSettings=Settings;
