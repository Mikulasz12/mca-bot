import assert from 'node:assert/strict';
import test from 'node:test';

import { detectThreadVersions } from '../src/version/detect.js';

function detect(contents) {
  return detectThreadVersions({
    tags: [],
    title: '',
    messages: contents.map((content, index) => ({
      position: index === 0 ? 'starter' : `reply-${index}`,
      authorKind: 'thread-owner',
      content,
      attachments: [],
    })),
  });
}

test('resolves informal MCA plus Minecraft pairs', () => {
  for (const text of ['7.7.23+26.1.2', '7.7.23 / 26.1.2', 'MCA 7.7.23, Minecraft 26.1.2']) {
    const result = detect([text]);
    assert.equal(result.resolved.mca.value, '7.7.23');
    assert.equal(result.resolved.minecraft.value, '26.1.2');
  }
});

test('latest complete pair supersedes earlier answers', () => {
  const result = detect(['26.1.2', '7.7.23+1.21.1', '7.7.23+26.1.2']);
  assert.equal(result.resolved.mca.value, '7.7.23');
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.pair.source, 'reply-2');
});

test('later single-field reply updates only that field', () => {
  const result = detect(['7.7.23+1.21.1', '26.1.2']);
  assert.equal(result.resolved.mca.value, '7.7.23');
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.pair, null);
});

test('ordinary messages do not change resolved versions', () => {
  const result = detect(['26.1.2', 'h', '7.9.6']);
  assert.equal(result.resolved.minecraft.value, '26.1.2');
  assert.equal(result.resolved.mca.value, '7.9.6');
});

test('multiple pairs in one latest message remain ambiguous', () => {
  const result = detect(['7.7.23+1.21.1 and 7.7.23+26.1.2']);
  assert.equal(result.resolved.minecraft.status, 'ambiguous');
  assert.deepEqual(result.resolved.minecraft.values, ['1.21.1', '26.1.2']);
});

test('extracts the loader from complete jar names', () => {
  const result = detect(['mca-neoforge-7.7.23+1.21.1.jar']);
  assert.equal(result.resolved.loader.value, 'neoforge');
  assert.equal(result.resolved.pair.loader, 'neoforge');
});
