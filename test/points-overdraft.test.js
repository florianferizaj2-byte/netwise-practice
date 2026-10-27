import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPointsStore} from '../server/ai-points/store.js';
import {displayPoints} from '../server/ai-points/money.js';
const fixed=Date.parse('2026-10-27T03:00:00Z'),settings={baseUrl:'https://api.deepseek.com',model:'deepseek-flash'};
function fixture(t){const db=new DatabaseSync(':memory:');let now=fixed;const points=createPointsStore(db,{now:()=>now});t.after(()=>db.close());return {db,points,advance:ms=>now+=ms};}
const begin=(p,key='a',userId='alice')=>p.begin({userId,requestKey:key,signature:'fixture',feature:'explanation'}).operation;
const reserve=(p,op,extra={})=>p.reserveCall(op.id,{settings,inputLimit:2000,outputLimit:1000,taskType:'explanation',...extra});
const finishCall=(p,call)=>p.finishCall(call.id,{success:true,usage:{hasUsage:true,prompt_tokens:1000,completion_tokens:500,total_tokens:1500,cached_prompt_tokens:0}});
function borrow(p){p.grant({userId:'alice',sourceKey:'daily-1',units:1000});const op=begin(p),call=reserve(p,op);finishCall(p,call);p.finish(op.id,{success:true,result:{text:'measured'}});return op;}
test('one sign-in point admits a bounded AI call, settles exact usage into debt, and blocks the next paid call',t=>{
 const {db,points:p}=fixture(t);const op=borrow(p);assert.equal(p.operation(op.id).charged_units,2400);assert.equal(p.wallet('alice').availableUnits,-1400);assert.equal(p.wallet('alice').debtUnits,1400);assert.equal(p.wallet('alice').heldUnits,0);assert.equal(displayPoints(-1400),-1.4);
 assert.throws(()=>reserve(p,begin(p,'next')),{code:'AI_POINTS_INSUFFICIENT'});assert.equal(db.prepare('SELECT count(*) n FROM ai_points_calls').get().n,1);assert.equal(p.audit().passed,true);
});
test('new credits repay debt first, do not expire back into debt, and require a positive balance before new AI',t=>{
 const {points:p,advance}=fixture(t);borrow(p);p.grant({userId:'alice',sourceKey:'daily-2',units:1000,expiresAt:new Date(fixed+1000).toISOString()});assert.equal(p.wallet('alice').availableUnits,-400);assert.equal(p.wallet('alice').debtUnits,400);
 advance(2000);assert.equal(p.wallet('alice').availableUnits,-400);p.grant({userId:'alice',sourceKey:'top-up-to-zero',units:400});assert.equal(p.wallet('alice').availableUnits,0);assert.throws(()=>reserve(p,begin(p,'zero')),{code:'AI_POINTS_INSUFFICIENT'});
 p.grant({userId:'alice',sourceKey:'positive',units:1000});assert.equal(p.wallet('alice').availableUnits,1000);assert.ok(reserve(p,begin(p,'positive')).id);assert.equal(p.audit().passed,true);
});
test('multi-call work remains one admitted operation and only its actual aggregate usage becomes debt',t=>{
 const {points:p}=fixture(t);p.grant({userId:'alice',sourceKey:'one',units:1000});const op=begin(p),a=reserve(p,op),b=reserve(p,op);finishCall(p,a);finishCall(p,b);p.finish(op.id,{success:true});assert.equal(p.operation(op.id).charged_units,4800);assert.equal(p.wallet('alice').availableUnits,-3800);assert.equal(p.audit().passed,true);
});
test('a failed/unknown/interrupted call refunds funded holds and never creates debt',t=>{
 for(const mode of ['failure','unknown','interrupted']){const {points:p,advance}=fixture(t);p.grant({userId:'alice',sourceKey:'one',units:1000});const op=begin(p),c=reserve(p,op);if(mode==='failure')finishCall(p,c);if(mode==='unknown')p.finishCall(c.id,{success:true,usage:{hasUsage:false}});if(mode==='interrupted'){advance(300001);assert.equal(p.recoverExpired(),1);}else p.finish(op.id,{success:mode==='unknown'});assert.equal(p.wallet('alice').availableUnits,1000);assert.equal(p.wallet('alice').debtUnits,0);assert.equal(p.audit().passed,true);}
});
test('overdraft cannot be multiplied using a second operation, including after mid-flight credits',t=>{
 const {points:p}=fixture(t);p.grant({userId:'alice',sourceKey:'one',units:1000});reserve(p,begin(p));assert.throws(()=>reserve(p,begin(p,'parallel')),{code:'AI_POINTS_INSUFFICIENT'});p.grant({userId:'alice',sourceKey:'during-call',units:1000});assert.throws(()=>reserve(p,begin(p,'parallel-with-credit')),{code:'AI_POINTS_REQUEST_IN_PROGRESS'});assert.equal(p.audit().passed,true);
});
test('debt and replay survive restart; a cached/free result remains available at negative balance',t=>{
 const {db,points:p}=fixture(t);const op=borrow(p),restarted=createPointsStore(db,{now:()=>fixed});assert.equal(restarted.wallet('alice').availableUnits,-1400);assert.equal(restarted.begin({userId:'alice',requestKey:'a',signature:'fixture',feature:'explanation'}).created,false);assert.equal(restarted.finish(op.id,{success:false}).charged_units,2400);
 const free=begin(restarted,'cached');restarted.finish(free.id,{success:true,result:{text:'cache'}});assert.equal(restarted.operation(free.id).charged_units,0);assert.equal(restarted.wallet('alice').availableUnits,-1400);assert.equal(restarted.wallet('bob').availableUnits,0);assert.equal(restarted.audit().passed,true);
});
