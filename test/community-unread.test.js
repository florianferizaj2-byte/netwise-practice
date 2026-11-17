import assert from 'node:assert/strict';
import test from 'node:test';
import {
  communityUnreadLabel, countCommunityUnread, parseCommunityReadCursor,
} from '../mobile/src/api/communityUnread.ts';

const createdAt = '2026-11-17T01:00:00.000Z';
const row = (id, userId = 'peer') => ({ id, userId, createdAt, text: '', authorName: userId });

function feed(messages) {
  const requests = [];
  return {
    requests,
    async load(before, limit) {
      requests.push(before);
      const available = before ? messages.filter((message) => `${message.createdAt}|${message.id}` < before) : messages;
      const page = available.slice(-limit);
      return { messages: page, hasMore: available.length > limit, nextBefore: page.length ? `${page[0].createdAt}|${page[0].id}` : null };
    },
  };
}

test('counts only newer messages by others, even when the read message was deleted', async () => {
  const room = feed([row('a'), row('c', 'me'), row('d'), row('e')]);
  assert.equal(await countCommunityUnread(row('b'), 'me', room.load, new AbortController().signal), 2);
  assert.equal(await countCommunityUnread(row('e'), 'me', room.load, new AbortController().signal), 0);
});

test('paginates through up to 99 unread messages and caps a larger backlog at 99+', async () => {
  const rows = Array.from({ length: 138 }, (_, index) => row(String(index).padStart(3, '0'), index % 10 === 0 ? 'me' : 'peer'));
  const room = feed(rows);
  const signal = new AbortController().signal;
  const exact = await countCommunityUnread(row('030'), 'me', room.load, signal);
  assert.equal(exact, 97);
  assert.equal(room.requests.length, 3);
  assert.equal(communityUnreadLabel(exact), '97');
  assert.equal(communityUnreadLabel(99), '99');
  assert.equal(communityUnreadLabel(await countCommunityUnread(null, 'me', room.load, signal)), '99+');
  assert.equal(communityUnreadLabel(0), '');
});

test('distinguishes first launch from a room previously seen while empty', () => {
  assert.equal(parseCommunityReadCursor(null), undefined);
  assert.equal(parseCommunityReadCursor('{bad data'), undefined);
  assert.equal(parseCommunityReadCursor('null'), null);
  assert.deepEqual(parseCommunityReadCursor(JSON.stringify(row('a'))), { id: 'a', createdAt });
});

test('a cancelled or non-advancing fetch does not publish a partial count', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(countCommunityUnread(null, 'me', () => assert.fail('aborted'), controller.signal), /aborted/);
  await assert.rejects(countCommunityUnread(null, 'me', async () => ({ messages: [], hasMore: true, nextBefore: 'same' }), new AbortController().signal), /Invalid/);
});
