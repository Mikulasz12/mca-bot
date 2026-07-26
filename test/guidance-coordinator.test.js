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

test('deleted thread during startup is ignored without logging', async () => {
  const logs = [];
  const error = Object.assign(new Error('Unknown Message'), { code: 10008 });
  const coordinator = createGuidanceCoordinator({
    reader: { async read() { throw error; } },
    adapter: {},
    logger: { error(message) { logs.push(message); } },
  });

  assert.equal(await coordinator.start({ id: 'thread-1' }), false);
  assert.deepEqual(logs, []);
  assert.equal(coordinator.isTracking('thread-1'), false);
});

test('deleted thread during a recheck stops tracking without cleanup or logging', async () => {
  const logs = [];
  const deleted = [];
  let reads = 0;
  const error = Object.assign(new Error('Unknown Channel'), { code: 10003 });
  const coordinator = createGuidanceCoordinator({
    reader: {
      async read() {
        reads += 1;
        if (reads === 1) return snapshot({ minecraft: '1.21.1' });
        throw error;
      },
    },
    adapter: {
      async sendMain() { return { id: 'main-1' }; },
      async deleteMessage(threadId, messageId) { deleted.push({ threadId, messageId }); },
    },
    setTimer: () => ({ cancelled: false }),
    clearTimer: (timer) => { timer.cancelled = true; },
    logger: { error(message) { logs.push(message); } },
  });

  await coordinator.start({ id: 'thread-1' });
  await coordinator.onOwnerMessage({ id: 'reply', channelId: 'thread-1', author: { id: 'owner' } });

  assert.equal(coordinator.isTracking('thread-1'), false);
  assert.deepEqual(deleted, []);
  assert.deepEqual(logs, []);
});

test('unexpected read failures still log and clean up tracked guidance', async () => {
  const logs = [];
  const deleted = [];
  let reads = 0;
  const coordinator = createGuidanceCoordinator({
    reader: {
      async read() {
        reads += 1;
        if (reads === 1) return snapshot({ minecraft: '1.21.1' });
        throw new Error('network failed');
      },
    },
    adapter: {
      async sendMain() { return { id: 'main-1' }; },
      async deleteMessage(threadId, messageId) { deleted.push({ threadId, messageId }); },
    },
    setTimer: () => ({ cancelled: false }),
    clearTimer: (timer) => { timer.cancelled = true; },
    logger: { error(message) { logs.push(message); } },
  });

  await coordinator.start({ id: 'thread-1' });
  await coordinator.onOwnerMessage({ id: 'reply', channelId: 'thread-1', author: { id: 'owner' } });

  assert.match(logs[0], /network failed/);
  assert.deepEqual(deleted, [{ threadId: 'thread-1', messageId: 'main-1' }]);
});

test('shutdown cancels all reminder timers without Discord cleanup', async () => {
  const h = harness([snapshot({ minecraft: '1.21.1' })]);
  await h.coordinator.start({ id: 'thread-1' });
  const timer = h.timers[0];

  h.coordinator.shutdown();
  await fire(timer);

  assert.equal(timer.cancelled, true);
  assert.equal(h.coordinator.isTracking('thread-1'), false);
  assert.equal(h.reads.length, 1);
  assert.deepEqual(h.deleted, []);
  assert.equal(h.sentReminders.length, 0);
});

test('shutdown during startup prevents a late warning from being sent', async () => {
  let releaseRead;
  const readPromise = new Promise((resolve) => { releaseRead = resolve; });
  let sent = 0;
  const coordinator = createGuidanceCoordinator({
    reader: { async read() { return readPromise; } },
    adapter: { async sendMain() { sent += 1; return { id: 'main-1' }; } },
    logger: { error() {} },
  });

  const starting = coordinator.start({ id: 'thread-1' });
  coordinator.shutdown();
  releaseRead(snapshot({ minecraft: '1.21.1' }));

  assert.equal(await starting, false);
  assert.equal(sent, 0);
  assert.equal(coordinator.isTracking('thread-1'), false);
});

test('shutdown during an in-flight recheck prevents late Discord operations', async () => {
  let releaseRead;
  let reads = 0;
  const timers = [];
  const operations = [];
  const coordinator = createGuidanceCoordinator({
    reader: {
      async read() {
        reads += 1;
        if (reads === 1) return snapshot({ minecraft: '1.21.1' });
        return new Promise((resolve) => { releaseRead = resolve; });
      },
    },
    adapter: {
      async sendMain() { operations.push('main'); return { id: 'main-1' }; },
      async editMessage() { operations.push('edit'); },
      async sendReminder() { operations.push('reminder'); return { id: 'reminder-1' }; },
      async deleteMessage() { operations.push('delete'); },
    },
    setTimer(fn) { const timer = { fn, cancelled: false }; timers.push(timer); return timer; },
    clearTimer(timer) { timer.cancelled = true; },
    logger: { error() {} },
  });

  await coordinator.start({ id: 'thread-1' });
  const rechecking = timers[0].fn();
  await new Promise((resolve) => setImmediate(resolve));
  coordinator.shutdown();
  releaseRead(snapshot({ minecraft: '1.21.1' }));
  await rechecking;

  assert.deepEqual(operations, ['main']);
  assert.equal(coordinator.isTracking('thread-1'), false);
});
