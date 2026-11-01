import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

test("content withdrawal survives upgrades and cached clients without deleting learning history", () => {
  const parent = path.resolve("tmp");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "question-withdrawal-"));
  const write = (relative, value) => {
    const file = path.join(directory, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  try {
    for (const file of ["store.js", "ai-service-store.js", "domain.js", "memberships.js", "ai-points/store.js", "ai-points/money.js", "ai-points/pricing.js", "question-banks/loader.js", "question-banks/taxonomy.js", "question-banks/scopes.js", "content-quality/quality.js", "content-quality/contracts.js"]) {
      const destination = path.join(directory, "server", file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join("server", file), destination);
    }
    const question = (id, text) => ({
      id, type: "single_choice", question: text,
      options: { A: "合成测试正确项", B: "合成测试错误项乙", C: "合成测试错误项丙", D: "合成测试错误项丁" },
      answer: ["A"], analysis: "合成数据仅用于验证升级和历史记录保留，不属于正式题库。",
      chapter: "基础科目", knowledgePoint: "基础综合题", difficulty: "easy", tags: ["synthetic-test-only"],
    });
    const old = question("withdrawal-test-old", "合成测试病例材料缺失时需要被下架的题目。"),
      repaired = question("withdrawal-test-repaired", "合成测试子题：选择本例的正确选项。"),
      good = question("withdrawal-test-good", "合成测试独立题：选择无需病例材料的正确选项。");
    const manifest = {
      schemaVersion: 1,
      certificate: { id: "veterinary-practitioner", name: "合成兽医升级样本", shortName: "合成测试", description: "仅用于隔离升级测试" },
      banks: [{ id: "test-bank", name: "合成测试", source: "synthetic_test", path: "questions.json" }],
    };
    const bank = "server/question-banks/veterinary-practitioner/";
    write(bank + "manifest.json", manifest);
    write(bank + "questions.json", [old, repaired, good]);
    const storeUrl = pathToFileURL(path.join(directory, "server/store.js")).href;
    const appUrl = pathToFileURL(path.resolve("server/index.js")).href;
    const providerUrl = pathToFileURL(path.resolve("server/ai.js")).href;
    const dataDirectory = path.join(directory, "data");
    const run = (body) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `import {createStore} from ${JSON.stringify(storeUrl)}; const store=createStore(${JSON.stringify(dataDirectory)});try{${body}}finally{store.db.close();}`], { encoding: "utf8", windowsHide: true }));
    run(`const u=store.register('withdrawal_fixture','fixture-password-123');store.selectCertificate(u.id,'veterinary-practitioner');store.recordAttempt('withdrawal-test-old',['B'],1000,'practice',u.id);store.setQuestionFavorite(u.id,'withdrawal-test-old',true);store.db.prepare('INSERT INTO queue (question_id,topic,completed,user_id) VALUES (?,?,0,?)').run('withdrawal-test-old','fixture',u.id);for(const submitted of [false,true])store.saveSession({id:submitted?'history':'pending',certificateId:'veterinary-practitioner',userId:u.id,questionIds:['withdrawal-test-old'],answers:{},submitted,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});console.log('{}');`);
    manifest.questionWithdrawalsPath = "withdrawals.json";
    write(bank + "manifest.json", manifest);
    write(bank + "withdrawals.json", { schemaVersion: 1, certificateId: "veterinary-practitioner", reviewedAt: "2026-10-21", questions: [{ questionId: old.id, reason: "合成测试：病例材料无法核实，原题仅保留为学习历史。" }] });
    const stem = "合成病例材料：完整给出本例所有判断条件，且保留原题号。";
    write(bank + "questions.json", [{ ...repaired, question: stem + repaired.question, sharedStem: stem, sharedGroupId: "withdrawal-test-case", sharedKind: "stem", sharedOrder: 1 }, good]);
    const inspect = `const u=store.allUsers()[0];console.log(JSON.stringify({active:store.allQ().map(q=>q.id),hidden:store.isQuestionHidden('withdrawal-test-old'),old:!!store.getQ('withdrawal-test-old'),attempts:store.allA(u.id).length,favorites:store.db.prepare('SELECT COUNT(*) AS n FROM question_favorites').get().n,session:!!store.session('pending'),repaired:store.getQ('withdrawal-test-repaired').question,withdrawals:store.questionVisibility().length}));`;
    for (let i = 0; i < 2; i++) {
      const result = run(inspect);
      assert.deepEqual(result.active, [repaired.id, good.id]);
      assert.equal(result.hidden, true);
      assert.equal(result.old, true);
      assert.equal(result.attempts, 1);
      assert.equal(result.favorites, 1);
      assert.equal(result.session, true);
      assert.ok(result.repaired.startsWith(stem));
      assert.equal(result.withdrawals, 1);
    }
    const api = run(`
      const {createApp}=await import(${JSON.stringify(appUrl)});
      const {OpenAICompatibleProvider}=await import(${JSON.stringify(providerUrl)});
      const u=store.allUsers()[0],token=store.createAuthSession(u.id);
      const {createHash}=await import('node:crypto');
      const requestId='4473861e-82bb-4f13-9a20-41c483e1995e';
      const hash=createHash('sha256').update(JSON.stringify([u.id,'veterinary-practitioner',requestId])).digest('hex');
      const replayId=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
      store.saveSession({...store.session('pending'),id:replayId,creationFingerprint:createHash('sha256').update(JSON.stringify({count:20})).digest('hex')});
      const app=await createApp({store,production:true,withFrontend:false,accountSecurity:{enabled:false},provider:new OpenAICompatibleProvider(store,{fetch:()=>{throw new Error('No external AI in withdrawal test')}})});
      const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
      try {
        const req=async(url,method='GET',body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
        const hidden=await req('/questions/withdrawal-test-old');
        const reveal=await req('/questions/withdrawal-test-old/reveal','POST',{});
        const attempt=await req('/attempts','POST',{questionId:'withdrawal-test-old',selected:['A'],timeMs:1000});
        const pending=await req('/exams/pending');
        const replay=await req('/exams','POST',{requestId});
        const history=await req('/exams/history');
        const list=await req('/questions');
        const wrong=await req('/wrong'),favorites=await req('/favorites'),queue=await req('/queue');
        let unhideBlocked=false;try{store.setQuestionVisibility('withdrawal-test-old',false,'',u.id);}catch(e){unhideBlocked=e.status===409;}
        console.log(JSON.stringify({hidden:hidden.status,reveal:reveal.status,attempt:attempt.status,pending:pending.status,pendingCode:pending.body.code,replay:replay.status,replayCode:replay.body.code,history:history.status,list:list.body.map(q=>q.id),wrong:wrong.body,favorites:favorites.body,queue:queue.body,unhideBlocked,attempts:store.allA(u.id).length}));
      }finally{await app.locals.stop();server.closeAllConnections();await new Promise(r=>server.close(r));}
    `);
    assert.equal(api.hidden, 404);
    assert.equal(api.reveal, 404);
    assert.equal(api.attempt, 404);
    assert.equal(api.pending, 409);
    assert.equal(api.pendingCode, "EXAM_QUESTION_WITHDRAWN");
    assert.equal(api.replay, 409);
    assert.equal(api.replayCode, "EXAM_QUESTION_WITHDRAWN");
    assert.equal(api.history, 200);
    assert.deepEqual(api.list, [repaired.id, good.id]);
    assert.deepEqual(api.wrong, []);
    assert.deepEqual(api.favorites, []);
    assert.deepEqual(api.queue, []);
    assert.equal(api.unhideBlocked, true);
    assert.equal(api.attempts, 1);
  } finally {
    assert.equal(path.dirname(directory), parent);
    assert.ok(path.basename(directory).startsWith("question-withdrawal-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
