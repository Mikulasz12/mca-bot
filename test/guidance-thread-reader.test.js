import assert from 'node:assert/strict';
import test from 'node:test';
import { createThreadReader } from '../src/guidance/thread-reader.js';

function message({ id, authorId, content = '', bot = false, created = 0, attachments = [] }) {
  return {
    id,
    content,
    createdTimestamp: created,
    createdAt: new Date(created),
    author: { id: authorId, bot },
    attachments: new Map(attachments.map((name, index) => [String(index), { name }])),
  };
}

function makeThread({ parentId = 'forum-1', starterFailures = 0 } = {}) {
  const starter = message({ id: 'thread-1', authorId: 'owner', content: 'Minecraft: 1.21.1', created: 1 });
  let attempts = 0;
  const messages = [
    starter,
    message({ id: '2', authorId: 'other', content: 'MCA: 9.9.9', created: 2 }),
    message({ id: '3', authorId: 'bot', content: 'MCA: 8.8.8', bot: true, created: 3 }),
    message({ id: '4', authorId: 'owner', content: 'MCA: 7.7.23', created: 4, attachments: ['mca-neoforge-7.7.23+1.21.1.jar'] }),
  ];
  return {
    id: 'thread-1',
    parentId,
    ownerId: 'owner',
    name: 'Help me',
    archived: false,
    locked: false,
    appliedTags: ['tag-1'],
    parent: { availableTags: [{ id: 'tag-1', name: 'MCA 1.21.1' }] },
    async fetchStarterMessage() {
      attempts += 1;
      if (attempts <= starterFailures) throw new Error('Unknown Message');
      return starter;
    },
    messages: {
      async fetch() {
        return new Map(messages.map((item) => [item.id, item]));
      },
    },
    get starterAttempts() { return attempts; },
  };
}

test('ignores threads outside configured forums', async () => {
  const reader = createThreadReader({ forumChannelIds: ['forum-1'], sleep: async () => {} });
  assert.equal(await reader.read(makeThread({ parentId: 'other-forum' })), null);
});

test('retries starter fetch and maps tags plus owner-only evidence', async () => {
  const waits = [];
  const reader = createThreadReader({ forumChannelIds: ['forum-1'], sleep: async (ms) => waits.push(ms) });
  const thread = makeThread({ starterFailures: 2 });
  const snapshot = await reader.read(thread);

  assert.equal(thread.starterAttempts, 3);
  assert.deepEqual(waits, [250, 750]);
  assert.equal(snapshot.threadId, 'thread-1');
  assert.equal(snapshot.ownerId, 'owner');
  assert.equal(snapshot.starterId, 'thread-1');
  assert.deepEqual(snapshot.detectorInput.tags, [{ id: 'tag-1', name: 'MCA 1.21.1' }]);
  assert.deepEqual(snapshot.detectorInput.messages.map(({ content }) => content), [
    'Minecraft: 1.21.1',
    'MCA: 7.7.23',
  ]);
  assert.deepEqual(snapshot.detectorInput.messages[1].attachments, [{ name: 'mca-neoforge-7.7.23+1.21.1.jar' }]);
});

test('surfaces archived and locked state', async () => {
  const thread = makeThread();
  thread.archived = true;
  thread.locked = true;
  const reader = createThreadReader({ forumChannelIds: ['forum-1'], sleep: async () => {} });
  const snapshot = await reader.read(thread);
  assert.equal(snapshot.archived, true);
  assert.equal(snapshot.locked, true);
});

test('fails after three starter attempts', async () => {
  const reader = createThreadReader({ forumChannelIds: ['forum-1'], sleep: async () => {} });
  await assert.rejects(() => reader.read(makeThread({ starterFailures: 3 })), /Unknown Message/);
});

test('retries when Discord temporarily returns no starter message', async () => {
  const thread = makeThread();
  const original = thread.fetchStarterMessage.bind(thread);
  let calls = 0;
  thread.fetchStarterMessage = async () => {
    calls += 1;
    if (calls === 1) return null;
    return original();
  };
  const waits = [];
  const reader = createThreadReader({ forumChannelIds: ['forum-1'], sleep: async (ms) => waits.push(ms) });
  const snapshot = await reader.read(thread);
  assert.equal(snapshot.starterId, 'thread-1');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [250]);
});
