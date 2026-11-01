import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Keyboard, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AndroidModalSafeArea } from './AndroidModalSafeArea.android';
import { AppIcon } from './AppIcon';
import { AnimatedPressable } from './Motion';
import { AiPointsPricing } from './AiPointsPricing.android';
import { mobileApi, mobileSessionSnapshot, registerMobileRequestHooks, type PointOperation } from '../api/client';
import { androidPointsApi, pointUsageLabel } from '../api/points.android';
import { androidPointsFlow } from '../api/androidPointsRuntime.android';
import { formatPointUnits } from '../api/androidPointsFlow.android';
import type { PointCall } from '../api/pointsTypes';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

export const useAndroidPoints=()=>useSyncExternalStore(androidPointsFlow.subscribe,androidPointsFlow.getSnapshot,androidPointsFlow.getSnapshot);

export function AndroidPointsBar({userId,certificateId,appActive,headless=false}:{userId:string;certificateId?:string|null;appActive:boolean;headless?:boolean}) {
  const s=useThemedStyles(styles),state=useAndroidPoints(),ownerKey=`${userId}:${certificateId||''}`;
  useEffect(()=>{
    androidPointsFlow.activate(ownerKey);
    const unregister=registerMobileRequestHooks(androidPointsFlow.hooks);
    const unsubscribe=mobileApi.onStatus(status=>{if(status==='expired')androidPointsFlow.deactivate(ownerKey);});
    return()=>{unregister();unsubscribe();androidPointsFlow.deactivate(ownerKey);};
  },[ownerKey]);
  useEffect(()=>{androidPointsFlow.activate(ownerKey);});
  useEffect(()=>{androidPointsFlow.setAppActive(appActive);if(!appActive)return;
    const timer=setInterval(()=>void androidPointsFlow.refresh(),30000);return()=>clearInterval(timer);
  },[appActive,ownerKey]);
  const wallet=state.ownerKey===ownerKey?state.wallet:null;
  const number=(value:number)=>formatPointUnits(value,wallet?.scale||1000);
  return <View style={headless?undefined:s.bar} testID="android-global-points">
    {!headless&&<>
    <View style={s.barLine}>
      <View style={[s.grow,s.barBalance]}><Text style={s.balance}>可用积分 {wallet?number(wallet.availableUnits):'—'}</Text>
        <Text style={s.small}>{wallet?`预扣中 ${number(wallet.heldUnits)} 积分`:'积分未同步，点击刷新'}</Text></View>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="刷新安卓积分余额" disabled={state.refreshing}
        onPress={()=>void androidPointsFlow.refresh()} style={s.smallButton}>
        {state.refreshing?<ActivityIndicator size="small"/>:<Text style={s.action}>刷新</Text>}
      </AnimatedPressable>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="查看积分费用与记录" onPress={androidPointsFlow.showDetails} style={s.smallButton}>
        <Text style={s.action}>费用与记录</Text>
      </AnimatedPressable>
    </View>
    <Text style={s.small} accessibilityLiveRegion="polite">{state.ownerKey===ownerKey?state.error||state.message:'正在同步当前账号积分…'}</Text>
    </>}
    {state.presentationHost==='root'&&<AndroidPointsDialog userId={userId} ownerKey={ownerKey}/>}
  </View>;
}

export function AndroidPointsInline({active=true,headless=false}:{active?:boolean;headless?:boolean}){
  const s=useThemedStyles(styles),state=useAndroidPoints(),host=useId();
  useEffect(()=>{if(active&&state.ownerKey)return androidPointsFlow.presentOn(host);},[active,state.ownerKey,host]);
  if(!active||!state.ownerKey)return null;
  if(headless)return state.presentationHost===host?<AndroidPointsDialog userId={state.ownerKey.split(':')[0]} ownerKey={state.ownerKey}/>:null;
  return <View style={s.inline} testID="android-inline-points">
    <Text style={[s.small,s.grow]} accessibilityLiveRegion="polite">{state.wallet?`可用 ${formatPointUnits(state.wallet.availableUnits,state.wallet.scale)} 积分`:'积分暂未同步'} · {state.message}</Text>
    <AnimatedPressable accessibilityRole="button" onPress={androidPointsFlow.showDetails} style={s.smallButton}><Text style={s.action}>费用与记录</Text></AnimatedPressable>
    {state.presentationHost===host&&<AndroidPointsDialog userId={state.ownerKey.split(':')[0]} ownerKey={state.ownerKey}/>}
  </View>;
}

