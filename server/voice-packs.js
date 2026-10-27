import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { z } from 'zod';
import {registerVoiceLibrary} from './voice-library.js';

export const VOICE_PACK_CONTRACT = {
  schemaVersion: 1,
  events: ['practice.enter', 'answer.correct', 'answer.streak', 'answer.wrong'],
  suggestedWrongStreaks: [1,2,3,4,5],
  wrongPolicy: 'consecutive-reset-on-correct-cap-five',
  selectionModes: ['fixed','random'],
  suggestedStreaks: [2, 3, 5, 10],
  formats: ['wav', 'mp3', 'aac', 'm4a', 'ogg', 'flac'],
  maxAssetBytes: 4 * 1024 * 1024,
  maxPackBytes: 20 * 1024 * 1024,
  maxStorageBytes: 256 * 1024 * 1024,
  maxClipsPerCue: 8,
  maxAssetsPerPack: 32,
  fallback: 'builtin',
  streakPolicy: 'exact-count-then-correct',
  delivery: 'preload-not-per-answer',
};
const error = (message, status, code) => Object.assign(new Error(message), { status, code });
const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/);
const assetIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const clips = z.array(assetIdSchema).max(8).refine(values => new Set(values).size === values.length, '同一提示不可重复引用素材');
const cuesSchema = z.object({
  'practice.enter': clips.default([]),
  'answer.correct': clips.default([]),
  'answer.wrong': z.array(z.object({count:z.number().int().min(1).max(5),clips:clips.min(1)}).strict()).max(5).optional(),
  'answer.streak': z.array(z.object({ count: z.number().int().min(2).max(1000), clips: clips.min(1) }).strict()).max(20).default([]),
}).strict().refine(cues => new Set(cues['answer.streak'].map(cue => cue.count)).size === cues['answer.streak'].length, '连对次数不可重复').refine(cues=>new Set((cues['answer.wrong']??[]).map(c=>c.count)).size===(cues['answer.wrong']??[]).length,'连错次数不可重复');
const packSchema = z.object({
  requestId: z.uuid(), expectedRevision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(60), enabled: z.boolean(), cues: cuesSchema,
  playback: z.object({ selectionModes:z.record(z.string().refine(key=>key==='practice.enter'||key==='answer.correct'||/^wrong:[1-5]$/.test(key)||(/^streak:\d{1,4}$/.test(key)&&Number(key.split(':')[1])>=2&&Number(key.split(':')[1])<=1000)),z.enum(['fixed','random'])).refine(value=>Object.keys(value).length<=27).optional(), maxDurationMs: z.number().int().min(200).max(10000).default(2500), minIntervalMs: z.number().int().min(0).max(5000).default(150) }).strict().default({ maxDurationMs:2500,minIntervalMs:150 }),
}).strict();
const idsIn = cues => [...new Set([...cues['practice.enter'], ...cues['answer.correct'], ...cues['answer.streak'].flatMap(cue => cue.clips), ...(cues['answer.wrong']??[]).flatMap(cue=>cue.clips)])];

const sceneClips=(cues,key)=>key==='practice.enter'||key==='answer.correct'?cues[key]:key.startsWith('wrong:')?(cues['answer.wrong']??[]).find(c=>c.count===Number(key.split(':')[1]))?.clips??[]:cues['answer.streak'].find(c=>c.count===Number(key.split(':')[1]))?.clips??[];
const validateSelections=body=>{for(const [key,mode]of Object.entries(body.playback.selectionModes??{}))if(mode==='fixed'&&sceneClips(body.cues,key).length>1)throw error('固定播放只能选择一条语音',400,'VOICE_SELECTION_INVALID');};

