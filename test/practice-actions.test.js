import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync('mobile/src/screens/TabScreens.android.tsx','utf8');
const tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=new Map();
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(tree));ts.forEachChild(n,visit)}visit(tree);
function fixture(overrides={}){
  const observed={deletes:[],questions:null,index:null,total:null,result:'kept',errors:[],finished:false,history:new Map(),selected:null};
  const questions=[{id:'one'},{id:'two'},{id:'three'}];
  const context={Error,questions,currentQuestion:questions[1],questionIndex:1,practiceSource:'wrong',result:{correct:true},wrongDeleteBusy:false,recordSyncPending:false,preview:false,
    wrongDeleteLock:{current:false},questionTask:()=>()=>true, mobileApi:{async removeWrong(id){observed.deletes.push(id)}},
    setWrongDeleteBusy(){},setError:e=>observed.errors.push(e),practiceReviewHistory:()=>observed.history,setReportNotice(){},
    setTotalQuestions:n=>observed.total=n,setQuestions:q=>observed.questions=q,setFinished:x=>observed.finished=x,
    setQuestionIndex:fn=>observed.index=typeof fn==='function'?fn(context.questionIndex):fn,setSelected:x=>observed.selected=x,setResponseDraft(){},setResult:x=>observed.result=x,
    ...overrides};
  const compiled=ts.transpileModule(functions.get('removeCurrentWrong'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const run=vm.runInNewContext(compiled+';removeCurrentWrong',context);
  return {context,observed,run};
}
test('wrong answer is retained until the user explicitly deletes a correct retry, then advances exactly once',async()=>{
  const f=fixture();await f.run();assert.deepEqual(f.observed.deletes,['two']);
  assert.deepEqual(f.observed.questions.map(q=>q.id),['one','three']);assert.equal(f.observed.index,1);
  assert.equal(f.observed.total,2);assert.equal(f.observed.result,null);assert.equal(f.context.wrongDeleteLock.current,false);
});
test('ungraded, incorrect, pending-sync and non-wrong practice cannot delete history',async()=>{
  for(const overrides of [{result:null},{result:{correct:false}},{recordSyncPending:true},{practiceSource:'all'}]){const f=fixture(overrides);await f.run();assert.equal(f.observed.deletes.length,0);assert.equal(f.observed.questions,null)}
});
test('failed removal keeps the current question and double-tap sends only one deletion',async()=>{
  const failed=fixture({mobileApi:{async removeWrong(){throw Error('offline')}}});await failed.run();assert.equal(failed.observed.questions,null);assert.equal(failed.observed.errors.at(-1),'offline');assert.equal(failed.context.wrongDeleteLock.current,false);
  let release,calls=0;const f=fixture({mobileApi:{async removeWrong(){calls++;await new Promise(r=>release=r)}}});const a=f.run(),b=f.run();assert.equal(calls,1);release();await Promise.all([a,b]);
});
test('deleting the final position finishes instead of unexpectedly returning to an earlier wrong question',async()=>{
  const f=fixture({questionIndex:2,currentQuestion:{id:'three'}});await f.run();assert.equal(f.observed.finished,true);assert.equal(f.observed.index,null);
});
const swipeCode=ts.transpileModule(fs.readFileSync('mobile/src/practiceSwipe.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const swipe={exports:{}};vm.runInNewContext(swipeCode,swipe);
test('right swipe respects threshold, vertical scrolling and Android edge-back gestures',()=>{
  const {claimPracticeSwipe:claim,completePracticeSwipe:complete}=swipe.exports;
  assert.equal(claim({dx:30,dy:4,x0:60}),true);assert.equal(complete({dx:90,dy:4,x0:60}),true);
  for(const gesture of [{dx:60,dy:0,x0:60},{dx:100,dy:90,x0:60},{dx:120,dy:0,x0:5},{dx:-120,dy:0,x0:160}])assert.equal(complete(gesture),false);
});
test('only ordinary practice owns swipe and quick voice settings; location exam cannot skip',()=>{
  assert.match(source,/swipeResponder.panHandlers/);assert.match(source,/accessibilityLabel="刷题语音包设置"/);
  assert.match(source,/practiceVoiceSettingsOpen && <Modal/);assert.match(source,/answerInputFocused.current/);
  assert.match(source,/onStartShouldSetPanResponderCapture: event =>/);
  assert.match(source,/x0:swipeOrigin.current/);
  assert.match(source,/onPanResponderTerminationRequest: \(\) => false/);
  assert.doesNotMatch(functions.get('skipPracticeQuestion'),/mobileApi\.|practiceAttemptSync\.enqueue/);
  for(const name of ['LocationLearningGate','ExamScreen'])assert.doesNotMatch(fs.readFileSync('mobile/src/screens/'+name+'.android.tsx','utf8'),/swipeResponder|skipPracticeQuestion|practice-swipe-area/);
});
