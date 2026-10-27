import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {mobileApi,mobileSessionSnapshot,type AccountEntitlementsResponse,type AuthResponse} from '../api/client';
import {androidPointsFlow} from '../api/androidPointsRuntime.android';
import {formatPointUnits} from '../api/androidPointsFlow.android';
import {androidAccent} from '../android-design-tokens';
import {AndroidModalSafeArea} from '../components/AndroidModalSafeArea.android';
import {AndroidPointsInline,useAndroidPoints} from '../components/AndroidPointsBar.android';
import {AppIcon} from '../components/AppIcon';
import {AnimatedPressable} from '../components/Motion';
import {RefreshControl} from '../components/RefreshControl';
import {useAppActive,useScreenActive} from '../navigation/ScreenActivity';
import {useAndroidFocusMode} from '../navigation/AndroidFocusMode.android';
import {useTheme,useThemedStyles,type ThemeColors} from '../theme';

type Props={visible:boolean;preview?:boolean;user?:AuthResponse['user'];onClose:()=>void;onUpdated?:(account:AccountEntitlementsResponse)=>void};
const tiers=[{id:'free',name:'免费',icon:'person',tone:'primary'},{id:'vip',name:'VIP',icon:'crown',tone:'member'},{id:'svip',name:'SVIP',icon:'sparkles',tone:'ai'},{id:'ssvip',name:'SSVIP',icon:'diamond',tone:'progress'}] as const;
export function CheckInScreen(props:Props){
  const {colors,reduceMotion}=useTheme(),active=useScreenActive();
  useAndroidFocusMode(props.visible&&active,props.onClose);
  return <Modal visible={props.visible&&active} statusBarTranslucent navigationBarTranslucent animationType={reduceMotion?'none':'slide'} onRequestClose={props.onClose}>
    <AndroidModalSafeArea style={{backgroundColor:colors.background}}>
      {props.visible&&active&&<CheckInContent key={props.preview?'preview':props.user?.id||'guest'} {...props}/>}
    </AndroidModalSafeArea>
  </Modal>;
}
function CheckInContent({preview=false,user,onClose,onUpdated}:Props){
  const s=useThemedStyles(styles),{colors}=useTheme(),appActive=useAppActive(),flow=useAndroidPoints(),{width,fontScale}=useWindowDimensions();
  const [account,setAccount]=useState<AccountEntitlementsResponse|null>(null),[loading,setLoading]=useState(false),[claiming,setClaiming]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[rulesOpen,setRulesOpen]=useState(false);
  const live=useRef(true),request=useRef(0),busy=useRef(false),abort=useRef<AbortController|null>(null),callback=useRef(onUpdated);callback.current=onUpdated;
  useEffect(()=>{live.current=true;return()=>{live.current=false;request.current++;abort.current?.abort();};},[]);
  const refresh=useCallback(async()=>{
    if(preview||!user||busy.current)return;
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    const id=++request.current,revision=mobileSessionSnapshot().revision;setLoading(true);setError('');
    try{const next=await mobileApi.accountEntitlements(controller.signal);if(live.current&&request.current===id&&revision===mobileSessionSnapshot().revision){setAccount(next);callback.current?.(next);}}
    catch(cause){if(live.current&&request.current===id&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'签到信息暂未同步，请重试');}
    finally{if(live.current&&request.current===id)setLoading(false);}
  },[preview,user?.id]);
  useEffect(()=>{if(appActive)void refresh();return()=>{request.current++;abort.current?.abort();};},[appActive,refresh]);
  useEffect(()=>{
    if(!appActive||preview||!user)return;
    const expiry=Date.parse(account?.checkIn.expiresAt||''),delay=Number.isFinite(expiry)?Math.max(1000,Math.min(60000,expiry-Date.now()+100)):60000;
    const timer=setTimeout(()=>void refresh(),delay);return()=>clearTimeout(timer);
  },[appActive,preview,user?.id,account,refresh]);
  async function claim(){
    if(busy.current||preview||!user||!account||account.checkIn.claimed||account.checkIn.canClaim===false)return;
    busy.current=true;abort.current?.abort();const id=++request.current,revision=mobileSessionSnapshot().revision;
    const owned=()=>live.current&&id===request.current&&revision===mobileSessionSnapshot().revision;
    setClaiming(true);setLoading(false);setError('');setNotice('');
    try{const next=await mobileApi.dailyCheckIn();if(!owned())return;setAccount(next);callback.current?.(next);
      setNotice(next.claimed?`今日 ${next.checkIn.grants.points??0} 积分已到账`:'今天已领取，明天再来');void androidPointsFlow.refresh();
    }catch(cause){if(!owned())return;setError(cause instanceof Error?cause.message:'签到未完成，请重试');
      // A lost acknowledgement is not proof of failure: re-read the owned daily
      // claim before allowing a retry. The backend also enforces one grant/day.
      try{const recovered=await mobileApi.accountEntitlements();if(owned()){setAccount(recovered);callback.current?.(recovered);if(recovered.checkIn.claimed){setError('');setNotice('今日积分已经到账');void androidPointsFlow.refresh();}}}catch{/* Keep the original actionable error. */}
    }finally{busy.current=false;if(live.current)setClaiming(false);}
  }
  const check=account?.checkIn,current=account?.plan,reward=check?.grants.points;
  const owned=!!user&&flow.ownerKey?.split(':')[0]===user.id;
  const number=(n:number)=>formatPointUnits(n,account?.points?.scale||1000);
  const label=check?.day?new Date(check.day+'T12:00:00+08:00').toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'})+' · '+new Date(check.day+'T12:00:00+08:00').toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',weekday:'long'}):'正在同步今日签到';
  const button=claiming?'正在签到…':!user||preview?'登录后签到':check?.claimed?'今日已签到':!account?'正在同步…':check?.canClaim===false?'暂不可领取':`签到领取 ${reward??'—'} 积分`;
  const canClaim=!!account&&!loading&&!claiming&&!preview&&!!user&&!check?.claimed&&check?.canClaim!==false;
  const currentTier=tiers.find(tier=>tier.id===current),compact=width<360||fontScale>1.2;
  return <View style={s.page} testID="android-check-in-screen">
    <View style={s.header}><AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭每日签到" onPress={onClose} style={s.headerButton}><AppIcon name="chevron-left" size={24} color={colors.text}/></AnimatedPressable><Text accessibilityRole="header" style={s.pageTitle}>每日签到</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="查看签到后的积分记录" disabled={!owned} onPress={androidPointsFlow.showDetails} style={s.headerButton}><AppIcon name="list" size={24} color={colors.text}/></AnimatedPressable></View>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading&&!!account} onRefresh={()=>void refresh()} tintColor={colors.brand}/>}>
      <Text style={s.date}>{preview||!user?'登录后查看今日额度':label}</Text>
      <View style={s.hero} testID="check-in-reward-card">
        <View style={s.calendar}><AppIcon name={check?.claimed?'check':'calendar'} size={32} color={colors.brand}/></View>
        <View style={s.rewardHeading}><Text style={s.rewardLabel}>{check?.claimed?'今日已领取':'今日可领取'}</Text><View style={s.rewardLine}><Text testID="check-in-reward" style={s.reward}>{reward!==undefined?'+'+reward:'—'}</Text><Text style={s.rewardUnit}>积分</Text></View></View>
        <View style={s.membershipLine}><View style={[s.membershipBadge,{backgroundColor:androidAccent(colors,'ai').soft}]}><Text style={[s.membershipText,{color:androidAccent(colors,'ai').ink}]}>{currentTier?'当前 '+currentTier.name:'额度未同步'}</Text></View><Text style={s.membershipHint}>按当前会员额度领取</Text></View>
        {!!check?.disabledReason&&<Text accessibilityLiveRegion="polite" style={s.reason}>{check.disabledReason}</Text>}
        <AnimatedPressable accessibilityRole="button" accessibilityLabel={button} disabled={!canClaim} onPress={()=>void claim()} style={[s.claimButton,(!canClaim&&!claiming)&&s.claimDisabled]}>{claiming&&<ActivityIndicator color={colors.white}/>}<Text style={[s.claimText,!canClaim&&!claiming&&{color:colors.brand}]}>{button}</Text></AnimatedPressable>
        <View style={s.expiryLine}><AppIcon name="clock" size={16} color={colors.gold}/><Text style={s.expiry}>今日领取，当日有效</Text></View>
        {!!notice&&<Text accessibilityLiveRegion="polite" style={s.success}>{notice}</Text>}
      </View>
      {!!error&&<View style={s.errorCard}><Text accessibilityRole="alert" style={s.error}>{error}</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="重试同步签到信息" disabled={loading||claiming} onPress={()=>void refresh()} style={s.retry}><Text style={s.retryText}>重新同步</Text></AnimatedPressable></View>}
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="查看可用积分和使用记录" disabled={!owned} onPress={androidPointsFlow.showDetails} style={s.balanceCard}>
        <View style={s.balanceIcon}><AppIcon name="sparkles" size={23} color={colors.brand}/></View><Text style={s.balanceLabel}>可用积分</Text><View style={s.balanceNumbers}><Text testID="check-in-balance" style={[s.balanceValue,account?.points&&account.points.availableUnits<0&&{color:colors.warning}]}>{account?.points?number(account.points.availableUnits):'—'}</Text><Text style={s.balanceUnit}>积分</Text></View><AppIcon name="chevron-right" size={18} color={colors.textMuted}/>
      </AnimatedPressable>
      <View style={s.tiersCard} testID="check-in-tiers"><Text accessibilityRole="header" style={s.sectionTitle}>每日签到额度</Text><View style={s.tierGrid}>{tiers.map(tier=>{const accent=androidAccent(colors,tier.tone),value=check?.policy?.dailyPoints[tier.id]??(tier.id==='free'?current==='free'?check?.configuredPoints:undefined:account?.pointsPlans?.[tier.id]?.dailyPoints),selected=tier.id===current;
        return <View key={tier.id} testID={'check-in-tier-'+tier.id} style={[s.tier,compact&&s.tierWide,{backgroundColor:accent.soft,borderColor:selected?colors.brand:accent.soft}]}><AppIcon name={tier.icon} size={24} color={accent.ink}/><View style={s.tierCopy}><Text style={s.tierName}>{tier.name}</Text><Text style={s.tierValue}>{value??'—'}<Text style={s.tierUnit}> 积分/天</Text></Text></View>{selected&&<View style={s.currentBadge}><Text style={s.currentText}>当前</Text></View>}</View>;
      })}</View></View>
      <View style={s.rulesCard}><AnimatedPressable accessibilityRole="button" accessibilityLabel="签到规则" accessibilityState={{expanded:rulesOpen}} onPress={()=>setRulesOpen(value=>!value)} style={s.rulesButton}><AppIcon name="info" size={23} color={colors.textMuted}/><Text style={s.rulesTitle}>签到规则</Text><AppIcon name={rulesOpen?'chevron-up':'chevron-right'} size={18} color={colors.textMuted}/></AnimatedPressable>
        {rulesOpen&&<View style={s.rules} testID="check-in-rules"><Text style={s.ruleText}>每天手动领取一次，按签到时的会员等级和后台配置发放；当天升级或额度变化也不会重复领取。</Text><Text style={s.ruleText}>以北京时间为准，签到积分当日有效；新增积分先抵扣欠分，余额恢复为正后可继续使用付费 AI。退款不会延长原有效期。</Text><Text style={s.ruleText}>已整笔发放的旧会员余额保持原有效期，该周期结束后再改为每日领取。</Text></View>}
      </View>
      <Text style={s.footnote}>每天手动领取，不再整笔发放月积分</Text>
    </ScrollView>
    <AndroidPointsInline active={appActive} headless/>
  </View>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
  page:{flex:1,backgroundColor:c.background},scroll:{flex:1},content:{paddingHorizontal:20,paddingTop:8,paddingBottom:28,gap:16},
  header:{minHeight:64,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},headerButton:{minHeight:48,minWidth:48,alignItems:'center',justifyContent:'center'},pageTitle:{flex:1,textAlign:'center',fontSize:22,lineHeight:32,fontWeight:'700',color:c.text},date:{textAlign:'center',fontSize:14,lineHeight:22,color:c.textMuted},
  hero:{padding:20,borderRadius:24,backgroundColor:c.surface,alignItems:'center',gap:12},calendar:{width:60,height:60,borderRadius:30,alignItems:'center',justifyContent:'center',backgroundColor:c.brandSoft},rewardHeading:{alignItems:'center',gap:0},rewardLabel:{fontSize:16,lineHeight:24,color:c.text},rewardLine:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',justifyContent:'center',gap:8},reward:{fontSize:48,lineHeight:64,fontWeight:'700',fontVariant:['tabular-nums'],color:c.brand,flexShrink:1},rewardUnit:{fontSize:17,lineHeight:26,color:c.textMuted},
  membershipLine:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'},membershipBadge:{paddingHorizontal:10,paddingVertical:4,borderRadius:999},membershipText:{fontSize:13,lineHeight:20,fontWeight:'600'},membershipHint:{fontSize:13,lineHeight:20,color:c.textMuted},reason:{fontSize:14,lineHeight:22,color:c.textMuted},
  claimButton:{minHeight:52,alignSelf:'stretch',borderRadius:16,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:c.action},claimDisabled:{backgroundColor:c.brandSoft},claimText:{fontSize:17,lineHeight:26,fontWeight:'600',color:c.white,flexShrink:1,textAlign:'center'},expiryLine:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,flexWrap:'wrap'},expiry:{fontSize:13,lineHeight:20,color:c.gold},success:{fontSize:14,lineHeight:22,fontWeight:'500',color:c.success,textAlign:'center'},
  balanceCard:{paddingHorizontal:16,paddingVertical:18,borderRadius:24,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},balanceIcon:{height:36,width:36,borderRadius:14,backgroundColor:c.brandSoft,alignItems:'center',justifyContent:'center'},balanceLabel:{fontSize:15,lineHeight:24,fontWeight:'500',color:c.text,flexGrow:1},balanceNumbers:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:4,maxWidth:'100%'},balanceValue:{fontSize:23,lineHeight:32,fontWeight:'600',fontVariant:['tabular-nums'],color:c.text,flexShrink:1},balanceUnit:{fontSize:13,lineHeight:20,color:c.textMuted},
  tiersCard:{padding:16,gap:12,borderRadius:24,backgroundColor:c.surface},sectionTitle:{fontSize:18,lineHeight:28,fontWeight:'700',color:c.text},tierGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},tier:{flexGrow:1,flexShrink:1,flexBasis:'46%',minWidth:0,padding:10,borderRadius:16,borderWidth:1,flexDirection:'row',alignItems:'center',gap:8,overflow:'hidden'},tierWide:{flexBasis:'100%'},tierCopy:{flex:1,minWidth:0,gap:2},tierName:{fontSize:14,lineHeight:22,fontWeight:'600',color:c.text},tierValue:{fontSize:16,lineHeight:24,fontWeight:'600',fontVariant:['tabular-nums'],color:c.text},tierUnit:{fontSize:12,lineHeight:20,fontWeight:'400',color:c.textMuted},currentBadge:{position:'absolute',top:0,right:0,borderBottomLeftRadius:10,paddingHorizontal:6,paddingVertical:2,backgroundColor:c.action},currentText:{fontSize:10,lineHeight:16,fontWeight:'500',color:c.white},
  rulesCard:{backgroundColor:c.surface,borderRadius:20,overflow:'hidden'},rulesButton:{minHeight:56,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12},rulesTitle:{flex:1,fontSize:16,lineHeight:24,color:c.text},rules:{paddingHorizontal:18,paddingBottom:18,gap:10},ruleText:{fontSize:14,lineHeight:23,color:c.textMuted},footnote:{fontSize:13,lineHeight:21,color:c.textMuted,paddingHorizontal:6},errorCard:{padding:14,borderRadius:16,backgroundColor:c.warningSoft,gap:8},error:{fontSize:14,lineHeight:22,color:c.warning},retry:{minHeight:48,justifyContent:'center'},retryText:{fontSize:15,lineHeight:24,fontWeight:'600',color:c.brand},
});