// Recognize the container from bytes, never a supplied suffix/MIME or remote URL.
// This is not a full codec decoder; a real-device listening check is still needed.
export function inspectVoiceAudio(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) throw error('音频为空或文件头不完整',415,'VOICE_AUDIO_INVALID');
  if (bytes.length > VOICE_PACK_CONTRACT.maxAssetBytes) throw error('单个音频不能超过 4 MiB',413,'VOICE_AUDIO_TOO_LARGE');
  const ascii = (a,b) => bytes.toString('ascii',a,b);
  if (ascii(0,4)==='RIFF' && ascii(8,12)==='WAVE') {
    let byteRate=0,dataBytes=0;
    for(let offset=12;offset+8<=bytes.length;) {
      const kind=ascii(offset,offset+4),size=bytes.readUInt32LE(offset+4),end=offset+8+size;
      if(end>bytes.length)throw error('WAV 数据不完整',415,'VOICE_AUDIO_INVALID');
      if(kind==='fmt ' && size>=16)byteRate=bytes.readUInt32LE(offset+16);
      if(kind==='data')dataBytes+=size;
      offset=end+(size%2);
    }
    if(!byteRate||!dataBytes)throw error('WAV 缺少有效音轨',415,'VOICE_AUDIO_INVALID');
    return {ext:'wav',mimeType:'audio/wav',durationMs:Math.round(dataBytes/byteRate*1000)};
  }
  if(ascii(0,4)==='fLaC')return {ext:'flac',mimeType:'audio/flac',durationMs:null};
  if(ascii(0,4)==='OggS' && bytes[4]===0)return {ext:'ogg',mimeType:'audio/ogg',durationMs:null};
  if(ascii(4,8)==='ftyp' && bytes.readUInt32BE(0)>=12 && bytes.readUInt32BE(0)<=bytes.length)return {ext:'m4a',mimeType:'audio/mp4',durationMs:null};
  let offset=0;
  if(ascii(0,3)==='ID3') {
    if([...bytes.subarray(6,10)].some(value=>value>127))throw error('MP3 标记无效',415,'VOICE_AUDIO_INVALID');
    offset=10+((bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9]);
  }
  if(offset+4<=bytes.length && bytes[offset]===255) {
    const head=bytes[offset+1];
    if((head&0xf6)===0xf0)return {ext:'aac',mimeType:'audio/aac',durationMs:null};
    if((head&0xe0)===0xe0 && (head&6)!==0 && (bytes[offset+2]&0xf0)!==0xf0)return {ext:'mp3',mimeType:'audio/mpeg',durationMs:null};
  }
  throw error('支持 WAV、MP3、AAC/M4A、OGG、FLAC 音频',415,'VOICE_AUDIO_INVALID');
}

