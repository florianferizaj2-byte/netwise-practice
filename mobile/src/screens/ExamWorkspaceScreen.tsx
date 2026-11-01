import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { AnimatedPressable } from "../components/Motion";
import { ScreenActivityProvider, useScreenActive } from "../navigation/ScreenActivity";
import { useLearningFocusState } from "../components/AiLearningFocus";
import { AiText, useAiDesign } from "./ai-learning/AiElements";
import { AiLearningScreen } from "./AiLearningScreen";
import type { AuthResponse } from "../api/client";
import type { AppTab, NavigationOptions } from "../types";
export function ExamWorkspaceScreen({normal,preview,user,certificateName,onNavigate,openAiKey=0}:{normal:ReactNode;preview?:boolean;
  user?:AuthResponse["user"];certificateName:string;openAiKey?:number;onNavigate:(tab:AppTab,options?:NavigationOptions)=>void}){
  const [mode,setMode]=useState<"bank"|"ai">("bank"),[visited,setVisited]=useState(false),[focused,setFocused]=useState(false);
  const active=useScreenActive(),systemFocus=useLearningFocusState(),{p}=useAiDesign();
  useEffect(()=>{if(openAiKey){setMode("ai");setVisited(true);}},[openAiKey]);
  const switcher=<View style={{flexDirection:"row",padding:4,gap:4,marginHorizontal:20,marginVertical:8,borderRadius:12,backgroundColor:p.line}}>
    {([{id:"bank",title:"题库组卷"},{id:"ai",title:"AI 个性化"}] as const).map(item=><AnimatedPressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.title}
      accessibilityState={{selected:mode===item.id}} onPress={()=>{setMode(item.id);if(item.id==="ai")setVisited(true);}}
      style={{flex:1,minHeight:42,paddingHorizontal:12,paddingVertical:9,alignItems:"center",justifyContent:"center",borderRadius:9,backgroundColor:mode===item.id?p.blue:"transparent"}}>
      <AiText type="small" style={{fontWeight:"600",color:mode===item.id?"#FFF":p.muted}}>{item.title}</AiText></AnimatedPressable>)}
  </View>;
  return <View style={{flex:1,backgroundColor:p.bg}}>
    {mode==="bank"&&!focused&&!systemFocus&&switcher}
    <View style={{flex:1,display:mode==="bank"?"flex":"none"}} accessibilityElementsHidden={mode!=="bank"} importantForAccessibility={mode==="bank"?"auto":"no-hide-descendants"}>
      <ScreenActivityProvider active={active&&mode==="bank"}>{normal}</ScreenActivityProvider></View>
    {visited&&<View style={{flex:1,display:mode==="ai"?"flex":"none"}} accessibilityElementsHidden={mode!=="ai"} importantForAccessibility={mode==="ai"?"auto":"no-hide-descendants"}>
      <ScreenActivityProvider active={active&&mode==="ai"}><AiLearningScreen kind="exam" preview={preview} user={user} certificateName={certificateName} onNavigate={onNavigate}
        onExamFocus={setFocused} homeAccessory={switcher}/></ScreenActivityProvider></View>}
  </View>;
}
