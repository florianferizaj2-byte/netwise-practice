import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { mobileApi } from "../api/client";
import type { AiLearningSummary } from "../api/aiLearningTypes";
import { AnimatedPressable } from "./Motion";
import { useTheme } from "../theme";
export function AiLearningTaskNotice({enabled,scope,onOpen}:{enabled:boolean;scope:string;onOpen:(kind:"practice"|"exam")=>void}){
  const [job,setJob]=useState<AiLearningSummary|null>(null),{colors:c}=useTheme();
  useEffect(()=>{
    setJob(null);if(!enabled)return;
    let alive=true;const refresh=()=>void mobileApi.aiLearningJobs().then(r=>{if(alive)setJob(r.jobs.find(j=>!j.submitted&&j.status!=="canceled")||null);}).catch(()=>{});
    refresh();const timer=setInterval(refresh,7000);return()=>{alive=false;clearInterval(timer);};
  },[enabled,scope]);
  if(!enabled||!job)return null;
  return <View style={{position:"absolute",bottom:98,left:16,right:16,zIndex:30}}>
    <AnimatedPressable accessibilityRole="button" accessibilityLabel="查看个性化出题进度" onPress={()=>onOpen(job.kind)} style={{padding:12,minHeight:52,borderRadius:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.brand}}>
      <Text style={{color:c.brand,fontWeight:"700",fontSize:14}}>{job.status==="blocked"?"AI 出题待恢复":job.status==="completed"?"专属题组已备好":"AI 正在后台出题"} · {job.readyCount}/{job.targetCount} 题</Text>
      <Text style={{color:c.textMuted,fontSize:12}}>点击继续{job.kind==="exam"?"考试":"练习"}，已交付题目与作答均保留</Text>
    </AnimatedPressable>
  </View>;
}
