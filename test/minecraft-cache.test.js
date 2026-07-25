import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMinecraftCacheFresh,
  loadMinecraftVersionCache,
  writeMinecraftVersionCache,
} from '../src/minecraft/cache.js';

const document = {
  schemaVersion: 1,
  source: 'mojang-version-manifest-v2',
  fetchedAt: '2026-07-25T20:00:00.000Z',
  latest: { release: '26.2', snapshot: '26.2' },
  versions: [{ id: '26.2', canonicalId: '26.2', type: 'release' }],
};

test('loads valid Mojang cache and rejects malformed cache', async () => {
  assert.deepEqual(await loadMinecraftVersionCache('cache.json', {
    readFile: async () => JSON.stringify(document),
  }), document);
  assert.equal(await loadMinecraftVersionCache('cache.json', {
    readFile: async () => '{bad',
  }), null);
});

test('writes Mojang cache through temporary file and atomic rename', async () => {
  const calls = [];
  await writeMinecraftVersionCache('/tmp/minecraft/cache.json', document, {
    mkdir: async (...args) => calls.push(['mkdir', ...args]),
    writeFile: async (...args) => calls.push(['write', ...args]),
    rename: async (...args) => calls.push(['rename', ...args]),
    rm: async (...args) => calls.push(['rm', ...args]),
    random: () => 'fixed',
  });
  assert.match(calls[1][1], /cache\.json\.fixed\.tmp$/);
  assert.deepEqual(calls[2].slice(0, 3), [
    'rename',
    '/tmp/minecraft/cache.json.fixed.tmp',
    '/tmp/minecraft/cache.json',
  ]);
});

test('uses the six-hour Mojang cache freshness window', () => {
  const fetched = Date.parse(document.fetchedAt);
  assert.equal(isMinecraftCacheFresh(document, fetched + 6 * 60 * 60 * 1000 - 1), true);
  assert.equal(isMinecraftCacheFresh(document, fetched + 6 * 60 * 60 * 1000), false);
});
