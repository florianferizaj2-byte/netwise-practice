// Optional voice-pack protocol: no voice asset is invented or loaded per answer.
// The current APK retains built-in tones until a future player binds these cues.
export type PracticeVoiceEvent = 'practice.enter' | 'answer.correct' | 'answer.streak';
export type VoiceAsset = { id:string; sha256:string; url:string; bytes:number; mimeType:string; format:string; durationMs:number|null };
export type VoicePackSummary = { id:string; name:string; revision:number; enabled:boolean; updatedAt:string };
export type VoicePackManifest = VoicePackSummary & {
  schemaVersion:1;
  cues:{ 'practice.enter':string[]; 'answer.correct':string[]; 'answer.streak':Array<{count:number;clips:string[]}> };
  playback:{maxDurationMs:number;minIntervalMs:number}; assets:VoiceAsset[]; fallback:'builtin';
};
export type VoicePackCatalog = {
  revision:number;defaultPackId:string|null;packs:VoicePackSummary[];
  contract:{schemaVersion:1;events:PracticeVoiceEvent[];suggestedStreaks:number[];formats:string[];maxAssetBytes:number;maxPackBytes:number;fallback:'builtin';streakPolicy:'exact-count-then-correct';delivery:'preload-not-per-answer'};
};
export type PracticeVoiceCue = {event:PracticeVoiceEvent;streak:number;scope:string;attemptId?:string};
export function createPracticeVoiceSession() {
  let scope='',streak=0;const recorded=new Set<string>();
  return {
    enter(nextScope:string):PracticeVoiceCue|null {
      if(typeof nextScope!=='string'||!nextScope||nextScope.length>500||nextScope===scope)return null;
      scope=nextScope;streak=0;recorded.clear();return {event:'practice.enter',streak,scope};
    },
    answer(attemptId:string,correct:boolean):PracticeVoiceCue|null {
      if(!scope||typeof attemptId!=='string'||!attemptId||attemptId.length>150||recorded.has(attemptId))return null;
      // Never forget an acknowledged ID in this round: when bounded storage is
      // full, end the optional voice round rather than replay an old result.
      if(recorded.size>=2000)return null;
      recorded.add(attemptId);
      if(correct!==true){streak=0;return null;}
      streak++;return {event:streak>=2?'answer.streak':'answer.correct',streak,scope,attemptId};
    },
  };
}
export function selectVoiceClip(manifest:VoicePackManifest|null,cue:PracticeVoiceCue,random=0):VoiceAsset|null {
  if(!manifest?.enabled||manifest.schemaVersion!==1||!manifest.cues||!Array.isArray(manifest.assets))return null;
  let clips:string[];
  if(cue.event==='practice.enter')clips=manifest.cues['practice.enter'];
  else if(cue.event==='answer.streak') {
    const milestones=manifest.cues['answer.streak'];
    clips=(Array.isArray(milestones)?milestones.find(row=>row?.count===cue.streak)?.clips:undefined)??manifest.cues['answer.correct'];
  } else if(cue.event==='answer.correct')clips=manifest.cues['answer.correct'];
  else return null;
  if(!Array.isArray(clips)||!clips.length)return null;
  const index=Math.floor(Math.max(0,Math.min(.999999,Number.isFinite(random)?random:0))*clips.length);
  const id=clips[index];return manifest.assets.find(asset=>asset.id===id)??null;
}
export function voiceAssetUrl(apiBase:string,asset:VoiceAsset) {
  if(!/^[a-f0-9]{64}$/.test(asset.id)||asset.sha256!==asset.id||asset.url!=='/voice-packs/assets/'+asset.id)throw Error('Invalid voice asset address');
  const base=new URL(apiBase);if(!['https:','http:'].includes(base.protocol))throw Error('Invalid API address');
  return new URL(asset.url,base).toString();
}
