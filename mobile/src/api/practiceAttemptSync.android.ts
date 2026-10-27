import {useLayoutEffect,useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL,mobileApi,mobileSessionSnapshot,type AuthResponse} from './client';
import {studyRequestId} from './studyTypes';
import {createPracticeAttemptQueue} from './practiceAttemptQueue';
export const practiceAttemptSync=createPracticeAttemptQueue({storage:AsyncStorage,session:mobileSessionSnapshot,id:studyRequestId,send:entry=>mobileApi.recordAttempt(entry.questionId,entry.selected,entry.timeMs,entry.response,entry.clientAttemptId)});
export const usePracticeAttemptSync=()=>useSyncExternalStore(practiceAttemptSync.subscribe,practiceAttemptSync.getSnapshot,practiceAttemptSync.getSnapshot);
export function usePracticeAttemptOwner(user:AuthResponse['user']|undefined,active:boolean){
  const revision=mobileSessionSnapshot().revision;
  useLayoutEffect(()=>{practiceAttemptSync.activate(user?JSON.stringify([API_BASE_URL,user.id,user.certificateId||'']):null);},[user?.id,user?.certificateId,revision]);
  useLayoutEffect(()=>{practiceAttemptSync.setActive(active);},[active]);
}
