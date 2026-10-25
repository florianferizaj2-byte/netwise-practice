import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verificationEnvironment } from './verification-env.mjs';
import { releaseChecks } from './release-checks.mjs';
import { releaseVerificationInputs, assertBuildProvenance } from './release-runtime.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root,'test-output'); fs.mkdirSync(output,{recursive:true});
const reportFile=path.join(output,'release-verification-report.json');
const version=JSON.parse(fs.readFileSync(path.join(root,'mobile/package.json'),'utf8')).version;
const report={version,complete:false,passed:false,startedAt:new Date().toISOString(),inputs:releaseVerificationInputs(root),checks:[]};
const save=()=>{fs.writeFileSync(reportFile+'.new',JSON.stringify(report,null,2)+'\n');fs.renameSync(reportFile+'.new',reportFile);};
const isolated=verificationEnvironment(process.env,{temporaryParent:path.join(root,'tmp')}); save();
try{
 for(const {id,label,args}of releaseChecks){
  console.log('正在检查：'+label);const log=path.join(output,'release-'+id+'.log'),fd=fs.openSync(log,'w');const began=Date.now();let result;
  try{const [program,...rest]=args;const test=program==='--test'||program.startsWith('test/');result=spawnSync(program==='python'?'python':process.execPath,program==='python'?rest:test?['--import','./test/helpers/local-http-only.js',...args]:args,{cwd:root,env:isolated.env,stdio:['ignore',fd,fd],windowsHide:true,timeout:600000});}finally{fs.closeSync(fd);}
  report.checks.push({id,label,exitCode:result.status,durationMs:Date.now()-began,log:'test-output/release-'+id+'.log',...(result.error?{error:result.error.message}:{})});save();
  if(result.status!==0||result.error){const lines=fs.readFileSync(log,'utf8').split(/\r?\n/);console.error(lines.slice(-16).map(line=>line.slice(0,320)).join('\n'));throw result.error||new Error(label+'未通过');}
 }
 if(JSON.stringify(report.inputs)!==JSON.stringify(releaseVerificationInputs(root)))throw new Error('验收期间源码或测试发生变化，必须重新验收');
 report.build=assertBuildProvenance(root);report.native=JSON.parse(fs.readFileSync(path.join(output,'native-release-verification.json'),'utf8'));report.complete=true;report.passed=true;report.finishedAt=new Date().toISOString();save();console.log('完整发行验收通过：'+report.checks.length+' 个关卡；线上部署和手机实机验收未执行。');
}catch(error){report.error=error.message;save();throw error;}finally{isolated.cleanup();}