function AndroidPointsDialog({userId,ownerKey}:{userId:string;ownerKey:string}) {
  const s=useThemedStyles(styles),{colors,reduceMotion}=useTheme(),state=useAndroidPoints();
  const belongs=state.ownerKey===ownerKey;
  const prompt=belongs?state.prompt:null,visible=belongs&&(!!prompt||state.detailsOpen);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{if(visible){setExpanded(false);Keyboard.dismiss();}},[visible,prompt?.requestId]);
  const wallet=state.wallet,number=(n:number)=>formatPointUnits(n,wallet?.scale||1000);
  const model=state.prices?.available?state.prices.models.find(m=>m.id===state.prices?.primaryModelId):null;
  const example=model?.services.find(service=>service.id===prompt?.priceId);
  const close=()=>{if(prompt)androidPointsFlow.cancel();else androidPointsFlow.hideDetails();};
  if(!belongs)return null;
  return <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType={reduceMotion?'none':'fade'} onRequestClose={close}>
    <View style={s.scrim}>
      <AndroidModalSafeArea style={[s.modal,!prompt&&s.detailsModal]}>
      <View testID={prompt?'android-ai-confirm-sheet':'android-points-details-sheet'} accessibilityViewIsModal style={[s.sheet,!prompt&&s.detailsSheet]}>
      {prompt?<View style={s.header}><Text accessibilityRole="header" style={[s.title,s.grow]}>{prompt.name}</Text>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="取消本次AI请求" onPress={close} style={s.smallButton}><Text style={s.action}>取消</Text></AnimatedPressable></View>:<View style={s.detailsHeader}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭积分费用与记录" onPress={close} style={s.headerButton}><AppIcon name="chevron-left" size={24} color={colors.text}/></AnimatedPressable>
        <Text accessibilityRole="header" style={s.pageTitle}>积分</Text>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="刷新积分余额和使用记录" disabled={state.refreshing} onPress={()=>void androidPointsFlow.refresh()} style={s.headerButton}>{state.refreshing?<ActivityIndicator size="small" color={colors.brand}/>:<AppIcon name="refresh" size={24} color={colors.text}/>}</AnimatedPressable>
      </View>}
      <ScrollView style={[s.sheetScroll,!prompt&&s.detailsScroll]} contentContainerStyle={[s.content,!prompt&&s.detailsContent]} keyboardShouldPersistTaps="handled">
        {prompt&&<Text style={s.balance}>可用 {wallet?number(wallet.availableUnits):'—'} 积分 · 预扣 {wallet?number(wallet.heldUnits):'—'}</Text>}
        {!!state.error&&<Text style={s.error} accessibilityRole="alert">{state.error}</Text>}
        {prompt?<>
          <Text style={s.text}>免费结果不扣积分；正余额可使用 AI，本次结算可能扣成负数。</Text>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="费用说明" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={s.disclosure}>
            <AppIcon name="info" size={16} color={colors.textMuted}/><Text style={s.disclosureText}>费用说明</Text><AppIcon name={expanded?'chevron-up':'chevron-right'} size={14} color={colors.textMuted}/>
          </AnimatedPressable>
          {expanded&&<View testID="android-ai-cost-details" style={s.costDetails}>
          <Text style={s.text}>普通刷题、已有内容、缓存与确定性判分免费；只有新 AI 调用才按实际用量扣积分。</Text>
          {wallet&&wallet.availableUnits<=0&&<Text style={s.note}>余额为零或负数时暂停新的付费 AI；题库解析和已有缓存仍然免费可读。</Text>}
          {!!prompt.maybeFree&&<Text style={s.note}>{prompt.maybeFree}</Text>}
          {example&&model?<View style={s.noteBox}>
            <Text style={s.text}>{model.name} · 用量示例 {formatPointUnits(example.sampleUnits,state.prices?.scale||1000)} 积分</Text>
            <Text style={s.text}>每轮 1000 输入 Token＋该服务首轮输出额度，含标准审核，不含重试。这不是固定价格，也不是预扣或扣费上限。</Text>
          </View>:<Text style={s.note}>暂未取得本服务的有效用量示例，不能将未知费用当作 0 积分。是否需要 AI、余额是否足够，由服务端校验。</Text>}
          <Text style={s.text}>正余额可发起，按实际用量结算后可能扣成负数；零或负余额暂停新的付费请求。任务最终失败退回该任务预扣，但不会延长原积分有效期。接口可能按管理员优先级切换，实际费用以命中的模型与用量为准。</Text>
          <AiPointsPricing userId={userId}/>
          </View>}
        </>:<>
          <View style={s.walletCard} testID="android-points-balance">
            <View style={s.walletCaption}><View style={s.walletIcon}><AppIcon name="sparkles" size={23} color={colors.brand}/></View><Text style={s.walletLabel}>可用积分</Text></View>
            <View style={s.walletValueRow}><Text style={[s.walletValue,number(wallet?.availableUnits||0).length>10&&s.walletValueCompact,wallet&&wallet.availableUnits<0&&{color:colors.warning}]}>{wallet?number(wallet.availableUnits):'—'}</Text><Text style={s.walletUnit}>积分</Text></View>
            <View style={s.heldRow}><View style={s.heldLabel}><View style={s.heldDot}/><Text style={s.heldText}>预扣中</Text></View><Text style={s.heldValue}>{wallet?number(wallet.heldUnits):'—'} 积分</Text></View>
          </View>
          {!!wallet&&wallet.availableUnits<0&&<Text testID="points-debt-notice" style={s.note}>当前有欠分，新的付费 AI 已暂停。签到或补充积分会先抵扣欠分，恢复正余额后可继续使用。</Text>}
          {!!wallet?.pendingUnits&&<Text style={s.note}>待到账 {number(wallet.pendingUnits)} 积分，请联系管理员核对发放记录。</Text>}
          <View style={s.rulesCard}>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="积分与费用说明" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={s.rulesButton}>
              <AppIcon name="info" size={22} color={colors.textMuted}/><Text style={s.rulesTitle}>积分与费用说明</Text><AppIcon name={expanded?'chevron-up':'chevron-right'} size={18} color={colors.textMuted}/>
            </AnimatedPressable>
            {expanded&&<View style={s.rulesContent} testID="android-points-rules">
              <Text style={s.text}>新 AI 调用按实际用量扣分；免费题库、已有解析和缓存结果不收费。</Text>
              <Text style={s.text}>正余额即可发起任务。按实际用量结算，允许本次扣成负数；余额为零或负数时不再发起新的付费 AI。失败不扣分，未用预扣释放。</Text>
              <Text style={s.text}>先用先到期积分。会员积分每日签到领取，签到赠送当日有效；退款不延长原有效期。</Text>
              <AiPointsPricing userId={userId} embedded/>
            </View>}
          </View>
          <AndroidPointsLedger ownerKey={ownerKey} refreshKey={state.updated}/>
        </>}
      </ScrollView>
      {prompt&&<View style={s.footer}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="取消，不发起请求" onPress={androidPointsFlow.cancel} style={[s.button,s.cancelButton]}><Text style={s.action}>取消</Text></AnimatedPressable>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="继续使用AI，按实际用量结算" onPress={androidPointsFlow.accept} style={[s.button,s.continueButton,{backgroundColor:colors.action}]}><Text style={[s.buttonText,{color:colors.white}]}>继续使用 AI</Text></AnimatedPressable>
      </View>}
      </View>
      </AndroidModalSafeArea>
    </View>
  </Modal>;
}

