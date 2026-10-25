import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkDeployment} from '../scripts/check-v1-deployment.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../server/mobile-release.json',import.meta.url),'utf8'));
function fixture({latest=policy.latestVersion,backend=policy.latestVersion,count=10}={}){
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const route=new URL(url).pathname;calls.push({route,method:options.method||'GET'});
    if(route==='/api/mobile/version')return Response.json({...policy,latestVersion:latest,forceUpdate:false,backend:{version:backend,apiRevision:1,capabilities:['points-v1','account-security-v1','learning-gate-v1']}});
    if(route.startsWith('/downloads/'))return new Response(new Uint8Array([0x50,0x4b,3,4,0,0,0,0]),{status:206,headers:{'content-range':`bytes 0-7/${policy.apkBytes}`}});
    const bodies={
      '/api/account/points/wallet':{wallet:{availableUnits:0,scale:1000}},
      '/api/account/points/services':{billingMode:'actual-usage',models:[],available:false},
      '/api/account/points/operations':{rows:[],calls:[]},
      '/api/account/entitlements':{billingMode:'points',points:{},aiServiceAvailable:false},
      '/api/auth/security':{},'/api/practice/catalog':{total:0},'/api/exams/catalog':{},
      '/api/location-learning':{policy:{count}},
    };
    assert(route in bodies,route);return Response.json(bodies[route]);
  };
  return {calls,options:{baseUrl:'http://127.0.0.1',sessionToken:'SYNTHETIC-UNIT-TOKEN',fetchImpl}};
}
test('deployment check verifies the real release version and ten-question policy using GET requests only',async()=>{
  const f=fixture(),result=await checkDeployment(f.options);
  assert.equal(result.authenticatedChecks,8);assert.equal(result.learningQuestionCount,10);
  assert.equal(result.mutationRequests,0);assert(f.calls.every(call=>call.method==='GET'));
  assert.equal(result.wholeApkHashChecked,false,'synthetic header fixture is not a real APK hash proof');
});
test('deployment check rejects stale public metadata, stale backend processes and the old thirty-question policy',async()=>{
  await assert.rejects(checkDeployment(fixture({latest:'1.0.0'}).options),/线上安装包版本/);
  await assert.rejects(checkDeployment(fixture({backend:'1.0.0'}).options),/后端进程尚未/);
  await assert.rejects(checkDeployment(fixture({count:30}).options),/location-learning/);
});
