import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Keyboard, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
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

export function AndroidPointsInline({active=true}:{active?:boolean}){
  const s=useThemedStyles(styles),state=useAndroidPoints(),host=useId();
  useEffect(()=>{if(active&&state.ownerKey)return androidPointsFlow.presentOn(host);},[active,state.ownerKey,host]);
  if(!active||!state.ownerKey)return null;
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
  useEffect(()=>{if(prompt){setExpanded(false);Keyboard.dismiss();}},[prompt?.requestId]);
  const wallet=state.wallet,number=(n:number)=>formatPointUnits(n,wallet?.scale||1000);
  const model=state.prices?.available?state.prices.models.find(m=>m.id===state.prices?.primaryModelId):null;
  const example=model?.services.find(service=>service.id===prompt?.priceId);
  const close=()=>{if(prompt)androidPointsFlow.cancel();else androidPointsFlow.hideDetails();};
  if(!belongs)return null;
  return <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType={reduceMotion?'none':'fade'} onRequestClose={close}>
    <View style={s.scrim}>
      <AndroidModalSafeArea style={s.modal}>
      <View testID={prompt?'android-ai-confirm-sheet':'android-points-details-sheet'} accessibilityViewIsModal style={[s.sheet,!prompt&&s.detailsSheet]}>
      <View style={s.header}><Text accessibilityRole="header" style={[s.title,s.grow]}>{prompt?prompt.name:'积分费用与记录'}</Text>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel={prompt?'取消本次AI请求':'关闭积分费用与记录'} onPress={close} style={s.smallButton}><Text style={s.action}>{prompt?'取消':'关闭'}</Text></AnimatedPressable></View>
      <ScrollView style={s.sheetScroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.balance}>可用 {wallet?number(wallet.availableUnits):'—'} 积分 · 预扣 {wallet?number(wallet.heldUnits):'—'}</Text>
        {!!state.error&&<Text style={s.error} accessibilityRole="alert">{state.error}</Text>}
        {prompt?<>
          <Text style={s.text}>免费结果不扣积分，新 AI 调用按实际用量结算。</Text>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="费用说明" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={s.disclosure}>
            <AppIcon name="info" size={16} color={colors.textMuted}/><Text style={s.disclosureText}>费用说明</Text><AppIcon name={expanded?'chevron-up':'chevron-right'} size={14} color={colors.textMuted}/>
          </AnimatedPressable>
          {expanded&&<View testID="android-ai-cost-details" style={s.costDetails}>
          <Text style={s.text}>普通刷题、已有内容、缓存与确定性判分免费；只有新 AI 调用才按实际用量扣积分。</Text>
          {wallet?.availableUnits===0&&<Text style={s.note}>可用积分为 0 仍可尝试免费结果；需要新 AI 时，由服务端校验余额。</Text>}
          {!!prompt.maybeFree&&<Text style={s.note}>{prompt.maybeFree}</Text>}
          {example&&model?<View style={s.noteBox}>
            <Text style={s.text}>{model.name} · 用量示例 {formatPointUnits(example.sampleUnits,state.prices?.scale||1000)} 积分</Text>
            <Text style={s.text}>每轮 1000 输入 Token＋该服务首轮输出额度，含标准审核，不含重试。这不是固定价格，也不是预扣或扣费上限。</Text>
          </View>:<Text style={s.note}>暂未取得本服务的有效用量示例，不能将未知费用当作 0 积分。是否需要 AI、余额是否足够，由服务端校验。</Text>}
          <Text style={s.text}>成功按实际用量结算，预扣差额释放；任务最终失败退回该任务预扣，但不会延长原积分有效期。接口可能按管理员优先级切换，实际费用以命中的模型与用量为准。</Text>
          <AiPointsPricing userId={userId}/>
          </View>}
        </>:<>
          <Text style={s.note} accessibilityLiveRegion="polite">{state.message}</Text>
          <Text style={s.text}>可用余额不包含预扣、过期或待到账积分。积分先使用先到期部分；签到赠送当日有效，会员按原周期发放，退款不延长有效期。</Text>
          {!!wallet?.pendingUnits&&<Text style={s.note}>待到账 {number(wallet.pendingUnits)} 积分，请联系管理员核对发放记录。</Text>}
          <AnimatedPressable accessibilityRole="button" disabled={state.refreshing} onPress={()=>void androidPointsFlow.refresh()} style={s.button}><Text style={s.action}>{state.refreshing?'正在同步…':'刷新可用积分'}</Text></AnimatedPressable>
          <AiPointsPricing userId={userId}/>
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
  const s=useThemedStyles(styles),[rows,setRows]=useState<PointOperation[]>([]),[calls,setCalls]=useState<PointCall[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[next,setNext]=useState<number|null>(null),request=useRef(0);
  async function load(offset=0){
    const id=++request.current,revision=mobileSessionSnapshot().revision;setBusy(true);setError('');
    try{const data=await androidPointsApi.operations(undefined,offset);if(request.current!==id||revision!==mobileSessionSnapshot().revision)return;
      setRows(previous=>offset?[...new Map([...previous,...data.rows].map(row=>[row.id,row])).values()]:data.rows);
      setCalls(previous=>offset?[...previous,...data.calls]:data.calls);setNext(data.nextOffset??null);
    }catch(cause){if(request.current===id)setError(cause instanceof Error?cause.message:'记录暂未同步');}
    finally{if(request.current===id)setBusy(false);}
  }
  useEffect(()=>{setRows([]);setCalls([]);setNext(null);void load();return()=>{request.current++;};},[ownerKey,refreshKey]);
  return <View style={s.ledger}>
    <Text style={s.title}>积分使用记录</Text>
    <Text style={s.small}>区分实扣、预扣、退回与释放，不把预扣当成实际消费。</Text>
    {busy&&<ActivityIndicator/>}{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!busy&&!error&&!rows.length&&<Text style={s.text}>暂无积分使用记录</Text>}
    {rows.map(row=><View style={s.record} key={row.id}>
      <Text style={s.text}>{pointUsageLabel(row.feature,calls.filter(call=>call.operationId===row.id))}</Text>
      <Text style={s.balance}>{row.state==='pending'?`预扣 ${formatPointUnits(row.heldUnits)}`:row.state==='refunded'?`已退回 ${formatPointUnits(row.heldUnits)}`:`实扣 ${formatPointUnits(row.chargedUnits)}`} 积分</Text>
      <Text style={s.small}>{[...new Set(calls.filter(call=>call.operationId===row.id).map(call=>call.model))].join(' / ')||'未产生模型记录'} · {new Date(row.createdAt).toLocaleString('zh-CN')}</Text>
      {row.state==='settled'&&row.heldUnits>row.chargedUnits&&<Text style={s.small}>预扣差额 {formatPointUnits(row.heldUnits-row.chargedUnits)} 积分已释放</Text>}
      {row.state==='refunded'&&<Text style={s.small}>任务未完成；该任务预扣已退还</Text>}
    </View>)}
    <AnimatedPressable accessibilityRole="button" disabled={busy} onPress={()=>void load(next??0)} style={s.button}><Text style={s.action}>{busy?'读取中…':next!==null?'加载更多积分记录':'刷新积分记录'}</Text></AnimatedPressable>
  </View>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
  bar:{paddingHorizontal:16,paddingVertical:8,gap:4,borderBottomWidth:1,borderColor:c.border,backgroundColor:c.surface},
  barLine:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
  barBalance:{flexBasis:140,minWidth:120},
  balance:{color:c.text,fontSize:16,lineHeight:24,fontWeight:'700',fontVariant:['tabular-nums']},
  small:{color:c.text,fontSize:13,lineHeight:20},action:{color:c.brand,fontSize:14,lineHeight:22,fontWeight:'600'},
  grow:{flex:1},smallButton:{minHeight:48,minWidth:48,paddingHorizontal:8,justifyContent:'center',alignItems:'center'},
  inline:{paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:c.surface},
  scrim:{flex:1,backgroundColor:c.overlay},modal:{justifyContent:'flex-end'},
  sheet:{maxHeight:'88%',backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,overflow:'hidden',marginHorizontal:8},
  detailsSheet:{height:'88%'},sheetScroll:{flexGrow:0,flexShrink:1},
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
