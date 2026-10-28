import { API_BASE_URL, mobileApi, mobileSessionSnapshot, type Question, type QuestionPage } from './client';
import { CacheCancelledError } from './resourceCache';
import { persistentStudyData } from './cachePolicy';
import { practiceCheckpoint } from './practiceCheckpoint.android';
import { masteredQuestion, practiceScope, type PracticeCheckpoint, type PracticeHistory } from './practiceCheckpointStore';

export type PracticeSelection = { session: 'standard' | 'daily' | 'review'; mode: 'sequential' | 'random'; chapter?: string; section?: string; point?: string };
export const practiceOwner = (user: {id:string;certificateId?:string|null}) => JSON.stringify([API_BASE_URL,user.id,user.certificateId||'']);
export function keepPracticeQuestion(q:Question, history:PracticeHistory, review=false) {
  return review ? !!(q.answered??q.attempted)||Object.hasOwn(history,q.id) : !q.mastered && !masteredQuestion(Object.hasOwn(history,q.id)?history[q.id]:undefined);
}
export async function ownedPracticePage(owner:string, selection:PracticeSelection, offset:number, seed:string, before:string) {
  const session=mobileSessionSnapshot(), visited=new Set<number>();
  let page:QuestionPage;
  do {
    if(visited.has(offset))throw Error('题目分页没有前进，请重新同步题库');visited.add(offset);
    page=await mobileApi.questionPage(offset,{feedback:'instant',chapter:selection.chapter,knowledgeSection:selection.section,knowledgePoint:selection.point,
      ...(selection.session==='review'?{review:'answered' as const}:{excludeCorrect:'1' as const,before})},selection.mode==='random'?seed:undefined,true);
    if(session.revision!==mobileSessionSnapshot().revision || session.token!==mobileSessionSnapshot().token)throw new CacheCancelledError();
    await practiceCheckpoint.observe(owner,page.items);
    const history=await practiceCheckpoint.history(owner);
    const items=page.items.filter(q=>keepPracticeQuestion(q,history,selection.session==='review'));
    if(items.length || page.nextOffset===null)return {...page,items,offset:page.offset??offset};
    offset=page.nextOffset;
  } while(visited.size<2000);
  throw Error('题库分页超过读取限制，已保留续刷位置');
}
export async function loadOwnedPractice(owner:string, selection:PracticeSelection, questionId?:string) {
  let scope=practiceScope(selection);
  let saved=await practiceCheckpoint.read(owner,scope);
  if(!saved && selection.session!=='daily'){
    saved=await practiceCheckpoint.find(owner,selection);
    if(saved){selection={session:selection.session,mode:saved.mode,chapter:saved.chapter,section:saved.section,point:saved.point};scope=practiceScope(selection);}
  }
  if(selection.session==='daily' && saved && !saved.completed && !selection.chapter&&!selection.section&&!selection.point)selection={...selection,chapter:saved.chapter,section:saved.section,point:saved.point};
  const seed=saved&&!saved.completed?saved.seed:Math.random().toString(36).slice(2), before=saved&&!saved.completed?saved.before:new Date().toISOString();
  let history=await practiceCheckpoint.history(owner);
  if(saved && !saved.completed && (!questionId || questionId===saved.questionId) && (selection.session!=='daily' || !selection.chapter&&!selection.section&&!selection.point || saved.chapter===selection.chapter&&saved.section===selection.section&&saved.point===selection.point)) {
    const snapshot=saved.snapshot;
    if(snapshot?.length && snapshot.some(q=>q.id===saved.questionId)) {
      let index=snapshot.findIndex(q=>q.id===saved.questionId);if(index<0)index=saved.snapshotIndex??0;
      if(selection.session!=='review')while(index<snapshot.length&&!keepPracticeQuestion(snapshot[index],history))index++;
      if(index<snapshot.length)return {items:snapshot,index,total:saved.total??snapshot.length,nextOffset:saved.nextOffset??null,base:Math.max(0,saved.index-(saved.snapshotIndex??0)),saved,selection,seed,before,scope,notice:''};
      if(saved.nextOffset===null){await practiceCheckpoint.save(owner,{...saved,completed:true});return freshOwnedPractice(owner,selection,Math.random().toString(36).slice(2),new Date().toISOString(),scope);}
      if(saved.nextOffset!==undefined){const page=await ownedPracticePage(owner,selection,saved.nextOffset,seed,before);return {...page,index:0,base:page.offset??0,saved:null,selection,seed,before,scope,notice:''};}
    }
    // Old v1.0.9 checkpoints did not keep an ordered queue. Recover the exact
    // question even when an older server does not understand an anchor query.
    let page=await mobileApi.questionPage(Math.floor(saved.index/40)*40,{feedback:'instant',chapter:selection.chapter,knowledgeSection:selection.section,knowledgePoint:selection.point,anchor:saved.questionId},selection.mode==='random'?seed:undefined,true);
    await practiceCheckpoint.observe(owner,page.items);history=await practiceCheckpoint.history(owner);
    let index=page.items.findIndex(q=>q.id===saved.questionId);
    if(index<0){try{const q=await mobileApi.practiceQuestion(saved.questionId);page={...page,items:[q,...page.items]};index=0;}catch(error){if((error as {status?:number}).status!==404)throw error;}}
    if(index>=0 && saved.submitted && page.items[index].answer?.length && saved.fingerprint===JSON.stringify([page.items[index].type,page.items[index].question,page.items[index].options,page.items[index].sharedStem])){
      const correct=page.items[index].type==='short_answer'?saved.selected[0]==='A':JSON.stringify([...saved.selected].sort())===JSON.stringify([...page.items[index].answer!].sort());
      await practiceCheckpoint.record(owner,{questionId:saved.questionId,correct,confirmed:false});history=await practiceCheckpoint.history(owner);
    }
    if(index>=0 && (selection.session==='review'||keepPracticeQuestion(page.items[index],history)))return {...page,index,base:Math.max(0,saved.index-index),saved,selection,seed,before,scope,notice:''};
    const items=page.items.slice(Math.max(0,index+1)).filter(q=>keepPracticeQuestion(q,history,selection.session==='review'));
    if(items.length||page.nextOffset===null)return {...page,items,index:0,base:saved.index,saved:null,selection,seed,before,scope,notice:''};
    const next=await ownedPracticePage(owner,selection,page.nextOffset,seed,before);return {...next,index:0,base:next.offset??0,saved:null,selection,seed,before,scope,notice:''};
  }
  return freshOwnedPractice(owner,selection,seed,before,scope);
}
async function freshOwnedPractice(owner:string, selection:PracticeSelection, seed:string, before:string, scope:string){
  const page=await ownedPracticePage(owner,selection,0,seed,before);
  let items=page.items;
  if(selection.session==='daily' && items.length<30 && (selection.chapter||selection.section||selection.point)){
    const extra=await ownedPracticePage(owner,{session:'daily',mode:'random'},0,seed.slice(0,55)+'-extra',before), seen=new Set(items.map(q=>q.id));
    items=[...items,...extra.items.filter(q=>!seen.has(q.id))];
  }
  if(selection.session==='daily')items=items.slice(0,30);
  return {...page,items,total:selection.session==='daily'?items.length:page.total,index:0,base:page.offset??0,
    nextOffset:selection.session==='daily'?null:page.nextOffset,saved:null,selection,seed,before,scope,
    notice:page.practiceStateVersion===1?'':'当前服务器未更新学习状态接口，历史答对状态暂按本机记录过滤。'};
}

export function saveOwnedPractice(owner:string, selection:PracticeSelection, state:{questions:Question[];index:number;base:number;total:number;nextOffset:number|null;seed:string;before:string;selected:string[];draft:string;submitted:boolean;completed:boolean}) {
  const current=state.questions[state.index];if(!current)return Promise.resolve();
  const start=Math.max(0,state.index-20), snapshot=persistentStudyData('/questions?feedback=instant',{items:state.questions.slice(start),total:state.total,nextOffset:state.nextOffset}) as {items:Question[]}|undefined;
  const row:PracticeCheckpoint={version:1,questionId:current.id,fingerprint:JSON.stringify([current.type,current.question,current.options,current.sharedStem]),index:state.base+state.index,
    ...selection,selected:[...state.selected],draft:state.draft,submitted:state.submitted,updatedAt:new Date().toISOString(),seed:state.seed,before:state.before,
    snapshot:snapshot?.items,snapshotIndex:state.index-start,nextOffset:state.nextOffset,total:state.total,completed:state.completed};
  return practiceCheckpoint.save(owner,row);
}
