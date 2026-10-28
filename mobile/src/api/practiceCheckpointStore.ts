import type { Question } from './client';
export type PracticeCheckpoint = {
  version: 1; questionId: string; fingerprint: string; index: number;
  mode: 'sequential' | 'random'; chapter?: string; section?: string; point?: string;
  seed: string; before: string; selected: string[]; draft: string;
  submitted: boolean; updatedAt: string;
  session?: 'standard' | 'daily' | 'review';
  snapshot?: Question[]; snapshotIndex?: number; nextOffset?: number | null; total?: number; completed?: boolean;
};
export const practiceFingerprint = (q: Question) => JSON.stringify([q.type, q.question, q.options, q.sharedStem]);
export type PracticeHistory = Record<string, { confirmed: boolean; pending?: boolean; attemptId?: string; correct: boolean }>;
export const masteredQuestion = (row: PracticeHistory[string] | undefined) => !!(row?.confirmed || row?.pending);
export function practiceScope(row: {session?:string;mode?:string;chapter?:string;section?:string;point?:string}) {
  return row.session==='daily' ? 'daily' : JSON.stringify([row.session||'standard',row.mode||'sequential',row.chapter||'',row.section||'',row.point||'']);
}
export function createPracticeCheckpointStore(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }) {
  type Book={format:2;latest:string|null;sessions:Record<string,PracticeCheckpoint>;history:PracticeHistory};
  let writes=Promise.resolve();
  const key=(owner:string)=>'kaojiang-practice-checkpoint-v1:'+encodeURIComponent(owner);
  const empty=():Book=>({format:2,latest:null,sessions:{},history:{}});
  const id=(value:unknown)=>typeof value==='string' && value.length>0 && value.length<=512;
  const valid=(row:PracticeCheckpoint)=>row?.version===1 && ['sequential','random'].includes(row.mode) && id(row.questionId)
    && Number.isSafeInteger(row.index) && row.index>=0 && typeof row.fingerprint==='string' && row.fingerprint.length<=200000
    && typeof row.seed==='string' && row.seed.length<=64 && typeof row.before==='string' && Number.isFinite(Date.parse(row.before))
    && [row.chapter,row.section,row.point].every(v=>v===undefined || typeof v==='string' && v.length<=500)
    && Array.isArray(row.selected) && row.selected.length<=5 && row.selected.every(v=>/^[A-E]$/.test(v))
    && typeof row.draft==='string' && row.draft.length<=5000 && typeof row.submitted==='boolean'
    && (row.session===undefined || ['standard','daily','review'].includes(row.session))
    && typeof row.updatedAt==='string' && Number.isFinite(Date.parse(row.updatedAt))
    && (row.completed===undefined || typeof row.completed==='boolean')
    && (row.nextOffset===undefined || row.nextOffset===null || Number.isSafeInteger(row.nextOffset)&&row.nextOffset>=0);
  const validSnapshot=(snapshot:unknown):snapshot is Question[]=>Array.isArray(snapshot)&&snapshot.length<=100&&snapshot.every(q=>id(q?.id)&&q.source!=='ai_generated'&&typeof q.question==='string'&&q.options!==null&&typeof q.options==='object'&&Object.values(q.options).every(value=>typeof value==='string'))&&new Set(snapshot.map(q=>q.id)).size===snapshot.length;
  const clean=(row:PracticeCheckpoint)=>{if(row.snapshot!==undefined&&!validSnapshot(row.snapshot)){const copy={...row};delete copy.snapshot;delete copy.snapshotIndex;return copy;}return row;};
  async function load(owner:string, strict=false):Promise<Book>{
    const raw=await storage.getItem(key(owner));if(!raw)return empty();
    if(raw.length>1_900_000)throw Error('本机学习记录超出读取限制，已保留原数据');
    try{
      const row=JSON.parse(raw);
      if(valid(row)){const scope=practiceScope(row);return{format:2,latest:scope,sessions:{[scope]:clean(row)},history:{}};}
      if(row?.format!==2 || !row.sessions || !row.history){if(strict)throw Error('本机续刷记录格式无效，原数据未覆盖');return empty();}
      const sessions=Object.fromEntries(Object.entries(row.sessions).filter(([scope,value])=>scope.length<=2200 && valid(value as PracticeCheckpoint)).map(([scope,value])=>[scope,clean(value as PracticeCheckpoint)]));
      const history=Object.fromEntries(Object.entries(row.history).filter(([question,value])=>id(question)&&!!value&&typeof (value as PracticeHistory[string]).confirmed==='boolean'&&typeof (value as PracticeHistory[string]).correct==='boolean'&&((value as PracticeHistory[string]).pending===undefined||typeof (value as PracticeHistory[string]).pending==='boolean')));
      return{format:2,latest:typeof row.latest==='string'&&Object.hasOwn(sessions,row.latest)?row.latest:null,sessions,history} as Book;
    }catch(error){if(strict)throw Error('本机续刷记录损坏，原数据未覆盖');return empty();}
  }
  const listeners=new Set<()=>void>();
  function mutate(owner:string,work:(book:Book)=>void){
    const job=writes.then(async()=>{
      const book=await load(owner,true);work(book);
      // Keep every cursor and answer flag. Only old question snapshots are
      // cache data and may be evicted; never erase progress to fit a quota.
      let body=JSON.stringify(book);
      for(const [scope,row]of Object.entries(book.sessions).sort((a,b)=>a[1].updatedAt.localeCompare(b[1].updatedAt))){
        if(body.length<=1_500_000)break;
        if(scope!==book.latest && row.snapshot){delete row.snapshot;body=JSON.stringify(book);}
      }
      if(body.length>1_800_000)throw Error('本机学习记录空间不足，原记录未覆盖');
      await storage.setItem(key(owner),body);listeners.forEach(run=>run());
    });writes=job.catch(()=>{});return job;
  }
  return {
    subscribe(run:()=>void){listeners.add(run);return()=>{listeners.delete(run)}},
    async read(owner:string,scope?:string):Promise<PracticeCheckpoint|null>{await writes;const book=await load(owner);const target=scope||book.latest;return target&&Object.hasOwn(book.sessions,target)?book.sessions[target]:null;},
    async find(owner:string,selection:{session?:string;mode:string;chapter?:string;section?:string;point?:string}){
      await writes;const book=await load(owner);
      return Object.values(book.sessions).filter(row=>!row.completed&&(row.session||'standard')===(selection.session||'standard')&&row.mode===selection.mode&&["chapter","section","point"].every(key=>!selection[key as 'chapter']||row[key as 'chapter']===selection[key as 'chapter'])).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]||null;
    },
    async history(owner:string){await writes;return(await load(owner)).history;},
    save(owner:string,row:PracticeCheckpoint|null,scope?:string){
      if(row && (!valid(row)||(row.snapshot!==undefined&&!validSnapshot(row.snapshot))||(scope!==undefined&&scope!==practiceScope(row))))return Promise.reject(Error('续刷记录格式无效，原记录未覆盖'));
      return mutate(owner,book=>{
        const target=scope||(row?practiceScope(row):book.latest);
        if(!target)return;
        if(row){book.sessions[target]=row;if(row.session!=='daily'&&row.session!=='review')book.latest=target;}
        else{delete book.sessions[target];if(book.latest===target)book.latest=null;}
      });
    },
    record(owner:string,result:{questionId:string;correct:boolean;confirmed:boolean;attemptId?:string}){
      if(!id(result.questionId))return Promise.reject(Error('题目记录编号无效'));
      return mutate(owner,book=>{
        const old=Object.hasOwn(book.history,result.questionId)?book.history[result.questionId]:undefined;
        const confirmed=!!old?.confirmed || result.confirmed&&result.correct;
        const pending=result.confirmed?(!old?.attemptId || old.attemptId===result.attemptId?false:old?.pending):result.correct;
        book.history[result.questionId]={confirmed,pending,correct:result.correct,attemptId:result.confirmed?old?.attemptId:result.attemptId};
      });
    },
    observe(owner:string,questions:Question[]){return mutate(owner,book=>{
      for(const q of questions){if(!(q.answered??q.attempted) && !q.mastered)continue;const old=Object.hasOwn(book.history,q.id)?book.history[q.id]:undefined;book.history[q.id]={...old,confirmed:!!old?.confirmed||!!q.mastered,correct:old?.correct??!!q.mastered};}
    });},
  };
}
