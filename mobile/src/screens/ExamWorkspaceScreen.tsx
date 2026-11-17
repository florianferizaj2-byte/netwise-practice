import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { AnimatedPressable } from "../components/Motion";
import { ScreenActivityProvider, useScreenActive } from "../navigation/ScreenActivity";
import { useLearningFocusState } from "../components/AiLearningFocus";
import { AiText, useAiDesign } from "./ai-learning/AiElements";
import { AiLearningScreen } from "./AiLearningScreen";
import type { AuthResponse } from "../api/client";
import type { AiLearningKind } from "../api/aiLearningTypes";
import type { AppTab, NavigationOptions } from "../types";
type ExamMode = "bank" | AiLearningKind;
const examTabs = [
  {id:"bank",title:"题库组卷"},
  {id:"exam",title:"AI 个性化"},
  {id:"practice",title:"AI 专项练习"},
] as const;

export function ExamWorkspaceScreen({normal,preview,user,certificateName,onNavigate,openAiKey=0,openAiKind="exam",enablePractice=false}:{normal:ReactNode;preview?:boolean;
  user?:AuthResponse["user"];certificateName:string;openAiKey?:number;openAiKind?:AiLearningKind;enablePractice?:boolean;
  onNavigate:(tab:AppTab,options?:NavigationOptions)=>void}){
  const [mode,setMode]=useState<ExamMode>("bank"),[visited,setVisited]=useState<AiLearningKind[]>([]),[focused,setFocused]=useState(false);
  const active=useScreenActive(),systemFocus=useLearningFocusState(),{p}=useAiDesign();
  function select(next: ExamMode) {
    setMode(next);
    if (next !== "bank") setVisited((current) => current.includes(next) ? current : [...current, next]);
  }
  useEffect(()=>{if(openAiKey)select(enablePractice ? openAiKind : "exam");},[openAiKey,openAiKind,enablePractice]);
  const switcher=<View accessibilityRole="tablist" style={{flexDirection:"row",padding:4,gap:4,marginHorizontal:20,marginVertical:8,borderRadius:12,backgroundColor:p.line}}>
    {examTabs.filter(item=>enablePractice||item.id!=="practice").map(item=><AnimatedPressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.title}
      accessibilityState={{selected:mode===item.id}} onPress={()=>select(item.id)}
      style={{flex:1,minWidth:0,minHeight:enablePractice?48:42,paddingHorizontal:enablePractice?6:12,paddingVertical:9,alignItems:"center",justifyContent:"center",borderRadius:9,backgroundColor:mode===item.id?p.blue:"transparent"}}>
      <AiText type="small" style={{fontWeight:"600",textAlign:"center",color:mode===item.id?"#FFF":p.muted}}>{item.title}</AiText></AnimatedPressable>)}
  </View>;
  return <View style={{flex:1,backgroundColor:p.bg}}>
    {mode==="bank"&&!focused&&!systemFocus&&switcher}
    <View style={{flex:1,display:mode==="bank"?"flex":"none"}} accessibilityElementsHidden={mode!=="bank"} importantForAccessibility={mode==="bank"?"auto":"no-hide-descendants"}>
      <ScreenActivityProvider active={active&&mode==="bank"}>{normal}</ScreenActivityProvider></View>
    {visited.map((kind)=><View key={kind} style={{flex:1,display:mode===kind?"flex":"none"}} accessibilityElementsHidden={mode!==kind} importantForAccessibility={mode===kind?"auto":"no-hide-descendants"}>
      <ScreenActivityProvider active={active&&mode===kind}><AiLearningScreen kind={kind} preview={preview} user={user} certificateName={certificateName} onNavigate={onNavigate}
        onExamFocus={setFocused} homeAccessory={switcher} homeTitle={kind === "practice" ? "AI 专项练习" : undefined}/></ScreenActivityProvider></View>)}
  </View>;
}
