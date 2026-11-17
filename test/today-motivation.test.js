import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = fs.readFileSync(new URL('../mobile/src/todayMotivation.ts', import.meta.url), 'utf8');
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const { pickTodayMotivation, todayMotivationLines, startupMotivation } = await import(moduleUrl);

test('daily panel has a pool of distinct, concise motivational lines', () => {
  assert.ok(todayMotivationLines.length >= 20);
  assert.equal(new Set(todayMotivationLines).size, todayMotivationLines.length);
  assert.ok(todayMotivationLines.every(line => line.trim() === line && [...line].length <= 14));
});

test('random selection can reach every line and the runtime selection stays stable', async () => {
  todayMotivationLines.forEach((line, index) => {
    assert.equal(pickTodayMotivation(() => (index + 0.5) / todayMotivationLines.length), line);
  });
  assert.equal(pickTodayMotivation(() => 0), todayMotivationLines[0]);
  assert.equal(pickTodayMotivation(() => 1 - Number.EPSILON), todayMotivationLines.at(-1));
  assert.ok(todayMotivationLines.includes(startupMotivation));
  assert.equal((await import(moduleUrl)).startupMotivation, startupMotivation);
});
