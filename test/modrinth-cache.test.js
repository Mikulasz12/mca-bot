import assert from 'node:assert/strict';
import test from 'node:test';

import { isCacheFresh, loadCatalogueCache, writeCatalogueCache } from '../src/modrinth/cache.js';

const valid = { schemaVersion: 2, fetchedAt: '2026-07-25T20:00:00.000Z', versions: [['7.7.22', ['1.21.1'], ['fabric'], 'r', 1752969600, 'a']] };

test('loads only the compact v2 Modrinth cache schema', async () => {
  assert.deepEqual(await loadCatalogueCache('cache.json', { readFile: async () => JSON.stringify(valid) }), valid);
  assert.equal(await loadCatalogueCache('cache.json', { readFile: async () => JSON.stringify({ ...valid, schemaVersion: 1 }) }), null);
  assert.equal(await loadCatalogueCache('cache.json', { readFile: async () => '{bad json' }), null);
});

test('publishes minified cache through temporary file and atomic rename', async () => {
  const calls = [];
  await writeCatalogueCache('/tmp/data/cache.json', valid, {
    mkdir: async (...args) => calls.push(['mkdir', ...args]),
    writeFile: async (...args) => calls.push(['write', ...args]),
    rename: async (...args) => calls.push(['rename', ...args]),
    rm: async (...args) => calls.push(['rm', ...args]),
    random: () => 'fixed',
  });
  assert.match(calls[1][1], /cache\.json\.fixed\.tmp$/);
  assert.equal(calls[1][2], `${JSON.stringify(valid)}\n`);
  assert.deepEqual(calls[2].slice(0, 3), ['rename', '/tmp/data/cache.json.fixed.tmp', '/tmp/data/cache.json']);
});

test('uses a six-hour cache freshness window', () => {
  const fetchedAt = Date.parse(valid.fetchedAt);
  assert.equal(isCacheFresh(valid, fetchedAt + 6 * 60 * 60 * 1000 - 1), true);
  assert.equal(isCacheFresh(valid, fetchedAt + 6 * 60 * 60 * 1000), false);
});
