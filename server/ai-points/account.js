import {POINT_SCALE,pointsError} from './money.js';
import {checkInPlans,readCheckInPolicy,publicCheckInPolicy} from './check-in-policy.js';

export const pointsPlans=Object.freeze({
  vip:{name:'VIP',priceCents:990,monthlyPoints:990},
  svip:{name:'SVIP',priceCents:1990,monthlyPoints:1990},
  ssvip:{name:'SSVIP',priceCents:3990,monthlyPoints:3990},
});
const entitlementFor=(store,userId)=>store.accountEntitlement?.(userId)||{plan:'free'};
const planFor=entitlement=>checkInPlans.includes(entitlement?.plan)?entitlement.plan:'free';
const nowFor=store=>store.points.now();
function prepaidUntil(store,userId,plan) {
  if(plan==='free')return null;
  // Keep every already-issued monthly balance and its original expiry. Do not
  // pay the same prepaid period again after switching to daily distribution.
  return store.db.prepare("SELECT expires_at FROM ai_points_grants WHERE user_id=? AND kind='membership' AND source_key LIKE 'membership:%' AND expires_at>? ORDER BY expires_at DESC LIMIT 1")
    .get(userId,new Date(nowFor(store)).toISOString())?.expires_at||null;
}
export function accountPointsPlans(store) {
  const policy=readCheckInPolicy(store);
  return Object.fromEntries(Object.entries(pointsPlans).map(([id,plan])=>[id,{
    ...plan,dailyPoints:policy.dailyPoints[id],membershipDistribution:'daily-check-in',
  }]));
}
export function ensureAccountPoints(store,userId,entitlement=entitlementFor(store,userId)) {
  const plan=planFor(entitlement),period=entitlement.generation,policy=readCheckInPolicy(store);
  // The compatibility monthlyPoints field is informational, never a new grant.
  // Existing grants/holds/spent points remain completely untouched.
  return {...store.points.wallet(userId),pendingUnits:0,monthlyPoints:pointsPlans[plan]?.monthlyPoints||0,
    dailyCheckInPoints:policy.dailyPoints[plan],membershipDistribution:'daily-check-in',
    legacyPrepaidUntil:prepaidUntil(store,userId,plan),
    periodStart:period?.periodStart||null,periodEnd:period?.periodEnd||null};
}
function dayExpiry(day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw pointsError('签到日期无效','AI_POINTS_INVALID_DAY',400);
  const value=new Date(day+'T23:59:59.999+08:00');
  if(!Number.isFinite(value.getTime())||new Date(value.getTime()+8*3600000).toISOString().slice(0,10)!==day)throw pointsError('签到日期无效','AI_POINTS_INVALID_DAY',400);
  return value.toISOString();
}
export function pointsCheckInView(store,userId,day) {
  const expiry=dayExpiry(day),policy=readCheckInPolicy(store),plan=planFor(entitlementFor(store,userId));
  const claim=store.db.prepare('SELECT * FROM ai_points_check_ins WHERE user_id=? AND day=?').get(userId,day);
  const grant=store.db.prepare('SELECT * FROM ai_points_grants WHERE user_id=? AND source_key=?').get(userId,'check-in:'+day);
  const claimed=!!grant,legacy=prepaidUntil(store,userId,plan);
  const canClaim=!claimed&&policy.enabled&&!legacy;
  const disabledReason=claimed?null:!policy.enabled?'每日签到暂时关闭':legacy?
    '本期会员积分已整笔发放，原余额继续有效；到期后改为每日签到领取。':null;
  return {day,claimed,plan,rewardPlan:claim?.plan||null,canClaim,disabledReason,
    legacyPrepaidUntil:legacy,dailyStartsAt:legacy,
    configuredPoints:policy.dailyPoints[plan],policy:publicCheckInPolicy(policy),
    policyRevision:claim?.policy_revision??null,claimedAt:claim?.created_at||grant?.created_at||null,
    expiresAt:claim?.expires_at||grant?.expires_at||expiry,
    grants:{points:grant?grant.units/POINT_SCALE:legacy?0:policy.dailyPoints[plan],explanations:0,generations:0,analyses:0},
    remaining:{explanations:0,generations:0,analyses:0}};
}
export function claimPointsCheckIn(store,userId,day) {
  return store.points.transaction(()=>{
    const view=pointsCheckInView(store,userId,day);
    if(view.claimed)return {...view,claimed:false};
    if(!view.canClaim)throw pointsError(view.disabledReason,
      view.legacyPrepaidUntil?'AI_POINTS_MEMBERSHIP_PREPAID':'AI_POINTS_CHECK_IN_DISABLED',409);
    const units=view.grants.points*POINT_SCALE;
    const result=store.points.grant({userId,sourceKey:'check-in:'+day,units,
      kind:'daily-gift',expiresAt:view.expiresAt,requireFunded:view.policy.requireFunded});
    store.db.prepare('INSERT INTO ai_points_check_ins VALUES(?,?,?,?,?,?,?,?)')
      .run(userId,day,view.plan,view.policy.revision,units,result.id,view.expiresAt,new Date(nowFor(store)).toISOString());
    return {...pointsCheckInView(store,userId,day),claimed:result.created};
  });
}
