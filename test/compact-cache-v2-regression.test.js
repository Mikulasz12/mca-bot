import assert from 'node:assert/strict';
import test from 'node:test';

import { buildUpdateAdvisory } from '../src/guidance/messages.js';
import { detectThreadVersions } from '../src/version/detect.js';

test('recognises MCA at the start of a descriptive title while the forum tag supplies Minecraft', () => {
  const result = detectThreadVersions({
    title: '7.7.20 test hi',
    tags: [{ id: '1', name: 'MCA 1.21.1' }],
    messages: [{ position: 'starter', authorKind: 'thread-owner', content: 'hi', attachments: [] }],
  });

  assert.equal(result.resolved.mca.value, '7.7.20');
  assert.equal(result.resolved.minecraft.value, '1.21.1');
});

test('older valid MCA builds produce an optional update advisory', () => {
  const payload = buildUpdateAdvisory({
    ownerId: '123',
    messageId: '456',
    diagnosis: {
      mcaVersion: '7.7.20',
      minecraftVersion: '1.21.1',
      updateAvailable: {
        loaders: ['neoforge'],
        entry: {
          mcaVersion: '7.7.23',
          url: 'https://modrinth.com/mod/minecraft-comes-alive-reborn/version/new',
        },
      },
    },
  });

  const text = JSON.stringify(payload);
  assert.match(text, /update available/i);
  assert.match(text, /7\.7\.20/);
  assert.match(text, /7\.7\.23/);
  assert.match(text, /optional/i);
  assert.deepEqual(payload.reply, { messageReference: '456', failIfNotExists: false });
});
