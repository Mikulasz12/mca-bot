import assert from 'node:assert/strict';
import test from 'node:test';

import { createGuidanceCoordinator } from '../src/guidance/coordinator.js';

function snapshot(messages) {
  return {
    threadId: 'thread-1',
    ownerId: 'owner',
    starterId: 'starter',
    archived: false,
    locked: false,
    detectorInput: {
      tags: [],
      title: '',
      messages: messages.map((content, index) => ({
        position: index === 0 ? 'starter' : `reply-${index}`,
        authorKind: 'thread-owner',
        content,
        attachments: [],
      })),
    },
  };
}

function harness(sequence) {
  const queue = [...sequence];
  const edits = [];
  const responses = [];
  const reminders = [];
  const deleted = [];
  const timers = [];
  let id = 1;
  const coordinator = createGuidanceCoordinator({
    reader: { async read() { return queue.length > 1 ? queue.shift() : queue[0]; } },
    adapter: {
      async sendMain() { return { id: `main-${id++}` }; },
      async sendResponse(_thread, _snapshot, payload) { responses.push(payload); return { id: `response-${id++}` }; },
      async sendReminder(_thread, _snapshot, payload) { reminders.push(payload); return { id: `reminder-${id++}` }; },
      async editMessage(threadId, messageId, payload) { edits.push({ threadId, messageId, payload }); },
      async deleteMessage(threadId, messageId) { deleted.push({ threadId, messageId }); },
    },
    catalogueService: { catalogue: () => [], revision: () => 0 },
    setTimer(fn, ms) { const timer = { fn, ms, cancelled: false }; timers.push(timer); return timer; },
    clearTimer(timer) { timer.cancelled = true; },
    logger: { error() {} },
  });
  return { coordinator, edits, responses, reminders, deleted, timers };
}

test('meaningful partial answer updates guidance acknowledges and resets timer', async () => {
  const h = harness([snapshot(['test']), snapshot(['test', '26.1.2'])]);
  await h.coordinator.start({ id: 'thread-1' });
  const firstTimer = h.timers[0];
  await h.coordinator.onOwnerMessage({ id: 'answer', channelId: 'thread-1', author: { id: 'owner' } });
  assert.equal(firstTimer.cancelled, true);
  assert.equal(h.edits.length, 1);
  assert.equal(h.responses.length, 1);
  assert.match(h.responses[0].content, /Minecraft.*26\.1\.2/i);
  assert.match(h.responses[0].content, /MCA Reborn version/i);
  assert.equal(h.timers.length, 2);
});

test('unrelated reply does not update guidance or reset the timer', async () => {
  const h = harness([snapshot(['26.1.2']), snapshot(['26.1.2', 'h'])]);
  await h.coordinator.start({ id: 'thread-1' });
  const firstTimer = h.timers[0];
  await h.coordinator.onOwnerMessage({ id: 'h', channelId: 'thread-1', author: { id: 'owner' } });
  assert.equal(firstTimer.cancelled, false);
  assert.equal(h.edits.length, 0);
  assert.equal(h.responses.length, 0);
});

test('corrected complete pair deletes guidance and stops tracking', async () => {
  const h = harness([snapshot(['26.1.2']), snapshot(['26.1.2', '7.7.23+26.1.2'])]);
  await h.coordinator.start({ id: 'thread-1' });
  await h.coordinator.onOwnerMessage({ id: 'pair', channelId: 'thread-1', author: { id: 'owner' } });
  assert.equal(h.coordinator.isTracking('thread-1'), false);
  assert.deepEqual(h.deleted, [{ threadId: 'thread-1', messageId: 'main-1' }]);
});

test('stale timer callback cannot send after progress reset', async () => {
  const h = harness([snapshot(['test']), snapshot(['test', '26.1.2'])]);
  await h.coordinator.start({ id: 'thread-1' });
  const stale = h.timers[0];
  await h.coordinator.onOwnerMessage({ id: 'answer', channelId: 'thread-1', author: { id: 'owner' } });
  await stale.fn();
  assert.equal(h.reminders.length, 0);
});
