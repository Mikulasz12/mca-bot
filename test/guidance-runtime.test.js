import assert from 'node:assert/strict';
import test from 'node:test';
import { registerGuidanceEvents } from '../src/guidance/runtime.js';

const Events = {
  ThreadCreate: 'threadCreate',
  ThreadUpdate: 'threadUpdate',
  ThreadDelete: 'threadDelete',
  MessageCreate: 'messageCreate',
  MessageUpdate: 'messageUpdate',
  MessageDelete: 'messageDelete',
};

function setup({ ownerMessageError = null } = {}) {
  const handlers = new Map();
  const calls = [];
  const errors = [];
  const client = { on(event, handler) { handlers.set(event, handler); } };
  const coordinator = {
    async start(thread) { calls.push(['start', thread.id]); },
    async onThreadUpdate(oldThread, newThread) { calls.push(['update', oldThread.id, newThread.id]); },
    async onThreadDelete(thread) { calls.push(['delete', thread.id]); },
    async onOwnerMessage(message) {
      if (ownerMessageError) throw ownerMessageError;
      calls.push(['owner-message', message.id]);
    },
    async onOwnerEvidenceChanged(message) { calls.push(['evidence', message.id]); },
  };
  registerGuidanceEvents(client, { coordinator, Events, logger: { error(message) { errors.push(message); } } });
  return { handlers, calls, errors };
}

test('registers all live guidance events', () => {
  const h = setup();
  assert.deepEqual([...h.handlers.keys()].sort(), Object.values(Events).sort());
});

test('routes newly-created threads but ignores discovered existing threads', async () => {
  const h = setup();
  h.handlers.get(Events.ThreadCreate)({ id: 'new' }, true);
  h.handlers.get(Events.ThreadCreate)({ id: 'existing' }, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [['start', 'new']]);
});

test('routes updates and deletion', async () => {
  const h = setup();
  h.handlers.get(Events.ThreadUpdate)({ id: 'old' }, { id: 'new' });
  h.handlers.get(Events.ThreadDelete)({ id: 'gone' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [['update', 'old', 'new'], ['delete', 'gone']]);
});

test('routes new messages to the completion coordinator', async () => {
  const h = setup();
  h.handlers.get(Events.MessageCreate)({ id: 'message-1' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [['owner-message', 'message-1']]);
});

test('routes message edits and deletions to evidence rechecks', async () => {
  const h = setup();
  h.handlers.get(Events.MessageUpdate)({ id: 'old' }, { id: 'edited' });
  h.handlers.get(Events.MessageDelete)({ id: 'deleted' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [['evidence', 'edited'], ['evidence', 'deleted']]);
});

test('does not log expected deleted-thread races', async () => {
  const h = setup({ ownerMessageError: Object.assign(new Error('Unknown Channel'), { code: 10003 }) });
  h.handlers.get(Events.MessageCreate)({ id: 'message-gone' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.errors, []);
});

test('continues logging unexpected runtime failures', async () => {
  const h = setup({ ownerMessageError: new Error('Missing Access') });
  h.handlers.get(Events.MessageCreate)({ id: 'message-failed' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /Missing Access/);
});
