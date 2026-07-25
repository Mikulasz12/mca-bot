import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceDiscordAdapter } from '../src/guidance/discord-adapter.js';

function setup({ deleteError = null } = {}) {
  const sent = [];
  const edited = [];
  const fetched = [];
  const deleted = [];
  const thread = {
    id: 'thread-1',
    async send(payload) { sent.push(payload); return { id: `sent-${sent.length}` }; },
    messages: {
      async fetch(id) {
        fetched.push(id);
        return {
          id,
          async edit(payload) { edited.push({ id, payload }); return { id }; },
        };
      },
      async edit() { throw new Error('manager edit must not be used'); },
      async delete(id) { if (deleteError) throw deleteError; deleted.push(id); },
    },
  };
  const client = { channels: { async fetch(id) { assert.equal(id, 'thread-1'); return thread; } } };
  return { adapter: createGuidanceDiscordAdapter(client), thread, sent, edited, fetched, deleted };
}

test('sends main warnings responses and reminders to the thread', async () => {
  const h = setup();
  await h.adapter.sendMain(h.thread, {}, { content: 'main' });
  await h.adapter.sendResponse(h.thread, {}, { content: 'response' });
  await h.adapter.sendReminder(h.thread, {}, { content: 'reminder' });
  assert.deepEqual(h.sent, [{ content: 'main' }, { content: 'response' }, { content: 'reminder' }]);
});

test('fetches the bot message and strips reply metadata before editing', async () => {
  const h = setup();
  await h.adapter.editMessage('thread-1', 'message-1', {
    content: 'updated',
    reply: { messageReference: 'starter', failIfNotExists: false },
  });
  assert.deepEqual(h.fetched, ['message-1']);
  assert.deepEqual(h.edited, [{ id: 'message-1', payload: { content: 'updated' } }]);
});

test('deletes tracked bot messages', async () => {
  const h = setup();
  await h.adapter.deleteMessage('thread-1', 'message-1');
  assert.deepEqual(h.deleted, ['message-1']);
});

test('ignores Discord unknown-message deletion errors', async () => {
  const h = setup({ deleteError: { code: 10008 } });
  await h.adapter.deleteMessage('thread-1', 'gone');
});

test('sends info payload in the message thread', async () => {
  const h = setup();
  await h.adapter.sendInfo({ channel: h.thread }, { embeds: [{ title: 'Info' }] });
  assert.deepEqual(h.sent, [{ embeds: [{ title: 'Info' }] }]);
});
