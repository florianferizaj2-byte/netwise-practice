import { useEffect, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import { AnimatedPressable } from "../components/Motion";
import { ScreenActivityProvider, useScreenActive } from "../navigation/ScreenActivity";
import { useLearningFocusState } from "../components/AiLearningFocus";
import { useTheme } from "../theme";
import { AiLearningScreen } from "./AiLearningScreen";
import type { AuthResponse } from "../api/client";
import type { AppTab, NavigationOptions } from "../types";
export function ExamWorkspaceScreen({normal,preview,user,certificateName,onNavigate,openAiKey=0}:{normal:ReactNode;preview?:boolean;
  user?:AuthResponse["user"];certificateName:string;openAiKey?:number;onNavigate:(tab:AppTab,options?:NavigationOptions)=>void}){
  const [mode,setMode]=useState<"bank"|"ai">("bank"),[visited,setVisited]=useState(false),[focused,setFocused]=useState(false);
  const active=useScreenActive(),systemFocus=useLearningFocusState(),{colors:c}=useTheme();
  useEffect(()=>{if(openAiKey){setMode("ai");setVisited(true);}},[openAiKey]);
  return <View style={{flex:1,backgroundColor:c.background}}>
    {!focused&&!systemFocus&&<View style={{flexDirection:"row",padding:8,gap:8,backgroundColor:c.surface}}>
      {([{id:"bank",title:"题库组卷"},{id:"ai",title:"AI 个性化"}] as const).map(item=><AnimatedPressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:mode===item.id}}
        onPress={()=>{setMode(item.id);if(item.id==="ai")setVisited(true);}} style={{flex:1,minHeight:48,padding:12,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:mode===item.id?c.action:c.surfaceMuted}}>
        <Text style={{fontSize:16,fontWeight:"600",color:mode===item.id?"#FFFFFF":c.text}}>{item.title}</Text></AnimatedPressable>)}
    </View>}
    <View style={{flex:1,display:mode==="bank"?"flex":"none"}} accessibilityElementsHidden={mode!=="bank"} importantForAccessibility={mode==="bank"?"auto":"no-hide-descendants"}>
      <ScreenActivityProvider active={active&&mode==="bank"}>{normal}</ScreenActivityProvider></View>
    {visited&&<View style={{flex:1,display:mode==="ai"?"flex":"none"}} accessibilityElementsHidden={mode!=="ai"} importantForAccessibility={mode==="ai"?"auto":"no-hide-descendants"}>
      <ScreenActivityProvider active={active&&mode==="ai"}><AiLearningScreen kind="exam" preview={preview} user={user} certificateName={certificateName} onNavigate={onNavigate} onExamFocus={setFocused}/></ScreenActivityProvider></View>}
  </View>;
}
