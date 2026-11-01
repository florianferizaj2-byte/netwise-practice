import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { AnimatedPressable } from "../../components/Motion";
import { useTheme } from "../../theme";

export type AiTone="ink"|"muted"|"blue"|"green"|"amber"|"red";
export function useAiDesign(){
  const {colors,resolvedMode,reduceMotion}=useTheme();
  const p=useMemo(()=>resolvedMode==="dark"?{
    bg:colors.background,card:colors.surface,ink:colors.text,muted:colors.textMuted,line:colors.border,blue:colors.action,
    link:colors.brand,soft:colors.brandSoft,green:colors.success,greenSoft:colors.successSoft,
    amber:colors.gold,amberSoft:colors.goldSoft,red:colors.warning,redSoft:colors.warningSoft,overlay:colors.overlay,
  }:{
    bg:"#F5F7FB",card:"#FFFFFF",ink:"#17243B",muted:"#66748A",line:"#E5EAF2",blue:"#2962F4",link:"#2457D6",soft:"#EDF3FF",
    green:"#178365",greenSoft:"#EAF7F1",amber:"#9F6511",amberSoft:"#FFF5E5",red:"#B54153",redSoft:"#FFF0F1",overlay:"rgba(17,31,53,0.44)",
  },[colors,resolvedMode]);
  return {p,reduceMotion};
}
export function AiText({type="body",tone="ink",style,...props}:TextProps&{
  type?:"hero"|"title"|"heading"|"body"|"small"|"tiny"|"number";tone?:AiTone;
}){
  const {p}=useAiDesign();
  const color=tone==="ink"?p.ink:tone==="blue"?p.link:p[tone];
  return <Text {...props} style={[t.base,t[type],{color},style]}/>;
}
const t=StyleSheet.create({
  base:{fontFamily:Platform.OS==="android"?"KaojiangSans":undefined},
  hero:{fontSize:26,lineHeight:35,fontWeight:"700",letterSpacing:-0.25},title:{fontSize:21,lineHeight:29,fontWeight:"700"},
  heading:{fontSize:17,lineHeight:25,fontWeight:"700"},body:{fontSize:15,lineHeight:24},
  small:{fontSize:13,lineHeight:20},tiny:{fontSize:12,lineHeight:18},number:{fontSize:28,lineHeight:36,fontWeight:"700"},
});
const paths:Record<string,string[]>={
  sparkle:["m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z","M20 2v4m-2-2h4"],
  target:["M21 12a9 9 0 1 1-9-9","M16 12a4 4 0 1 1-4-4","M12 12 21 3m-5 0h5v5"],
  trend:["M3 18 9 12l4 3 8-10","M15 5h6v6"],repeat:["M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5","M4 17a8 8 0 0 0 14 2l3-3m0 5v-5h-5"],
  chart:["M4 20h16M7 16V9m5 7V4m5 12v-5"],book:["M12 6v15","M12 6C8 3 4 4 2 5v14c3-1 6-1 10 2 4-3 7-3 10-2V5c-2-1-6-2-10 1"],
  document:["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z","M14 3v6h6M8 13h8m-8 4h6"],
  clock:["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0","M12 6v6h5"],check:["m5 12 4 4L19 6"],
  left:["m15 5-7 7 7 7"],right:["m9 5 7 7-7 7"],close:["m6 6 12 12M6 18 18 6"],
  shield:["M12 3 3 7v5c0 5 5 8 9 10 4-2 9-5 9-10V7Z","m8 12 3 3 5-6"],
  cloud:["M7 18H6a4 4 0 1 1 1-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 0 9h-1","m9 17 2 2 4-5"],
  offline:["M7 18H6a4 4 0 0 1-2-7m4-3a6 6 0 0 1 10 1 4.5 4.5 0 0 1 3 7","M3 3l18 18"],
  hourglass:["M6 3h12M6 21h12M7 3c0 5 2 6 5 9-3 3-5 4-5 9m10-18c0 5-2 6-5 9 3 3 5 4 5 9"],
  grid:["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  info:["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0","M12 11v6M12 7h.01"],
  search:["M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0","m16 16 6 6"],
  wallet:["M3 6h16v15H3z","M3 6V4l13-2v4M15 12h6v5h-6zM18 14.5h.01"],
  warning:["M12 3 2 21h20Z","M12 9v5m0 3h.01"],pause:["M8 5v14M16 5v14"],
  tune:["M4 7h16M4 17h16","M8 4v6m8 4v6"],
};
export function AiIcon({name,size=22,tone="blue",color}:{name:string;size?:number;tone?:AiTone;color?:string}){
  const {p}=useAiDesign(),stroke=color||(tone==="blue"?p.link:tone==="ink"?p.ink:p[tone]);
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    {(paths[name]||paths.document).map((d,i)=><Path key={i} d={d}/>)}
  </Svg>;
}
export function AiCard({children,style,soft=false}: {children:ReactNode;style?:StyleProp<ViewStyle>;soft?:boolean}){
  const {p}=useAiDesign();
  return <View style={[{backgroundColor:soft?p.soft:p.card,borderRadius:16,padding:16,gap:12,borderWidth:soft?0:StyleSheet.hairlineWidth,borderColor:p.line},style]}>{children}</View>;
}
export function AiTag({children,tone="blue"}:{children:ReactNode;tone?:"blue"|"green"|"amber"|"red"|"muted"}){
  const {p}=useAiDesign();const bg=tone==="green"?p.greenSoft:tone==="amber"?p.amberSoft:tone==="red"?p.redSoft:tone==="muted"?p.bg:p.soft;
  return <View style={{alignSelf:"flex-start",paddingHorizontal:8,paddingVertical:3,borderRadius:6,backgroundColor:bg}}><AiText type="tiny" tone={tone} style={{fontWeight:"600"}}>{children}</AiText></View>;
}
export function AiButton({label,onPress,variant="primary",disabled=false,busy=false,style,icon}:{label:string;onPress:()=>void;
  variant?:"primary"|"secondary"|"text";disabled?:boolean;busy?:boolean;style?:StyleProp<ViewStyle>;icon?:string}){
  const {p}=useAiDesign(),isOff=disabled||busy;
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:isOff,busy}} disabled={isOff} onPress={onPress}
    style={[{minHeight:variant==="text"?44:52,paddingVertical:12,paddingHorizontal:16,borderRadius:12,justifyContent:"center",alignItems:"center",
      flexDirection:"row",gap:8,backgroundColor:variant==="primary"?p.blue:variant==="secondary"?p.card:"transparent",
      borderWidth:variant==="secondary"?1:0,borderColor:p.line,opacity:isOff?0.48:1},style]}>
    {busy?<ActivityIndicator color={variant==="primary"?"#FFF":p.link}/>:icon?<AiIcon name={icon} color={variant==="primary"?"#FFF":p.link} size={20}/>:null}
    <AiText type="body" tone="blue" style={{fontWeight:"600",textAlign:"center",color:variant==="primary"?"#FFF":p.link}}>{label}</AiText>
  </AnimatedPressable>;
}
export function AiHeader({title,onBack,action,onAction,home=false}:{title:string;onBack?:()=>void;action?:string;onAction?:()=>void;home?:boolean}){
  const {p}=useAiDesign();
  return <View style={{paddingHorizontal:20,paddingTop:8,paddingBottom:10,minHeight:60,flexDirection:"row",alignItems:"center",gap:12}}>
    {home?<View style={{width:34,height:34,borderRadius:10,backgroundColor:p.blue,alignItems:"center",justifyContent:"center"}}><AiIcon name="sparkle" color="#FFF" size={22}/></View>:
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="返回" onPress={onBack} style={{minWidth:32,minHeight:44,justifyContent:"center"}}><AiIcon name="left" tone="ink" size={25}/></AnimatedPressable>}
    <AiText type={home?"title":"heading"} accessibilityRole="header" style={{flex:1,textAlign:home?"left":"center"}}>{title}</AiText>
    {action?<AnimatedPressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={{minHeight:44,minWidth:38,justifyContent:"center",alignItems:"flex-end"}}><AiText type="small" tone="blue" style={{fontWeight:"600"}}>{action}</AiText></AnimatedPressable>:!home?<View style={{width:32}}/>:null}
  </View>;
}
export function AiFooter({children}:{children:ReactNode}){
  const {p}=useAiDesign();
  return <View style={{backgroundColor:p.bg,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:p.line,paddingHorizontal:20,paddingTop:12,paddingBottom:12,gap:8}}>{children}</View>;
}
export function AiNotice({title,detail,tone="blue",icon="info",action,onAction}:{title:string;detail?:string;tone?:"blue"|"amber"|"red"|"green";
  icon?:string;action?:string;onAction?:()=>void}){
  const {p}=useAiDesign(),bg=tone==="amber"?p.amberSoft:tone==="red"?p.redSoft:tone==="green"?p.greenSoft:p.soft;
  return <View accessibilityLiveRegion="polite" style={{flexDirection:"row",alignItems:"flex-start",gap:10,padding:12,borderRadius:12,backgroundColor:bg}}>
    <AiIcon name={icon} tone={tone} size={20}/><View style={{flex:1,gap:3}}><AiText type="small" tone={tone} style={{fontWeight:"600"}}>{title}</AiText>
      {detail&&<AiText type="tiny" tone="muted">{detail}</AiText>}</View>
    {action&&<AnimatedPressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={{minHeight:36,justifyContent:"center"}}><AiText type="tiny" tone="blue" style={{fontWeight:"600"}}>{action}</AiText></AnimatedPressable>}
  </View>;
}
export function AiDetailRow({label,value,icon,onPress}: {label:string;value:string;icon?:string;onPress?:()=>void}){
  const {p}=useAiDesign(),content=<><View style={{flexDirection:"row",gap:10,alignItems:"center",flex:1}}>{icon&&<AiIcon name={icon} tone="muted" size={19}/>}<AiText type="small" tone="muted">{label}</AiText></View>
    <AiText type="small" style={{flexShrink:1,textAlign:"right"}}>{value}</AiText>{onPress&&<AiIcon name="right" tone="muted" size={16}/>}</>;
  return onPress?<AnimatedPressable accessibilityRole="button" accessibilityLabel={label+" "+value} onPress={onPress} style={{flexDirection:"row",gap:8,alignItems:"center",minHeight:46}}>{content}</AnimatedPressable>:
    <View style={{flexDirection:"row",gap:8,alignItems:"center",minHeight:42,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:p.line}}>{content}</View>;
}
export function AiRing({value,total,label,size=180}: {value:number;total:number;label:string;size?:number}){
  const {p}=useAiDesign(),r=(size-18)/2,circ=2*Math.PI*r,ratio=Math.min(1,Math.max(0,total?value/total:0));
  return <View style={{alignSelf:"center",width:size,height:size}}>
    <Svg width={size} height={size} accessible={false}><Circle cx={size/2} cy={size/2} r={r} fill="none" stroke={p.line} strokeWidth={10}/>
      <Circle cx={size/2} cy={size/2} r={r} fill="none" stroke={p.blue} strokeWidth={10} strokeLinecap="round" strokeDasharray={circ+" "+circ}
        strokeDashoffset={circ*(1-ratio)} rotation={-90} origin={size/2+","+size/2}/></Svg>
    <View style={{position:"absolute",left:0,right:0,top:0,bottom:0,alignItems:"center",justifyContent:"center",gap:3}}>
      <View style={{flexDirection:"row",alignItems:"baseline",gap:5}}><AiText type="number" style={{fontSize:38,lineHeight:48}}>{value}</AiText><AiText type="heading" tone="muted">/ {total}</AiText></View><AiText type="small" tone="muted">{label}</AiText>
    </View>
  </View>;
}
export function AiSteps({stage}:{stage?:string}){
  const {p,reduceMotion}=useAiDesign(),index=stage==="review"||stage==="review-streaming"?2:stage==="validate"?1:stage==="done"?4:stage==="generate"?0:-1;
  return <View style={{flexDirection:"row",alignItems:"flex-start"}}>{["生成","校验","独立审核","就绪"].map((label,i)=><View key={label} style={{flex:1,alignItems:"center",gap:7}}>
    <View style={{flexDirection:"row",alignItems:"center",width:"100%"}}><View style={{flex:1,height:1,backgroundColor:i===0?"transparent":p.line}}/>
      <View style={{width:25,height:25,borderRadius:13,backgroundColor:index>i?p.green:i===index?p.blue:p.bg,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:index>=i?"transparent":p.line}}>
        {index>i?<AiIcon name="check" color="#FFF" size={16}/>:i===index&&!reduceMotion?<ActivityIndicator color="#FFF" size={12}/>:i===index?<AiIcon name="clock" color="#FFF" size={15}/>:<AiIcon name="clock" tone="muted" size={15}/>}</View>
      <View style={{flex:1,height:1,backgroundColor:i===3?"transparent":p.line}}/></View>
    <AiText type="tiny" tone={index>i?"green":i===index?"blue":"muted"}>{label}</AiText></View>)}</View>;
}
export function AiSheet({visible,onClose,title,children}:{visible:boolean;onClose:()=>void;title:string;children:ReactNode}){
  const {p,reduceMotion}=useAiDesign();
  return <Modal visible={visible} transparent animationType={reduceMotion?"none":"fade"} onRequestClose={onClose}><View style={{flex:1,backgroundColor:p.overlay,justifyContent:"flex-end"}}>
    <Pressable accessibilityRole="button" accessibilityLabel="关闭弹窗" onPress={onClose} style={StyleSheet.absoluteFill}/>
    <View style={{backgroundColor:p.card,borderTopLeftRadius:24,borderTopRightRadius:24,maxHeight:"90%",padding:20,paddingBottom:28,gap:16}}>
      <View style={{alignSelf:"center",width:36,height:4,borderRadius:2,backgroundColor:p.line}}/>
      <View style={{flexDirection:"row",alignItems:"center",gap:12}}><AiText type="heading" style={{flex:1}}>{title}</AiText>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={{width:36,minHeight:36,alignItems:"flex-end",justifyContent:"center"}}><AiIcon name="close" tone="muted" size={22}/></AnimatedPressable></View>{children}
    </View></View></Modal>;
}
export const aiGoals=[
  {id:"weakness" as const,title:"攻克不会的",description:"补基础 · 做变式",icon:"target"},
  {id:"challenge" as const,title:"挑战更难的",description:"稳定掌握后进阶",icon:"trend"},
  {id:"review" as const,title:"巩固易忘的",description:"把答对的记得更久",icon:"repeat"},
  {id:"balanced" as const,title:"综合提分",description:"补弱项，也保住强项",icon:"chart"},
];
export const aiGoalTitle=(id:string)=>aiGoals.find(g=>g.id===id)?.title||"个性化练习";
export function AiGoalGrid({value,onChange,compact=false,cold=false}:{value:string;onChange:(id:typeof aiGoals[number]["id"])=>void;compact?:boolean;cold?:boolean}){
  const {p}=useAiDesign();
  return <View accessibilityRole="radiogroup" style={{flexDirection:"row",flexWrap:"wrap",gap:10}}>{aiGoals.map(goal=>{
    const checked=value===goal.id;
    return <AnimatedPressable key={goal.id} accessibilityRole="radio" accessibilityLabel={goal.title} accessibilityState={{checked}} onPress={()=>onChange(goal.id)}
      style={{width:"48%",flexGrow:1,borderWidth:checked?1.4:StyleSheet.hairlineWidth,borderColor:checked?p.blue:p.line,borderRadius:14,padding:12,
        minHeight:compact?62:96,backgroundColor:checked?p.soft:p.card,gap:7}}>
      <View style={{flexDirection:"row",alignItems:"center",gap:8}}><AiIcon name={goal.icon} size={23}/><AiText type="small" style={{fontWeight:"700",flex:1}}>{goal.title}</AiText></View>
      {!compact&&<AiText type="tiny" tone={checked?"blue":"muted"}>{cold&&checked?"样本不足，先做诊断":goal.description}</AiText>}
      {checked&&!compact&&<View style={{position:"absolute",top:9,right:9}}><View style={{width:5,height:5,borderRadius:3,backgroundColor:p.blue}}/></View>}
    </AnimatedPressable>;
  })}</View>;
}
export function AiMetricRow({items}: {items:Array<{value:string|number;label:string}>}){
  const {p}=useAiDesign();
  return <View style={{flexDirection:"row",alignItems:"stretch"}}>{items.map((item,i)=><View key={item.label} style={{flex:1,alignItems:"center",gap:4,paddingVertical:8,
    borderLeftWidth:i?StyleSheet.hairlineWidth:0,borderLeftColor:p.line}}>
    <AiText type="heading" style={{fontSize:22,lineHeight:30}}>{item.value}</AiText><AiText type="tiny" tone="muted" style={{textAlign:"center"}}>{item.label}</AiText>
  </View>)}</View>;
}
