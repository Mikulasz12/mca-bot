import assert from 'node:assert/strict';
import test from 'node:test';
import { registerGuidanceEvents } from '../src/guidance/runtime.js';

const Events = {
  ThreadCreate: 'threadCreate',
  ThreadUpdate: 'threadUpdate',
  ThreadDelete: 'threadDelete',
  MessageCreate: 'messageCreate',
};

function setup() {
  const handlers = new Map();
  const calls = [];
  const client = { on(event, handler) { handlers.set(event, handler); } };
  const coordinator = {
    async start(thread) { calls.push(['start', thread.id]); },
    async onThreadUpdate(oldThread, newThread) { calls.push(['update', oldThread.id, newThread.id]); },
    async onThreadDelete(thread) { calls.push(['delete', thread.id]); },
    async onOwnerMessage(message) { calls.push(['owner-message', message.id]); },
  };
  const infoHandler = { async handle(message, adapter) { calls.push(['info', message.id, adapter.name]); } };
  const adapter = { name: 'adapter' };
  registerGuidanceEvents(client, { coordinator, infoHandler, adapter, Events, logger: { error() {} } });
  return { handlers, calls };
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

test('offers messages to info handler and completion coordinator', async () => {
  const h = setup();
  h.handlers.get(Events.MessageCreate)({ id: 'message-1' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, [['info', 'message-1', 'adapter'], ['owner-message', 'message-1']]);
});
