import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, View } from "react-native";
import { API_BASE_URL, mobileApi } from "../api/client";
import type { AiLearningSummary } from "../api/aiLearningTypes";
import { AnimatedPressable } from "./Motion";
import { useTheme } from "../theme";
const examNoticeKey = (scope: string, jobId: string) =>
  "kaojiang-ai-exam-notice:" + JSON.stringify([API_BASE_URL, scope, jobId]);

export function AiLearningTaskNotice({ enabled, scope, onOpen, inline = false }: {
  enabled: boolean;
  scope: string;
  onOpen: (kind: AiLearningSummary["kind"]) => void;
  inline?: boolean;
}) {
  const [notice, setNotice] = useState<{ scope: string; job: AiLearningSummary } | null>(null);
  const acknowledged = useRef(new Set<string>());
  const { colors: c } = useTheme();

  useEffect(() => {
    setNotice(null);
    if (!enabled) return;
    const controller = new AbortController();
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const { jobs } = await mobileApi.aiLearningJobs(controller.signal);
        const job = jobs.find((item) => !item.submitted && item.status !== "canceled");
        if (controller.signal.aborted) return;
        if (job?.kind === "exam") {
          const key = examNoticeKey(scope, job.id);
          if (!acknowledged.current.has(key) && await AsyncStorage.getItem(key).catch(() => null) === "1")
            acknowledged.current.add(key);
          // A tap may have happened while this poll was reading the receipt.
          if (acknowledged.current.has(key)) {
            if (!controller.signal.aborted) setNotice(null);
            return;
          }
        }
        if (!controller.signal.aborted) setNotice(job ? { scope, job } : null);
      } catch {
        // Keep the latest notice during a transient connection failure.
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 7000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [enabled, scope]);

  if (!enabled || notice?.scope !== scope) return null;
  const { job } = notice;
  function openNotice() {
    if (job.kind === "exam") {
      const key = examNoticeKey(scope, job.id);
      if (acknowledged.current.has(key)) return;
      acknowledged.current.add(key);
      setNotice(null);
      void AsyncStorage.setItem(key, "1").catch(() => undefined);
    }
    onOpen(job.kind);
  }

  return <View style={inline
    ? {marginHorizontal:16,marginBottom:8,flexShrink:0}
    : {position:"absolute",bottom:98,left:16,right:16,zIndex:30}}>
    <AnimatedPressable accessibilityRole="button" accessibilityLabel="查看个性化出题进度" onPress={openNotice} style={{padding:12,minHeight:52,borderRadius:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.brand}}>
      <Text style={{color:c.brand,fontWeight:"700",fontSize:14}}>{job.status==="blocked"?"AI 出题待恢复":job.status==="completed"?(job.kind==="exam"?"试卷已生成":"专属题组已备好"):"AI 正在后台出题"} · {job.readyCount}/{job.targetCount} 题</Text>
      <Text style={{color:c.textMuted,fontSize:12}}>点击继续{job.kind==="exam"?"考试":"练习"}，已交付题目与作答均保留</Text>
    </AnimatedPressable>
  </View>;
}
