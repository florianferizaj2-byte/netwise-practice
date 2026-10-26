import test from 'node:test';
import assert from 'node:assert/strict';
import { certificates } from '../server/certificates.js';

test('Web release retains every already-published certificate including C and both HCIP directions', () => {
  const required = ['hcia-datacom', 'hcip-datacom-core', 'hcip-datacom-advanced',
    'ncre-l2-c-programming', 'ncre-ms-office', 'network-engineer',
    'sichuan-upgrading-computer', 'veterinary-practitioner'];
  const ids = certificates.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of required) assert(ids.includes(id), `Published certificate missing: ${id}`);
});
