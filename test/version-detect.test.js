import assert from 'node:assert/strict';
import test from 'node:test';

import { detectThreadVersions } from '../src/version/detect.js';

function detect({ tags = [], title = '', messages = [] } = {}) {
  return detectThreadVersions({
    tags: tags.map((name, index) => ({ id: String(index + 1), name })),
    title,
    messages: messages.map((message, index) => ({
      position: message.position ?? (index === 0 ? 'starter' : `reply-${index}`),
      authorKind: message.authorKind ?? 'thread-owner',
      content: message.content ?? '',
      attachments: (message.attachments ?? []).map((name) => ({ name })),
    })),
  });
}

test('detects labelled Minecraft and MCA versions with prerelease spelling', () => {
  const result = detect({
    messages: [{ content: 'minecraft version: 1.21.1\nmca: 7.7.23 alpha3' }],
  });

  assert.deepEqual(result.minecraft.values, ['1.21.1']);
  assert.equal(result.minecraft.status, 'present');
  assert.deepEqual(result.mca.values, ['7.7.23-alpha.3']);
  assert.equal(result.mca.status, 'present');
});

test('detects both versions from a compound MCA jar name', () => {
  const result = detect({
    messages: [{ content: 'my mod version is mca-neoforge-7.7.23+1.21.1' }],
  });

  assert.deepEqual(result.minecraft.values, ['1.21.1']);
  assert.deepEqual(result.mca.values, ['7.7.23']);
});

test('detects versions from attachment filenames', () => {
  const result = detect({
    messages: [{ content: '', attachments: ['mca-fabric-8.1.2+26.1.2.jar'] }],
  });

  assert.deepEqual(result.minecraft.values, ['26.1.2']);
  assert.deepEqual(result.mca.values, ['8.1.2']);
  assert.equal(result.mca.evidence[0].source, 'starter-attachment');
});

test('treats MCA version forum tags as Minecraft version tags', () => {
  const result = detect({ tags: ['MCA 1.21.1', 'MCA Help'] });

  assert.deepEqual(result.minecraft.values, ['1.21.1']);
  assert.deepEqual(result.mca.values, []);
});

test('classifies bare version replies by version shape after a prompt', () => {
  const result = detect({
    messages: [
      { authorKind: 'other', content: 'what mca version' },
      { authorKind: 'thread-owner', content: '7.6.21' },
      { authorKind: 'thread-owner', content: '1.20.1' },
    ],
  });

  assert.deepEqual(result.minecraft.values, ['1.20.1']);
  assert.deepEqual(result.mca.values, ['7.6.21']);
});

test('does not accept a Minecraft-shaped answer as an MCA version', () => {
  const result = detect({
    messages: [
      { authorKind: 'other', content: 'what mca version?' },
      { authorKind: 'thread-owner', content: '1.20.1' },
      { authorKind: 'other', content: 'i mean mca version' },
    ],
  });

  assert.deepEqual(result.minecraft.values, ['1.20.1']);
  assert.equal(result.minecraft.status, 'present');
  assert.deepEqual(result.mca.values, []);
  assert.equal(result.mca.status, 'missing');
});

test('detects an MCA version from the thread title', () => {
  const result = detect({ title: 'MCA REBORN 7.3.23' });

  assert.deepEqual(result.mca.values, ['7.3.23']);
});

test('normalizes beta versions and keeps multiple exact versions', () => {
  const result = detect({
    messages: [{ content: 'MCA Reborn Version: 7.7.17 also in 7.7.18-beta.10' }],
  });

  assert.deepEqual(result.mca.values, ['7.7.17', '7.7.18-beta.10']);
  assert.equal(result.mca.status, 'ambiguous');
});

test('rejects a Minecraft-shaped value explicitly labelled as MCA', () => {
  const result = detect({
    messages: [{ content: 'Minecraft Version: 26.1.2\nMCA Reborn Version: 26.1.2' }],
  });

  assert.deepEqual(result.minecraft.values, ['26.1.2']);
  assert.deepEqual(result.mca.values, []);
  assert.equal(result.mca.status, 'missing');
  assert.deepEqual(result.mca.rejected.map(({ value }) => value), ['26.1.2']);
});

test('detects corpus phrasing for mod version and Minecraft version', () => {
  const result = detect({
    messages: [{ content: "I'm using mod version 7.6.28 for Minecraft 1.20.1." }],
  });

  assert.deepEqual(result.minecraft.values, ['1.20.1']);
  assert.deepEqual(result.mca.values, ['7.6.28']);
});

test('detects loader-prefixed Minecraft versions', () => {
  const result = detect({ messages: [{ content: 'Version Neoforge 1.21.1' }] });

  assert.deepEqual(result.minecraft.values, ['1.21.1']);
});

test('does not treat latest or unrelated numbers as exact versions', () => {
  const result = detect({
    messages: [{ content: 'latest MCA, Forge 47.4.0, Java 21, and 400 hearts' }],
  });

  assert.deepEqual(result.minecraft.values, []);
  assert.deepEqual(result.mca.values, []);
  assert.equal(result.minecraft.status, 'missing');
  assert.equal(result.mca.status, 'missing');
  assert.equal(result.vague.includes('latest'), true);
});

test('detects concatenated Minecraft and MCA fields in a thread title', () => {
  const result = detect({
    title: 'Minecraft Version: 26.1.2MCA Reborn Version: 7.9.3/7.9.4Problem: villagers are bald',
  });

  assert.deepEqual(result.minecraft.values, ['26.1.2']);
  assert.deepEqual(result.mca.values, ['7.9.3', '7.9.4']);
});

test('does not treat Minecraft versions in MCA config prose as MCA versions', () => {
  const result = detect({
    title: 'How to Edit Config Correctly in 1.20.1',
    messages: [
      {
        content:
          'I am trying to edit the MCA reborn config for this version. The previous versions I used are 1.18.2 and 1.19.2.',
      },
    ],
  });

  assert.deepEqual(result.minecraft.values, ['1.20.1']);
  assert.deepEqual(result.mca.values, []);
});

test('ignores a NeoForge build number beside the Minecraft version', () => {
  const result = detect({
    messages: [
      {
        content: 'Minecraft Version: NeoForge 21.1.228 1.21.1\nMCA Reborn Version: 7.7.7',
      },
    ],
  });

  assert.deepEqual(result.minecraft.values, ['1.21.1']);
  assert.deepEqual(result.mca.values, ['7.7.7']);
});

test('treats MCA followed by a Minecraft-shaped branch as Minecraft shorthand', () => {
  const result = detect({
    messages: [{ content: 'I am trying to import custom skins for villagers in MCA 1.18.2' }],
  });

  assert.deepEqual(result.minecraft.values, ['1.18.2']);
  assert.deepEqual(result.mca.values, []);
});
