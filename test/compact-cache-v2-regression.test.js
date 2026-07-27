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

test('recognises version-shaped strings anywhere in an owner message', () => {
  const result = detectThreadVersions({
    messages: [{
      position: 'starter',
      authorKind: 'thread-owner',
      content: 'hello! mca ver. 7.7.23, minecraft ver. 1.21.1',
      attachments: [],
    }],
  });

  assert.equal(result.resolved.mca.value, '7.7.23');
  assert.equal(result.resolved.minecraft.value, '1.21.1');
});

test('multiple Minecraft-shaped strings remain ambiguous', () => {
  const result = detectThreadVersions({
    messages: [{
      position: 'starter',
      authorKind: 'thread-owner',
      content: 'I tried 1.20.1 and 1.21.1',
      attachments: [],
    }],
  });

  assert.equal(result.resolved.minecraft.status, 'ambiguous');
  assert.deepEqual(result.resolved.minecraft.values, ['1.20.1', '1.21.1']);
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