function AndroidPointsLedger({ownerKey,refreshKey}:{ownerKey:string;refreshKey:number}){
  const s=useThemedStyles(styles),{colors}=useTheme(),{width,fontScale}=useWindowDimensions();
  const [rows,setRows]=useState<PointOperation[]>([]),[calls,setCalls]=useState<PointCall[]>([]);
  const [filter,setFilter]=useState<'all'|'settled'|'refunded'>('all'),[openId,setOpenId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[next,setNext]=useState<number|null>(null),request=useRef(0);
  const scope=ownerKey+':'+filter,loadedScope=useRef(''),abort=useRef<AbortController|null>(null),stack=fontScale>1.2||width<360;
  async function load(offset=0){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    const id=++request.current,revision=mobileSessionSnapshot().revision;setBusy(true);setError('');
    try{const data=await androidPointsApi.operations(controller.signal,offset,filter);if(request.current!==id||revision!==mobileSessionSnapshot().revision)return;
      setRows(previous=>offset?[...new Map([...previous,...data.rows].map(row=>[row.id,row])).values()]:data.rows);
      setCalls(previous=>offset?[...new Map([...previous,...data.calls].map(call=>[call.operationId+':'+call.model+':'+call.taskType,call])).values()]:data.calls);setNext(data.nextOffset??null);
    }catch(cause){if(request.current===id&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'记录暂未同步');}
    finally{if(request.current===id)setBusy(false);}
  }
  useEffect(()=>{
    if(loadedScope.current!==scope){loadedScope.current=scope;setRows([]);setCalls([]);setNext(null);setOpenId(null);}
    void load();return()=>{request.current++;abort.current?.abort();};
  },[scope,refreshKey]);
  const visibleRows=loadedScope.current===scope?rows:[],currentCalls=loadedScope.current===scope?calls:[];
  const day=(value:string)=>{const d=new Date(value);return d.toDateString()===new Date().toDateString()?'今天':d.toLocaleDateString('zh-CN',{month:'long',day:'numeric'});};
  const amount=(row:PointOperation)=>row.state==='pending'?formatPointUnits(row.heldUnits):row.state==='refunded'?'0':(row.chargedUnits?'−':'')+formatPointUnits(row.chargedUnits);
  return <View style={s.ledger} testID="android-points-ledger">
    <Text accessibilityRole="header" style={s.ledgerTitle}>使用记录</Text>
    <View accessibilityRole="tablist" style={s.filters}>{([{id:'all',label:'全部'},{id:'settled',label:'已扣除'},{id:'refunded',label:'已退回'}] as const).map(item=><AnimatedPressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:filter===item.id}} onPress={()=>setFilter(item.id)} style={[s.filterButton,item.id===filter&&s.filterSelected]}><Text style={[s.filterText,item.id===filter&&s.filterTextSelected]}>{item.label}</Text></AnimatedPressable>)}</View>
    {busy&&!visibleRows.length&&<View style={s.empty}><ActivityIndicator color={colors.brand}/><Text style={s.small}>正在同步使用记录…</Text></View>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!busy&&!error&&!visibleRows.length&&<View style={s.empty}><AppIcon name="list" size={30} color={colors.textMuted}/><Text style={s.text}>{filter==='all'?'暂无积分使用记录':filter==='settled'?'暂无已扣除记录':'暂无已退回记录'}</Text></View>}
    {visibleRows.map((row,index)=>{
      const related=currentCalls.filter(call=>call.operationId===row.id),label=pointUsageLabel(row.feature,related),open=openId===row.id;
      const models=[...new Set(related.map(call=>call.model))].join(' / ');
      const status=row.state==='pending'?'预扣中':row.state==='refunded'?'已退回':'已结算';
      const tone=row.state==='pending'?colors.gold:row.state==='refunded'?colors.success:colors.brand;
      const soft=row.state==='pending'?colors.goldSoft:row.state==='refunded'?colors.successSoft:colors.brandSoft;
      const totals=<View style={[s.recordTotals,stack&&s.recordTotalsStack]}><Text style={s.recordAmount}>{amount(row)}<Text style={s.recordUnit}> 积分</Text></Text><View style={[s.stateBadge,{backgroundColor:soft}]}><Text style={[s.stateText,{color:tone}]}>{status}</Text></View></View>;
      return <View key={row.id}>
        {(index===0||day(row.createdAt)!==day(visibleRows[index-1].createdAt))&&<Text style={s.dayLabel}>{day(row.createdAt)}</Text>}
        <View style={s.recordCard}>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel={`${label}，${status}，${amount(row)}积分，查看详情`} accessibilityState={{expanded:open}} onPress={()=>setOpenId(open?null:row.id)} style={s.recordButton}>
            <View style={s.recordMain}><View style={[s.recordIcon,{backgroundColor:soft}]}><AppIcon name={row.state==='pending'?'clock':row.state==='refunded'?'arrow-left':label.includes('题目详解')?'book':'sparkles'} size={22} color={tone}/></View>
              <View style={s.recordCopy}><Text style={s.recordName}>{label}</Text><Text style={s.recordMeta}>{new Date(row.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}{models?' · '+models:''}</Text></View>
              {!stack&&totals}<AppIcon name={open?'chevron-up':'chevron-right'} size={16} color={colors.textMuted}/></View>
            {stack&&totals}
          </AnimatedPressable>
          {open&&<View style={s.recordDetails} testID="android-point-record-detail">
            {([['实际扣除',formatPointUnits(row.chargedUnits)],['任务预扣',formatPointUnits(row.heldUnits)],['已释放 / 退回',formatPointUnits(row.state==='pending'?0:Math.max(0,row.heldUnits-row.chargedUnits))]] as const).map(([key,value])=><View key={key} style={s.detailLine}><Text style={s.detailLabel}>{key}</Text><Text style={s.detailValue}>{value} 积分</Text></View>)}
            <Text style={s.recordMeta}>{row.state==='pending'?'正在处理，预扣并非最终消费。':row.state==='refunded'?'任务未完成，该任务预扣已全部退回。':'已按实际用量结算，未使用的预扣已释放。'}</Text>
            {!!row.error&&<Text style={s.error}>{row.error}</Text>}
          </View>}
        </View>
      </View>;
    })}
    <AnimatedPressable accessibilityRole="button" disabled={busy} onPress={()=>void load(next??0)} style={s.loadRecords}><Text style={s.loadText}>{busy?'读取中…':error?'重试读取记录':next!==null?'加载更多积分记录':'刷新积分记录'}</Text></AnimatedPressable>
  </View>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
  detailsModal:{backgroundColor:c.background,justifyContent:'flex-start'},detailsScroll:{flexGrow:1,flexShrink:1,flexBasis:0,minHeight:0},detailsContent:{paddingTop:12,paddingBottom:28,gap:20},
  detailsHeader:{minHeight:64,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},headerButton:{minHeight:48,minWidth:48,justifyContent:'center',alignItems:'center'},pageTitle:{flex:1,textAlign:'center',fontSize:22,lineHeight:32,fontWeight:'700',color:c.text},
  walletCard:{padding:18,gap:14,borderRadius:24,backgroundColor:c.surface},walletCaption:{flexDirection:'row',alignItems:'center',gap:12},walletIcon:{width:36,height:36,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:c.brandSoft},walletLabel:{fontSize:16,lineHeight:24,fontWeight:'500',color:c.textMuted},
  walletValueRow:{flexDirection:'row',alignItems:'baseline',flexWrap:'wrap',gap:8},walletValue:{fontSize:40,lineHeight:52,fontWeight:'700',color:c.text,fontVariant:['tabular-nums'],flexShrink:1},walletValueCompact:{fontSize:32,lineHeight:44},walletUnit:{fontSize:16,lineHeight:24,color:c.textMuted},
  heldRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8,padding:10,borderRadius:16,backgroundColor:c.surfaceMuted},heldLabel:{flexDirection:'row',alignItems:'center',gap:8},heldDot:{width:8,height:8,borderRadius:4,backgroundColor:c.gold},heldText:{fontSize:15,lineHeight:24,color:c.textMuted},heldValue:{fontSize:16,lineHeight:24,fontWeight:'600',fontVariant:['tabular-nums'],color:c.text},statusMessage:{fontSize:14,lineHeight:22,color:c.textMuted},
  rulesCard:{borderRadius:20,backgroundColor:c.surface,overflow:'hidden'},rulesButton:{minHeight:60,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12},rulesTitle:{flex:1,fontSize:16,lineHeight:24,fontWeight:'500',color:c.text},rulesContent:{padding:16,paddingTop:0,gap:14},
  ledgerTitle:{fontSize:22,lineHeight:32,fontWeight:'700',color:c.text},filters:{flexDirection:'row',padding:4,borderRadius:16,gap:4,backgroundColor:c.surfaceMuted},filterButton:{flex:1,minHeight:48,paddingHorizontal:4,paddingVertical:10,borderRadius:12,justifyContent:'center',alignItems:'center'},filterSelected:{backgroundColor:c.brandSoft},filterText:{fontSize:15,lineHeight:24,color:c.textMuted},filterTextSelected:{color:c.brand,fontWeight:'700'},
  dayLabel:{fontSize:14,lineHeight:22,color:c.textMuted,marginBottom:10,marginTop:4},recordCard:{borderRadius:20,backgroundColor:c.surface,overflow:'hidden'},recordButton:{padding:16,gap:12},recordMain:{flexDirection:'row',gap:10,alignItems:'center'},recordIcon:{height:40,width:40,borderRadius:14,justifyContent:'center',alignItems:'center'},recordCopy:{flex:1,minWidth:0,gap:5},recordName:{fontSize:16,lineHeight:24,fontWeight:'600',color:c.text},recordMeta:{fontSize:14,lineHeight:22,color:c.textMuted},recordTotals:{maxWidth:124,alignItems:'flex-end',gap:6},recordTotalsStack:{maxWidth:'100%',flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',marginLeft:50},recordAmount:{fontSize:17,lineHeight:26,fontWeight:'600',fontVariant:['tabular-nums'],color:c.text},recordUnit:{fontSize:13,lineHeight:20,fontWeight:'400',color:c.textMuted},stateBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:8},stateText:{fontSize:13,lineHeight:20,fontWeight:'500'},
  recordDetails:{padding:16,paddingTop:14,gap:10,borderTopWidth:1,borderColor:c.border},detailLine:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8},detailLabel:{fontSize:14,lineHeight:22,color:c.textMuted},detailValue:{fontSize:14,lineHeight:22,fontVariant:['tabular-nums'],fontWeight:'600',color:c.text},empty:{padding:24,gap:12,alignItems:'center'},loadRecords:{minHeight:48,borderWidth:1,borderColor:c.brand,borderRadius:16,paddingHorizontal:12,paddingVertical:12,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},loadText:{fontSize:15,lineHeight:24,fontWeight:'600',color:c.brand},
  bar:{paddingHorizontal:16,paddingVertical:8,gap:4,borderBottomWidth:1,borderColor:c.border,backgroundColor:c.surface},
  barLine:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
  barBalance:{flexBasis:140,minWidth:120},
  balance:{color:c.text,fontSize:16,lineHeight:24,fontWeight:'700',fontVariant:['tabular-nums']},
  small:{color:c.text,fontSize:13,lineHeight:20},action:{color:c.brand,fontSize:14,lineHeight:22,fontWeight:'600'},
  grow:{flex:1},smallButton:{minHeight:48,minWidth:48,paddingHorizontal:8,justifyContent:'center',alignItems:'center'},
  inline:{paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:c.surface},
  scrim:{flex:1,backgroundColor:c.overlay},modal:{justifyContent:'flex-end'},
  sheet:{maxHeight:'88%',backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,overflow:'hidden',marginHorizontal:8},
  detailsSheet:{height:'100%',maxHeight:'100%',flex:1,marginHorizontal:0,borderTopLeftRadius:0,borderTopRightRadius:0,backgroundColor:c.background},sheetScroll:{flexGrow:0,flexShrink:1},
  header:{paddingHorizontal:20,paddingTop:12,paddingBottom:4,flexDirection:'row',alignItems:'center',gap:8},
  disclosure:{alignSelf:'flex-start',minHeight:48,flexDirection:'row',alignItems:'center',gap:7},
  disclosureText:{color:c.textMuted,fontSize:13,lineHeight:20},costDetails:{gap:14,paddingTop:4},
  title:{color:c.text,fontSize:18,lineHeight:27,fontWeight:'700'},text:{color:c.text,fontSize:15,lineHeight:24},
  content:{paddingHorizontal:20,paddingVertical:12,gap:10},noteBox:{padding:16,gap:8,borderRadius:12,backgroundColor:c.surfaceMuted},
  note:{color:c.text,fontSize:15,lineHeight:24},error:{color:c.warning,fontSize:14,lineHeight:22},
  footer:{paddingHorizontal:20,paddingTop:8,paddingBottom:20,gap:12,flexDirection:'row',backgroundColor:c.surface},
  cancelButton:{minWidth:80,backgroundColor:c.surfaceMuted},continueButton:{flex:1},
  button:{minHeight:48,alignItems:'center',justifyContent:'center',padding:12,borderRadius:12,backgroundColor:c.surface},
  buttonText:{fontSize:16,lineHeight:24,fontWeight:'700'},ledger:{gap:12},record:{paddingVertical:12,gap:6,borderBottomWidth:1,borderColor:c.border},
});