export function registerVoicePackRoutes({app,route,store,requestUserId,requireAdmin}) {
  const db=store.db, directory=path.join(store.dataDir,'voice-packs','assets');
  fs.mkdirSync(directory,{recursive:true});
  db.exec(`CREATE TABLE IF NOT EXISTS voice_pack_assets (id TEXT PRIMARY KEY,ext TEXT NOT NULL,mime_type TEXT NOT NULL,bytes INTEGER NOT NULL,duration_ms INTEGER,name TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS voice_packs (id TEXT PRIMARY KEY,name TEXT NOT NULL,revision INTEGER NOT NULL,enabled INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS voice_pack_references (pack_id TEXT NOT NULL,asset_id TEXT NOT NULL,PRIMARY KEY(pack_id,asset_id));
    CREATE INDEX IF NOT EXISTS voice_pack_asset_refs ON voice_pack_references(asset_id);
    CREATE TABLE IF NOT EXISTS voice_pack_configuration (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,default_pack_id TEXT);
    INSERT OR IGNORE INTO voice_pack_configuration VALUES(1,0,NULL);
    CREATE TABLE IF NOT EXISTS voice_pack_requests (actor_id TEXT NOT NULL,request_id TEXT NOT NULL,signature TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor_id,request_id));`);
  const configuration=()=>{const row=db.prepare('SELECT revision,default_pack_id AS defaultPackId FROM voice_pack_configuration WHERE id=1').get();return {...row};};
  const assetRow=id=>db.prepare('SELECT * FROM voice_pack_assets WHERE id=?').get(id);
  const assetView=row=>({id:row.id,sha256:row.id,bytes:row.bytes,mimeType:row.mime_type,format:row.ext,durationMs:row.duration_ms,url:'/voice-packs/assets/'+row.id});
  const packRow=id=>db.prepare('SELECT * FROM voice_packs WHERE id=?').get(id);
  const summary=row=>({id:row.id,name:row.name,revision:row.revision,enabled:!!row.enabled,updatedAt:row.updated_at,...(()=>{const rows=idsIn(JSON.parse(row.data).cues).map(assetRow);return {assetCount:rows.length,bytes:rows.reduce((sum,a)=>sum+(a?.bytes??0),0)};})()});
  const manifest=row=>{const data=JSON.parse(row.data);return {schemaVersion:1,...summary(row),...data,assets:idsIn(data.cues).map(id=>assetView(assetRow(id))),fallback:'builtin'};};
  const mutate=(req,signatureInput,fn)=>{
    const signature=crypto.createHash('sha256').update(JSON.stringify(signatureInput)).digest('hex'),requestId=signatureInput.body.requestId;
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous=db.prepare('SELECT * FROM voice_pack_requests WHERE actor_id=? AND request_id=?').get(req.user.id,requestId);
      if(previous) {
        if(previous.signature!==signature)throw error('请求编号已用于其他内容',409,'VOICE_REQUEST_CONFLICT');
        const result={...JSON.parse(previous.result),replayed:true};db.exec('COMMIT');return result;
      }
      const result=fn();
      db.prepare('INSERT INTO voice_pack_requests VALUES(?,?,?,?)').run(req.user.id,requestId,signature,JSON.stringify(result));
      store.audit(req.user.id,'voice_pack_'+signatureInput.action,'voice_pack',signatureInput.id||'default',{revision:result.configuration.revision});
      db.exec('COMMIT');return {...result,replayed:false};
    } catch(failure){db.exec('ROLLBACK');throw failure;}
  };
  let library;
  const applyPack=(id,body)=>{
      validateSelections(body);
      const current=packRow(id);
      if((current?.revision??0)!==body.expectedRevision)throw error('语音包已更新，请刷新后重试',409,'VOICE_REVISION_CONFLICT');
      if(!current&&!db.prepare('SELECT 1 FROM voice_pack_drafts WHERE id=?').get(id)&&db.prepare('SELECT COUNT(*) AS n FROM (SELECT id FROM voice_packs UNION SELECT id FROM voice_pack_drafts)').get().n>=100)throw error('语音包数量已达上限',409,'VOICE_PACK_LIMIT');
      const ids=idsIn(body.cues);
      if(ids.length>VOICE_PACK_CONTRACT.maxAssetsPerPack)throw error('单个语音包最多 32 个音频素材',400,'VOICE_PACK_TOO_MANY_ASSETS');
      const assets=ids.map(assetRow);
      if(assets.some(asset=>!asset))throw error('引用的音频素材不存在',400,'VOICE_ASSET_NOT_FOUND');
      if(body.enabled)library.requireReady(ids);
      if(body.enabled&&!ids.length)throw error('请先添加音频素材再发布',400,'VOICE_PACK_EMPTY');
      if(body.enabled&&assets.some(asset=>{
        const file=path.join(directory,asset.id+'.'+asset.ext);
        return !fs.existsSync(file)||fs.statSync(file).size!==asset.bytes||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==asset.id;
      }))throw error('素材存储不完整，请修复后再发布',503,'VOICE_ASSET_STORAGE_INVALID');
      if(assets.reduce((n,a)=>n+a.bytes,0)>VOICE_PACK_CONTRACT.maxPackBytes)throw error('语音包素材总量超过 20 MiB',400,'VOICE_PACK_TOO_LARGE');
      const revision=(current?.revision??0)+1,data={cues:body.cues,playback:body.playback};
      db.prepare('INSERT INTO voice_packs VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=excluded.revision,enabled=excluded.enabled,data=excluded.data,updated_at=excluded.updated_at').run(id,body.name,revision,body.enabled?1:0,JSON.stringify(data),new Date().toISOString());
      db.prepare('DELETE FROM voice_pack_references WHERE pack_id=?').run(id);
      for(const assetId of ids)db.prepare('INSERT INTO voice_pack_references VALUES(?,?)').run(id,assetId);
      db.prepare('UPDATE voice_pack_configuration SET revision=revision+1,default_pack_id=CASE WHEN default_pack_id=? AND ?=0 THEN NULL ELSE default_pack_id END WHERE id=1').run(id,body.enabled?1:0);
      return {pack:manifest(packRow(id)),configuration:configuration()};
  };
  library=registerVoiceLibrary({route,store,requireAdmin,configuration,mutate,assetRow,assetView,packRow,applyPack,packSchema,idsIn,validateSelections});
  route('get','/api/voice-packs',req=>{
    requestUserId(req);
    return {...configuration(),contract:VOICE_PACK_CONTRACT,packs:db.prepare('SELECT * FROM voice_packs WHERE enabled=1 ORDER BY id').all().map(summary)};
  });
  route('get','/api/voice-packs/:id/manifest',req=>{
    requestUserId(req);const row=packRow(idSchema.parse(req.params.id));
    if(!row?.enabled)throw error('语音包不存在或未发布',404,'VOICE_PACK_NOT_FOUND');
    return manifest(row);
  });
  route('get','/api/admin/voice-packs',req=>{
    requireAdmin(req);return {configuration:configuration(),contract:VOICE_PACK_CONTRACT,packs:db.prepare('SELECT * FROM voice_packs ORDER BY id').all().map(manifest),assets:db.prepare('SELECT * FROM voice_pack_assets ORDER BY created_at DESC').all().map(library.adminAsset),drafts:library.drafts()};
  });
  // Register before :id so the reserved name does not shadow the default route.
  route('put','/api/admin/voice-packs/default',req=>{
    requireAdmin(req);const body=z.object({requestId:z.uuid(),expectedRevision:z.number().int().nonnegative(),packId:idSchema.nullable()}).strict().parse(req.body);
    return mutate(req,{action:'default_updated',body},()=>{
      const current=configuration();if(current.revision!==body.expectedRevision)throw error('配置已更新，请刷新后重试',409,'VOICE_REVISION_CONFLICT');
      if(body.packId!==null&&!packRow(body.packId)?.enabled)throw error('默认包必须先发布',409,'VOICE_PACK_NOT_PUBLISHED');
      db.prepare('UPDATE voice_pack_configuration SET revision=revision+1,default_pack_id=? WHERE id=1').run(body.packId);
      return {configuration:configuration()};
    });
  });
  route('put','/api/admin/voice-packs/:id',req=>{
    requireAdmin(req);const id=idSchema.parse(req.params.id),body=packSchema.parse(req.body);
    if(id==='default')throw error('该编号为保留编号',400,'VOICE_PACK_RESERVED');
    return mutate(req,{action:'updated',id,body},()=>applyPack(id,body));
  });
  const adminUpload=(req,_res,next)=>{try{requireAdmin(req);next();}catch(failure){next(failure);}};
  app.post('/api/admin/voice-packs/assets',adminUpload,express.raw({type:()=>true,limit:VOICE_PACK_CONTRACT.maxAssetBytes}), (req,res,next)=>{
    try {
      const uploadMetadata=library.uploadMetadata(req.query);
      const info=inspectVoiceAudio(req.body),name=z.string().trim().min(1).max(100).refine(value=>!/[\u0000-\u001f\u007f]/.test(value)).parse(req.query.name||'voice.'+info.ext);
      const id=crypto.createHash('sha256').update(req.body).digest('hex');let row=assetRow(id);
      if(row){
        const existing=path.join(directory,id+'.'+row.ext);
        if(!fs.existsSync(existing)||crypto.createHash('sha256').update(fs.readFileSync(existing)).digest('hex')!==id)throw error('素材存储需要修复，请管理员恢复原文件',503,'VOICE_ASSET_STORAGE_INVALID');
        res.json({asset:library.adminAsset(row),created:false});return;
      }
      const usage=db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(bytes),0) AS bytes FROM voice_pack_assets').get();
      if(usage.count>=1000||usage.bytes+req.body.length>VOICE_PACK_CONTRACT.maxStorageBytes)throw error('语音素材存储已达上限',409,'VOICE_STORAGE_LIMIT');
      const file=path.join(directory,id+'.'+info.ext),temporary=file+'.'+crypto.randomUUID()+'.tmp';
      db.exec('BEGIN IMMEDIATE');
      try {
        fs.writeFileSync(temporary,req.body,{flag:'wx'});fs.renameSync(temporary,file);
        db.prepare('INSERT INTO voice_pack_assets VALUES(?,?,?,?,?,?,?)').run(id,info.ext,info.mimeType,req.body.length,info.durationMs,name,new Date().toISOString());
        library.initializeAsset(id,uploadMetadata);
        store.audit(req.user.id,'voice_asset_uploaded','voice_pack_asset',id,{bytes:req.body.length,format:info.ext});db.exec('COMMIT');
      } catch(failure) {
        db.exec('ROLLBACK');
        // Only this freshly-created, content-addressed file can be rolled back.
        if(!assetRow(id)&&fs.existsSync(file))fs.unlinkSync(file);
        throw failure;
      } finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
      row=assetRow(id);
      res.json({asset:library.adminAsset(row),created:true});
    }catch(failure){next(failure);}
  });
  const serve=(publishedOnly)=>(req,res,next)=>{
    try {
      if(!publishedOnly)requireAdmin(req);
      if(!/^[a-f0-9]{64}$/.test(req.params.id||''))return res.status(404).end();
      const row=assetRow(req.params.id);
      if(!row||(publishedOnly&&!db.prepare('SELECT 1 FROM voice_pack_references r JOIN voice_packs p ON p.id=r.pack_id WHERE r.asset_id=? AND p.enabled=1 LIMIT 1').get(row.id)))return res.status(404).end();
      res.set('Cache-Control',publishedOnly?'public, max-age=31536000, immutable':'no-store');res.set('X-Content-Type-Options','nosniff');res.type(row.mime_type);res.set('Content-Disposition',`inline; filename="${row.id}.${row.ext}"`);
      res.sendFile(path.join(directory,row.id+'.'+row.ext),failure=>{if(failure&&!res.headersSent)next(failure);});
    }catch(failure){next(failure);}
  };
  app.get('/voice-packs/assets/:id',serve(true));
  app.get('/api/admin/voice-packs/assets/:id',serve(false));
  return {configuration,assetDirectory:directory};
}
