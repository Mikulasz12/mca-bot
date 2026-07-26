import assert from 'node:assert/strict';
import test from 'node:test';

import { isMinecraftCacheFresh, loadMinecraftVersionCache, writeMinecraftVersionCache } from '../src/minecraft/cache.js';

const document = {
  schemaVersion: 2,
  fetchedAt: '2026-07-25T20:00:00.000Z',
  latestRelease: '26.2',
  versions: ['26.2', '1.21.1'],
};

test('loads only the compact v2 Mojang cache schema', async () => {
  assert.deepEqual(await loadMinecraftVersionCache('cache.json', { readFile: async () => JSON.stringify(document) }), document);
  assert.equal(await loadMinecraftVersionCache('cache.json', { readFile: async () => JSON.stringify({ ...document, schemaVersion: 1 }) }), null);
  assert.equal(await loadMinecraftVersionCache('cache.json', { readFile: async () => '{bad' }), null);
});

test('writes minified Mojang cache through temporary file and atomic rename', async () => {
  const calls = [];
  await writeMinecraftVersionCache('/tmp/minecraft/cache.json', document, {
    mkdir: async (...args) => calls.push(['mkdir', ...args]),
    writeFile: async (...args) => calls.push(['write', ...args]),
    rename: async (...args) => calls.push(['rename', ...args]),
    rm: async (...args) => calls.push(['rm', ...args]),
    random: () => 'fixed',
  });
  assert.match(calls[1][1], /cache\.json\.fixed\.tmp$/);
  assert.equal(calls[1][2], `${JSON.stringify(document)}\n`);
  assert.deepEqual(calls[2].slice(0, 3), ['rename', '/tmp/minecraft/cache.json.fixed.tmp', '/tmp/minecraft/cache.json']);
});

test('uses the six-hour Mojang cache freshness window', () => {
  const fetched = Date.parse(document.fetchedAt);
  assert.equal(isMinecraftCacheFresh(document, fetched + 6 * 60 * 60 * 1000 - 1), true);
  assert.equal(isMinecraftCacheFresh(document, fetched + 6 * 60 * 60 * 1000), false);
});
