// Schema-only local migration: never seed questions, rewrite memberships,
// invent sales revenue, or load API credentials from the application.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DatabaseSync,backup} from 'node:sqlite';
import {createPointsStore} from '../server/ai-points/store.js';

const quote=name=>'"'+name.replaceAll('"','""')+'"';
const value=row=>JSON.stringify(row,(_key,item)=>typeof item==='bigint'?{bigint:String(item)}:item instanceof Uint8Array?{blob:Buffer.from(item).toString('base64')}:item);
export function tableFingerprints(db,names){
  const result={};
  for(const name of names){
    const columns=db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(row=>row.name);
    const sql=db.prepare('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=?').get(name).sql;
    const hash=crypto.createHash('sha256');hash.update(value({sql,columns})+'\n');let count=0;
    for(const row of db.prepare(`SELECT * FROM ${quote(name)} ORDER BY ${columns.map(quote).join(',')}`).iterate()){
      hash.update(value(row)+'\n');count++;
    }
    result[name]={rows:count,sha256:hash.digest('hex')};
  }
  return result;
}
export async function migrateAiPoints({dataDir,backupDir=path.resolve('tmp/ai-points-migration-backups')}){
  if(!dataDir)throw new Error('An existing --data-dir is required');
  const directory=fs.realpathSync(path.resolve(dataDir)),file=path.join(directory,'netwise.sqlite');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('Existing netwise.sqlite required; no database is created or reset');
  const backupDirectory=path.resolve(backupDir);fs.mkdirSync(backupDirectory,{recursive:true});
  const prefix='points-'+Date.now()+'-'+crypto.randomUUID().slice(0,8),backupFile=path.join(backupDirectory,prefix+'.sqlite');
  const source=new DatabaseSync(file,{readOnly:true});
  try{await backup(source,backupFile);}finally{source.close();}
  const checkBackup=new DatabaseSync(backupFile,{readOnly:true});
  try{if(checkBackup.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed; original untouched');}finally{checkBackup.close();}
  const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=10000');let committed=false;
  try{
    db.exec('BEGIN IMMEDIATE');
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'ai_points_*' ORDER BY name").all().map(row=>row.name);
    const before=tableFingerprints(db,names),points=createPointsStore(db),audit=points.audit();
    const after=tableFingerprints(db,names);
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected original tables changed; migration rolled back');
    if(!audit.passed)throw new Error('Point journal verification failed; migration rolled back');
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed');
    const createdTables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ai_points_*' ORDER BY name").all().map(row=>row.name);
    const legacy=db.prepare("SELECT count(*) AS calls,SUM(CASE WHEN json_type(data,'$.estimatedCostCny') IN('integer','real') THEN 0 ELSE 1 END) AS unknownCostCalls FROM user_usage WHERE json_extract(data,'$.pointsCallId') IS NULL").get();
    db.exec('COMMIT');committed=true;
    const result={ok:true,schemaOnly:true,database:file,backup:backupFile,checkedAt:new Date().toISOString(),protectedTableCount:names.length,
      protectedTablesUnchanged:true,originalTables:before,pointsTables:createdTables,legacyCalls:legacy.calls,legacyUnknownCostCalls:legacy.unknownCostCalls||0,finance:audit.finance,auditPassed:audit.passed};
    const reportFile=path.join(backupDirectory,prefix+'.json');fs.writeFileSync(reportFile+'.new',JSON.stringify(result,null,2));fs.renameSync(reportFile+'.new',reportFile);
    return {...result,report:reportFile};
  }catch(error){if(!committed)db.exec('ROLLBACK');throw error;}finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(![2,4].includes(args.length)||args[0]!=='--data-dir'||(args.length===4&&args[2]!=='--backup-dir'))
    throw new Error('Usage: node scripts/migrate-ai-points.mjs --data-dir <existing DATA_DIR> [--backup-dir <backup folder>]');
  const result=await migrateAiPoints({dataDir:args[1],...(args[3]?{backupDir:args[3]}:{})});
  console.log(JSON.stringify({...result,originalTables:undefined},null,2));
}
