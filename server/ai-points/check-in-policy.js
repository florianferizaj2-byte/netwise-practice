import crypto from 'node:crypto';
import {z} from 'zod';
import {pointsError} from './money.js';

export const checkInPlans=Object.freeze(['free','vip','svip','ssvip']);
export const defaultDailyPoints=Object.freeze({free:1,vip:33,svip:66,ssvip:133});
const amount=z.number().int().min(1).max(100000);
export const checkInPolicyUpdateSchema=z.object({
  requestId:z.string().uuid(),revision:z.number().int().min(0),
  enabled:z.boolean(),requireFunded:z.boolean(),
  dailyPoints:z.object({free:amount,vip:amount,svip:amount,ssvip:amount}).strict(),
  reason:z.string().trim().min(8).max(500),
}).strict().refine(({dailyPoints:p})=>p.free<=p.vip&&p.vip<=p.svip&&p.svip<=p.ssvip,
  {message:'签到积分应随会员等级不递减',path:['dailyPoints']});

export function initializeCheckInSchema(db,now=Date.now) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_points_check_in_policy (
      id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),
      free_points INTEGER NOT NULL CHECK(free_points BETWEEN 1 AND 100000),
      vip_points INTEGER NOT NULL CHECK(vip_points BETWEEN 1 AND 100000),
      svip_points INTEGER NOT NULL CHECK(svip_points BETWEEN 1 AND 100000),
      ssvip_points INTEGER NOT NULL CHECK(ssvip_points BETWEEN 1 AND 100000),
      require_funded INTEGER NOT NULL CHECK(require_funded IN(0,1)),
      updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_points_check_ins (
      user_id TEXT NOT NULL,day TEXT NOT NULL,plan TEXT NOT NULL,
      policy_revision INTEGER NOT NULL,units INTEGER NOT NULL CHECK(units>0),
      grant_id TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,day));
    CREATE TABLE IF NOT EXISTS ai_points_check_in_policy_changes (
      request_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,signature TEXT NOT NULL,
      applied_revision INTEGER NOT NULL,created_at TEXT NOT NULL);
  `);
  db.prepare('INSERT OR IGNORE INTO ai_points_check_in_policy VALUES(1,0,1,1,33,66,133,0,?,?)')
    .run('system',new Date(now()).toISOString());
}
export function readCheckInPolicy(store) {
  const row=store.db.prepare('SELECT * FROM ai_points_check_in_policy WHERE id=1').get();
  if(!row)throw pointsError('签到配置尚未初始化','AI_POINTS_CHECK_IN_POLICY_MISSING',503);
  return {revision:row.revision,enabled:!!row.enabled,requireFunded:!!row.require_funded,
    dailyPoints:{free:row.free_points,vip:row.vip_points,svip:row.svip_points,ssvip:row.ssvip_points},
    timeZone:'Asia/Shanghai',validity:'day',membershipDistribution:'daily-check-in',
    updatedBy:row.updated_by,updatedAt:row.updated_at};
}
export function publicCheckInPolicy(policy) {
  const {updatedBy,updatedAt,...visible}=policy;return visible;
}
export function updateCheckInPolicy(store,input,actor) {
  const body=checkInPolicyUpdateSchema.parse(input);
  const signature=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return store.points.transaction(()=>{
    const old=store.db.prepare('SELECT * FROM ai_points_check_in_policy_changes WHERE request_id=?').get(body.requestId);
    if(old){
      if(old.actor_id!==actor||old.signature!==signature)
        throw pointsError('配置请求编号已用于其他修改','AI_POINTS_IDEMPOTENCY_CONFLICT',409);
      return {policy:readCheckInPolicy(store),appliedRevision:old.applied_revision,replayed:true};
    }
    const current=readCheckInPolicy(store);
    if(current.revision!==body.revision)
      throw pointsError('签到配置已被更新，请刷新后再保存','AI_POINTS_CHECK_IN_POLICY_CONFLICT',409);
    const stamp=new Date(store.points.now()).toISOString(),p=body.dailyPoints,next=body.revision+1;
    store.db.prepare('UPDATE ai_points_check_in_policy SET revision=?,enabled=?,free_points=?,vip_points=?,svip_points=?,ssvip_points=?,require_funded=?,updated_by=?,updated_at=? WHERE id=1')
      .run(next,Number(body.enabled),p.free,p.vip,p.svip,p.ssvip,Number(body.requireFunded),actor,stamp);
    store.db.prepare('INSERT INTO ai_points_check_in_policy_changes VALUES(?,?,?,?,?)')
      .run(body.requestId,actor,signature,next,stamp);
    return {policy:readCheckInPolicy(store),appliedRevision:next,replayed:false};
  });
}
