import assert from 'node:assert/strict';
import test from 'node:test';
import { createInfoHandler } from '../src/guidance/info-handler.js';

function makeMessage({ content = 'info', userId = 'user', parentId = 'forum-1', bot = false, manage = false, threadId = 'thread-1' } = {}) {
  return {
    id: `message-${Math.random()}`,
    content,
    author: { id: userId, bot },
    channelId: threadId,
    channel: { id: threadId, parentId, isThread: () => true },
    manage,
  };
}

function setup() {
  let time = 1_000;
  const sent = [];
  const handler = createInfoHandler({
    forumChannelIds: ['forum-1'],
    now: () => time,
    cooldownMs: 60_000,
    canManageMessages: (message) => message.manage,
  });
  const adapter = { async sendInfo(message, payload) { sent.push({ message, payload }); } };
  return { handler, adapter, sent, advance(ms) { time += ms; } };
}

test('recognises standalone info case-insensitively', async () => {
  const h = setup();
  assert.equal(await h.handler.handle(makeMessage({ content: '  InFo  ' }), h.adapter), true);
  assert.equal(h.sent.length, 1);
});

test('ignores non-standalone info, bots, and other forums', async () => {
  const h = setup();
  assert.equal(await h.handler.handle(makeMessage({ content: 'info please' }), h.adapter), false);
  assert.equal(await h.handler.handle(makeMessage({ bot: true }), h.adapter), false);
  assert.equal(await h.handler.handle(makeMessage({ parentId: 'other' }), h.adapter), false);
  assert.equal(h.sent.length, 0);
});

test('enforces cooldown per user and thread and silently handles repeats', async () => {
  const h = setup();
  const message = makeMessage();
  assert.equal(await h.handler.handle(message, h.adapter), true);
  assert.equal(await h.handler.handle({ ...message, id: 'second' }, h.adapter), true);
  assert.equal(h.sent.length, 1);

  assert.equal(await h.handler.handle(makeMessage({ userId: 'other-user' }), h.adapter), true);
  assert.equal(await h.handler.handle(makeMessage({ threadId: 'thread-2' }), h.adapter), true);
  assert.equal(h.sent.length, 3);

  h.advance(60_000);
  assert.equal(await h.handler.handle({ ...message, id: 'after' }, h.adapter), true);
  assert.equal(h.sent.length, 4);
});

test('Manage Messages bypasses cooldown', async () => {
  const h = setup();
  const message = makeMessage({ manage: true });
  await h.handler.handle(message, h.adapter);
  await h.handler.handle({ ...message, id: 'again' }, h.adapter);
  assert.equal(h.sent.length, 2);
});
