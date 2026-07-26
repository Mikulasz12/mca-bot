import assert from 'node:assert/strict';
import test from 'node:test';

import { detectThreadVersions } from '../src/version/detect.js';

function detect(messages, { tags = [], title = '' } = {}) {
  return detectThreadVersions({
    tags: tags.map((name, index) => ({ id: String(index + 1), name })),
    title,
    messages: messages.map((content, index) => ({
      position: index === 0 ? 'starter' : `reply-${index}`,
      authorKind: 'thread-owner',
      content,
      attachments: [],
    })),
  });
}

test('resolves an informal MCA plus Minecraft pair', () => {
  const result = detect(['7.7.23+26.1.2']);
  assert.equal(result.resolved.mca.value, '7.7.23');
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.deepEqual(result.resolved.pair, {
    mca: '7.7.23',
    minecraft: '26.1.2',
    loader: null,
    source: 'starter',
    explicit: true,
  });
});

test('supports slash-separated and labelled pairs', () => {
  const slash = detect(['7.7.23 / 1.21.1']);
  assert.equal(slash.resolved.mca.value, '7.7.23');
  assert.equal(slash.resolved.minecraft.value, '1.21.1');

  const labelled = detect(['MCA 7.7.23, Minecraft 1.21.1']);
  assert.equal(labelled.resolved.mca.value, '7.7.23');
  assert.equal(labelled.resolved.minecraft.value, '1.21.1');
});

test('latest complete pair supersedes earlier answers', () => {
  const result = detect(['26.1.2', '7.7.23+1.21.1', '7.7.23+26.1.2']);
  assert.equal(result.resolved.mca.value, '7.7.23');
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.pair.source, 'reply-2');
});

test('separate latest fields combine and unrelated replies do not change them', () => {
  const result = detect(['26.1.2', 'h', '7.9.0']);
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.mca.value, '7.9.0');
});

test('multiple pairs in the same latest message remain ambiguous', () => {
  const result = detect(['7.7.23+1.21.1 and 7.7.23+26.1.2']);
  assert.equal(result.resolved.minecraft.status, 'ambiguous');
  assert.deepEqual(result.resolved.minecraft.values, ['1.21.1', '26.1.2']);
  assert.equal(result.resolved.mca.status, 'present');
});

test('detects and normalises loader evidence', () => {
  const result = detect(['I use neo forge', 'mca-neoforge-7.7.23+1.21.1.jar']);
  assert.equal(result.resolved.loader.value, 'neoforge');
  assert.equal(result.resolved.pair.loader, 'neoforge');
});

test('later single-field correction updates only that field', () => {
  const result = detect(['7.7.23+1.21.1', '26.1.2']);
  assert.equal(result.resolved.mca.value, '7.7.23');
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.pair, null);
});

test('uses a bare MCA post title with an MCA Minecraft-version forum tag', () => {
  const result = detect(['h'], { title: '7.7.23', tags: ['MCA 1.21.1'] });

  assert.equal(result.resolved.mca.status, 'present');
  assert.equal(result.resolved.mca.value, '7.7.23');
  assert.equal(result.resolved.minecraft.status, 'present');
  assert.equal(result.resolved.minecraft.value, '1.21.1');
  assert.deepEqual(result.sources[0].rejectedMca, []);
  assert.deepEqual(result.mca.rejected, []);
});

test('forum Minecraft tag wins in the exact title-conflict case', () => {
  const result = detect(['hi'], { title: '1.21.1', tags: ['MCA 26.1.2'] });

  assert.equal(result.resolved.minecraft.status, 'present');
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.mca.status, 'missing');
});

test('forum Minecraft tag overrides conflicting title and owner replies', () => {
  const result = detect(
    ['Minecraft: 1.21.1', 'Minecraft: 1.20.1', 'MCA: 7.9.0'],
    { title: '1.21.1', tags: ['MCA 26.1.2'] },
  );

  assert.equal(result.resolved.minecraft.status, 'present');
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.mca.value, '7.9.0');
});

test('conflicting forum Minecraft tags remain authoritative and ambiguous', () => {
  const result = detect(
    ['Minecraft: 1.21.1', 'MCA: 7.9.0'],
    { tags: ['MCA 26.1.2', 'MCA 26.2'] },
  );

  assert.equal(result.resolved.minecraft.status, 'ambiguous');
  assert.deepEqual(result.resolved.minecraft.values, ['26.1.2', '26.2']);
  assert.equal(result.resolved.mca.value, '7.9.0');
});
