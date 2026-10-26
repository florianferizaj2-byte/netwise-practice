import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { digest, questionPayload } from "../server/content-quality/quality.js";

test("deploying a reviewed correction preserves the original identity and history without fingerprint collisions across restarts", () => {
  const parent = path.resolve("tmp");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "console-upgrade-"));
  try {
    const write = (relative, data) => {
      const file = path.join(directory, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        typeof data === "string" ? data : JSON.stringify(data),
      );
    };
    for (const file of [
      "store.js",
      "ai-service-store.js",
      "domain.js",
      "memberships.js",
      "ai-points/store.js",
      "ai-points/check-in-policy.js",
      "ai-points/money.js",
      "ai-points/pricing.js",
      "question-banks/loader.js",
      "question-banks/taxonomy.js",
      "question-banks/scopes.js",
      "content-quality/quality.js",
      "content-quality/contracts.js",
    ]) {
      const target = path.join(directory, "server", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join("server", file), target);
    }
    const old = {
      id: "upgrade-old-fixture",
      type: "single_choice",
      question: "合成纠错升级样本：选择唯一用于测试的正确选项。",
      options: {
        A: "测试正确项",
        B: "测试错误项乙",
        C: "测试错误项丙",
        D: "测试错误项丁",
      },
      answer: ["A"],
      analysis: "原始合成测试解析，验证升级后依旧能保留此题的历史记录。",
      chapter: "测试章节",
      knowledgeSection: "测试分类",
      knowledgePoint: "测试知识点",
      difficulty: "easy",
      tags: ["synthetic-test-only"],
    };
    const manifest = {
      schemaVersion: 1,
      certificate: {
        id: "upgrade-fixture",
        name: "Synthetic upgrade fixture",
        shortName: "Synthetic",
        description: "Isolated test only; never a real exam bank",
      },
      banks: [
        {
          id: "original",
          name: "Synthetic original",
          source: "fixture_original",
          path: "questions/original.json",
        },
      ],
      taxonomy: {
        schemaVersion: 1,
        modules: [
          {
            name: "测试章节",
            order: 1,
            sections: [
              {
                name: "测试分类",
                order: 1,
                knowledgePoints: [
                  {
                    code: "01.01.01",
                    name: "测试知识点",
                    order: 1,
                    scope: "合成测试专用范围",
                    questionCount: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    write("server/question-banks/upgrade-fixture/manifest.json", manifest);
    write("server/question-banks/upgrade-fixture/questions/original.json", [
      old,
    ]);
    const storeURL = pathToFileURL(
        path.join(directory, "server/store.js"),
      ).href,
      dataDir = path.join(directory, "data");
    const run = (script, dir = dataDir) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import {createStore} from ${JSON.stringify(storeURL)};const store=createStore(${JSON.stringify(dir)});try{${script}}finally{store.db.close();}`,
          ],
          { encoding: "utf8", windowsHide: true },
        ),
      );
    run(
      `const u=store.register('synthetic_upgrade_learner','fixture-password-123');store.selectCertificate(u.id,'upgrade-fixture');store.recordAttempt('upgrade-old-fixture',['A'],1000,'practice',u.id);store.setQuestionFavorite(u.id,'upgrade-old-fixture',true);store.saveSession({id:'old-exam',questionIds:['upgrade-old-fixture'],userId:u.id,certificateId:'upgrade-fixture'});console.log('{}');`,
    );
    const replacement = {
      ...old,
      id: "upgrade-new-fixture",
      analysis:
        old.analysis + " 新版增加更清晰的说明，同时保留同一道题的设问和选项。",
      provenance: {
        replacement: {
          questionId: old.id,
          certificateId: "upgrade-fixture",
          digest: digest(questionPayload(old)),
          reason:
            "合成测试中的解析修正：此题作为原题替代版本发布，保留原来的用户学习与考试历史。",
        },
        reviewDigest: "a".repeat(64),
      },
    };
    manifest.banks.push({
      id: "correction",
      name: "Synthetic correction",
      source: "fixture_correction",
      path: "questions/correction.json",
    });
    write("server/question-banks/upgrade-fixture/manifest.json", manifest);
    write("server/question-banks/upgrade-fixture/questions/correction.json", [
      replacement,
    ]);
    const check = `const u=store.allUsers()[0];console.log(JSON.stringify({active:store.allQ().map(q=>q.id),oldExists:!!store.getQ('upgrade-old-fixture'),attempts:store.allA(u.id).length,exam:!!store.session('old-exam'),favorites:store.db.prepare('SELECT COUNT(*) AS n FROM question_favorites').get().n}));`;
    for (let i = 0; i < 2; i++) {
      const result = run(check);
      assert.deepEqual(result.active, ["upgrade-new-fixture"]);
      assert.equal(result.oldExists, true);
      assert.equal(result.attempts, 1);
      assert.equal(result.exam, true);
      assert.equal(result.favorites, 1);
    }
    manifest.banks.reverse();
    write("server/question-banks/upgrade-fixture/manifest.json", manifest);
    assert.deepEqual(run(check).active, ["upgrade-new-fixture"]);
    const fresh = run(
      `console.log(JSON.stringify({active:store.allQ().map(q=>q.id),oldExists:!!store.getQ('upgrade-old-fixture')}));`,
      path.join(directory, "fresh-data"),
    );
    assert.deepEqual(fresh.active, ["upgrade-new-fixture"]);
    assert.equal(fresh.oldExists, true);
  } finally {
    assert.equal(path.dirname(directory), parent);
    assert.ok(path.basename(directory).startsWith("console-upgrade-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
