import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceCoordinator } from '../src/guidance/coordinator.js';

function detectorInput({ minecraft = null, mca = null } = {}) {
  const parts = [];
  if (minecraft) parts.push(`Minecraft: ${minecraft}`);
  if (mca) parts.push(`MCA: ${mca}`);
  return { tags: [], title: '', messages: [{ position: 'starter', authorKind: 'thread-owner', content: parts.join('\n'), attachments: [] }] };
}

function snapshot({ minecraft = null, mca = null, archived = false, locked = false } = {}) {
  return {
    threadId: 'thread-1',
    ownerId: 'owner',
    starterId: 'starter',
    archived,
    locked,
    detectorInput: detectorInput({ minecraft, mca }),
  };
}

function harness(sequence) {
  const queue = [...sequence];
  const reads = [];
  const sentMain = [];
  const sentReminders = [];
  const deleted = [];
  const timers = [];
  let nextMessage = 1;

  const reader = {
    async read(thread) {
      reads.push(thread.id);
      return queue.length > 1 ? queue.shift() : queue[0];
    },
  };
  const adapter = {
    async sendMain(thread, value, payload) {
      sentMain.push({ thread, value, payload });
      return { id: `main-${nextMessage++}` };
    },
    async sendReminder(thread, value, payload) {
      sentReminders.push({ thread, value, payload });
      return { id: `reminder-${nextMessage++}` };
    },
    async deleteMessage(threadId, messageId) {
      deleted.push({ threadId, messageId });
    },
  };
  function setTimer(fn, ms) {
    const timer = { fn, ms, cancelled: false };
    timers.push(timer);
    return timer;
  }
  function clearTimer(timer) { timer.cancelled = true; }

  const coordinator = createGuidanceCoordinator({
    reader,
    adapter,
    setTimer,
    clearTimer,
    reminderDelayMs: 45_000,
    logger: { error() {} },
  });
  return { coordinator, reads, sentMain, sentReminders, deleted, timers };
}

async function fire(timer) {
  await timer.fn();
}

test('complete thread sends nothing', async () => {
  const h = harness([snapshot({ minecraft: '1.21.1', mca: '7.7.23' })]);
  await h.coordinator.start({ id: 'thread-1' });
  assert.equal(h.sentMain.length, 0);
  assert.equal(h.timers.length, 0);
  assert.equal(h.coordinator.isTracking('thread-1'), false);
});

test('incomplete thread sends immediately and schedules 45 seconds', async () => {
  const h = harness([snapshot({ minecraft: '1.21.1' })]);
  await h.coordinator.start({ id: 'thread-1' });
  assert.equal(h.sentMain.length, 1);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 45_000);
  assert.equal(h.coordinator.isTracking('thread-1'), true);
});

test('sends at most two reminders and replaces the first', async () => {
  const h = harness([
    snapshot({ minecraft: '1.21.1' }),
    snapshot({ minecraft: '1.21.1' }),
    snapshot({ minecraft: '1.21.1' }),
  ]);
  await h.coordinator.start({ id: 'thread-1' });
  await fire(h.timers[0]);
  assert.equal(h.sentReminders.length, 1);
  assert.equal(h.timers.length, 2);
  await fire(h.timers[1]);
  assert.equal(h.sentReminders.length, 2);
  assert.deepEqual(h.deleted, [{ threadId: 'thread-1', messageId: 'reminder-2' }]);
  assert.equal(h.timers.length, 2);
});

test('owner message rechecks immediately and removes bot guidance on completion', async () => {
  const h = harness([
    snapshot({ minecraft: '1.21.1' }),
    snapshot({ minecraft: '1.21.1', mca: '7.7.23' }),
  ]);
  await h.coordinator.start({ id: 'thread-1' });
  await h.coordinator.onOwnerMessage({ channelId: 'thread-1', author: { id: 'owner' } });
  assert.deepEqual(h.deleted, [{ threadId: 'thread-1', messageId: 'main-1' }]);
  assert.equal(h.timers[0].cancelled, true);
  assert.equal(h.coordinator.isTracking('thread-1'), false);
});

test('ignores non-owner messages for completion', async () => {
  const h = harness([snapshot({ minecraft: '1.21.1' })]);
  await h.coordinator.start({ id: 'thread-1' });
  await h.coordinator.onOwnerMessage({ channelId: 'thread-1', author: { id: 'other' } });
  assert.equal(h.reads.length, 1);
});

test('archived or locked update stops and cleans up', async () => {
  const h = harness([snapshot({ minecraft: '1.21.1' })]);
  await h.coordinator.start({ id: 'thread-1' });
  await h.coordinator.onThreadUpdate({}, { id: 'thread-1', archived: true, locked: false });
  assert.deepEqual(h.deleted, [{ threadId: 'thread-1', messageId: 'main-1' }]);
  assert.equal(h.coordinator.isTracking('thread-1'), false);
});

test('thread deletion cancels tracking without trying to delete messages', async () => {
  const h = harness([snapshot({ minecraft: '1.21.1' })]);
  await h.coordinator.start({ id: 'thread-1' });
  await h.coordinator.onThreadDelete({ id: 'thread-1' });
  assert.deepEqual(h.deleted, []);
  assert.equal(h.coordinator.isTracking('thread-1'), false);
});

test('completion after a reminder deletes both reminder and main warning', async () => {
  const h = harness([
    snapshot({ minecraft: '1.21.1' }),
    snapshot({ minecraft: '1.21.1' }),
    snapshot({ minecraft: '1.21.1', mca: '7.7.23' }),
  ]);
  await h.coordinator.start({ id: 'thread-1' });
  await fire(h.timers[0]);
  await h.coordinator.onOwnerMessage({ channelId: 'thread-1', author: { id: 'owner' } });
  assert.deepEqual(h.deleted, [
    { threadId: 'thread-1', messageId: 'reminder-2' },
    { threadId: 'thread-1', messageId: 'main-1' },
  ]);
  assert.equal(h.coordinator.isTracking('thread-1'), false);
});
