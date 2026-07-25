import assert from 'node:assert/strict';
import test from 'node:test';

import { createThreadRecord } from '../src/export/record.js';

const ownerId = '245983842672967680';

const starter = {
  id: '100000000000000000',
  createdAt: '2026-07-01T10:00:00.000Z',
  content: 'Minecraft 1.21.1 webhook https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
  author: { id: ownerId, bot: false },
  attachments: [{ name: 'mca-neoforge-7.7.18+1.21.1.jar', contentType: 'application/java-archive', size: 123 }],
};

const reply = {
  id: '100000000000000001',
  createdAt: '2026-07-01T10:01:00.000Z',
  content: 'Please send latest.log',
  author: { id: '999999999999999999', bot: false },
  attachments: [],
};

test('creates a stable record without exporting raw author ids', () => {
  const record = createThreadRecord({
    exportedAt: '2026-07-25T20:00:00.000Z',
    guildId: '747184859386085380',
    forum: {
      id: '1082779790714613840',
      name: 'support',
      tags: [
        { id: '1', name: 'NeoForge' },
        { id: '2', name: '1.21.1' },
      ],
    },
    thread: {
      id: '100000000000000000',
      name: 'Villagers are bald',
      url: 'https://discord.com/channels/747184859386085380/100000000000000000',
      ownerId,
      createdAt: '2026-07-01T10:00:00.000Z',
      archivedAt: null,
      archived: false,
      locked: false,
      appliedTagIds: ['1', '2'],
    },
    starter,
    replies: [reply, { ...reply, id: '100000000000000002', author: { id: '7', bot: true } }],
    errors: [],
  });

  assert.equal(record.schemaVersion, 1);
  assert.deepEqual(record.forum.tags, [
    { id: '1', name: 'NeoForge' },
    { id: '2', name: '1.21.1' },
  ]);
  assert.equal(record.messages[0].position, 'starter');
  assert.equal(record.messages[0].authorKind, 'thread-owner');
  assert.equal(record.messages[1].position, 'reply-1');
  assert.equal(record.messages[1].authorKind, 'other');
  assert.equal(record.messages[2].authorKind, 'bot');
  assert.match(record.messages[0].content, /\[REDACTED_DISCORD_WEBHOOK\]/);
  assert.deepEqual(record.messages[0].attachments, [
    { name: 'mca-neoforge-7.7.18+1.21.1.jar', contentType: 'application/java-archive', size: 123 },
  ]);
  assert.equal(JSON.stringify(record).includes(ownerId), false);
  assert.equal(Object.hasOwn(record.thread, 'ownerId'), false);
});

test('creates an error-only record when the starter message cannot be read', () => {
  const record = createThreadRecord({
    exportedAt: '2026-07-25T20:00:00.000Z',
    guildId: '747184859386085380',
    forum: { id: '1082779790714613840', name: 'support', tags: [] },
    thread: {
      id: '100000000000000099',
      name: 'Deleted starter',
      url: 'https://discord.com/channels/747184859386085380/100000000000000099',
      ownerId,
      createdAt: null,
      archivedAt: null,
      archived: true,
      locked: false,
      appliedTagIds: [],
    },
    starter: null,
    replies: [],
    errors: ['Starter message is unavailable'],
  });

  assert.deepEqual(record.messages, []);
  assert.deepEqual(record.errors, ['Starter message is unavailable']);
});
