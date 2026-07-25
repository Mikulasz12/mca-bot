import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceDiscordAdapter } from '../src/guidance/discord-adapter.js';

function setup({ deleteError = null } = {}) {
  const sent = [];
  const deleted = [];
  const thread = {
    id: 'thread-1',
    async send(payload) { sent.push(payload); return { id: `sent-${sent.length}` }; },
    messages: {
      async delete(id) {
        if (deleteError) throw deleteError;
        deleted.push(id);
      },
    },
  };
  const client = { channels: { async fetch(id) { assert.equal(id, 'thread-1'); return thread; } } };
  return { adapter: createGuidanceDiscordAdapter(client), thread, sent, deleted };
}

test('sends main warnings and reminders to the thread', async () => {
  const h = setup();
  const main = await h.adapter.sendMain(h.thread, {}, { content: 'main' });
  const reminder = await h.adapter.sendReminder(h.thread, {}, { content: 'reminder' });
  assert.deepEqual(h.sent, [{ content: 'main' }, { content: 'reminder' }]);
  assert.equal(main.id, 'sent-1');
  assert.equal(reminder.id, 'sent-2');
});

test('deletes a tracked bot message', async () => {
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
  const message = { channel: h.thread };
  await h.adapter.sendInfo(message, { embeds: [{ title: 'Info' }] });
  assert.deepEqual(h.sent, [{ embeds: [{ title: 'Info' }] }]);
});
