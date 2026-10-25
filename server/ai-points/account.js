import { POINT_SCALE, integer, safeNumber } from './money.js';

export const pointsPlans=Object.freeze({
  vip:{name:'VIP',priceCents:990,monthlyPoints:990},
  svip:{name:'SVIP',priceCents:1990,monthlyPoints:1990},
  ssvip:{name:'SSVIP',priceCents:3990,monthlyPoints:3990},
});
export const dailyGiftPoints=5;
const PERIOD_MS=30*86400000;
export function ensureAccountPoints(store,userId,entitlement=store.accountEntitlement(userId)) {
  const plan=pointsPlans[entitlement.plan],period=entitlement.generation;
  let pendingUnits=0;
  if(plan&&period?.periodStart&&period?.periodEnd){
    const duration=Math.min(PERIOD_MS,Math.max(0,Date.parse(period.periodEnd)-Date.parse(period.periodStart)));
    const originalLimit=integer(period.limit,'原会员额度',{min:1});
    const originalRemaining=integer(period.remaining,'原会员剩余额度',{max:originalLimit});
    const units=safeNumber(BigInt(plan.monthlyPoints)*BigInt(POINT_SCALE)*BigInt(duration)*BigInt(originalRemaining)/BigInt(PERIOD_MS)/BigInt(originalLimit));
    try {
      store.points.ensurePeriodicGrant({userId,sourceKey:`membership:${entitlement.plan}:${period.periodStart}`,targetUnits:units,expiresAt:period.periodEnd});
    } catch(error) {
      if(error.code!=='AI_POINTS_GRANT_FUNDING_REQUIRED')throw error;
      pendingUnits=error.pendingUnits??units;
    }
  }
  return {...store.points.wallet(userId),pendingUnits,monthlyPoints:plan?.monthlyPoints||0,periodStart:period?.periodStart||null,periodEnd:period?.periodEnd||null};
}
export function pointsCheckInView(store,userId,day) {
  const row=store.db.prepare('SELECT id FROM ai_points_grants WHERE user_id=? AND source_key=?').get(userId,`check-in:${day}`);
  return {day,claimed:!!row,grants:{points:dailyGiftPoints,explanations:0,generations:0,analyses:0},remaining:{explanations:0,generations:0,analyses:0}};
}
export function claimPointsCheckIn(store,userId,day) {
  const expiresAt=new Date(`${day}T23:59:59.999+08:00`).toISOString();
  const result=store.points.grant({userId,sourceKey:`check-in:${day}`,units:dailyGiftPoints*POINT_SCALE,kind:'daily-gift',expiresAt,requireFunded:true});
  return {...pointsCheckInView(store,userId,day),claimed:result.created};
}
