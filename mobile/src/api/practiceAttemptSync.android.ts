import { practiceCheckpoint } from './practiceCheckpoint.android';
import {useLayoutEffect,useMemo,useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL,mobileApi,mobileSessionSnapshot,type AuthResponse} from './client';
import {studyRequestId} from './studyTypes';
import {createPracticeAttemptQueue} from './practiceAttemptQueue';
let activePracticeOwner:string|null=null;
export const practiceAttemptSync=createPracticeAttemptQueue({storage:AsyncStorage,session:mobileSessionSnapshot,id:studyRequestId,send:async entry=>{
  const owner=activePracticeOwner, revision=mobileSessionSnapshot().revision;
  const result=await mobileApi.recordAttempt(entry.questionId,entry.selected,entry.timeMs,entry.response,entry.clientAttemptId);
  if(owner && owner===activePracticeOwner && revision===mobileSessionSnapshot().revision)await practiceCheckpoint.record(owner,{questionId:result.questionId,correct:result.correct,confirmed:true,attemptId:entry.clientAttemptId});
  return result;
}});
export const usePracticeAttemptSync=()=>useSyncExternalStore(practiceAttemptSync.subscribe,practiceAttemptSync.getSnapshot,practiceAttemptSync.getSnapshot);
export function usePracticeAttemptOwner(user:AuthResponse['user']|undefined,active:boolean){
  const revision=mobileSessionSnapshot().revision;
  useLayoutEffect(()=>{activePracticeOwner=user?JSON.stringify([API_BASE_URL,user.id,user.certificateId||'']):null;practiceAttemptSync.activate(activePracticeOwner);},[user?.id,user?.certificateId,revision]);
  useLayoutEffect(()=>{practiceAttemptSync.setActive(active);},[active]);
}

// A background save for another question must not redraw the current question.
export function usePracticeAttemptView(id: string | undefined) {
  const select = useMemo(() => {
    let previous: {owner:string|null;ready:boolean;entry:ReturnType<typeof practiceAttemptSync.getSnapshot>['entries'][number]|undefined}|undefined;
    return () => {
      const state=practiceAttemptSync.getSnapshot(), entry=state.entries.find(e=>e.id===id);
      if(previous && previous.owner===state.owner && previous.ready===state.ready && previous.entry===entry)return previous;
      previous={owner:state.owner,ready:state.ready,entry};return previous;
    };
  }, [id]);
  return useSyncExternalStore(practiceAttemptSync.subscribe,select,select);
}
