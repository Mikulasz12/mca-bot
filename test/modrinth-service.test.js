import assert from 'node:assert/strict';
import test from 'node:test';

import { createCatalogueService } from '../src/modrinth/service.js';

const cachedEntry = Object.freeze({
  id: 'cached', mcaVersion: '7.7.22', versionNumber: '7.7.22+1.21.1',
  minecraftVersions: ['1.21.1'], loaders: ['fabric'], versionType: 'release',
  status: 'listed', publishedAt: '2026-07-20T00:00:00Z', filename: 'cached.jar', url: 'cached',
});
const rawEntry = {
  id: 'network', version_number: '8.1.2+26.2', game_versions: ['26.2'], loaders: ['neoforge'],
  version_type: 'release', status: 'listed', date_published: '2026-07-25T00:00:00Z',
  files: [{ primary: true, filename: 'network.jar' }],
};

function harness({ cache = null, fetchVersions = async () => [rawEntry] } = {}) {
  const writes = [];
  const intervals = [];
  const service = createCatalogueService({
    client: { fetchVersions },
    cacheStore: { load: async () => cache, write: async (document) => writes.push(document) },
    now: () => Date.parse('2026-07-25T22:00:00Z'),
    setIntervalFn: (callback, delay) => { intervals.push({ callback, delay }); return intervals.length; },
    clearIntervalFn: () => {},
    logger: { info() {}, error() {} },
  });
  return { service, writes, intervals };
}

test('loads fresh disk cache and reports indexed status', async () => {
  const { service } = harness({
    cache: { schemaVersion: 1, projectId: '1W98a849', fetchedAt: '2026-07-25T20:00:00Z', versions: [cachedEntry] },
  });
  await service.start();
  const status = service.status();
  assert.equal(status.source, 'disk');
  assert.equal(status.recordCount, 1);
  assert.equal(status.stale, false);
});

test('manual refresh updates memory and disk cache', async () => {
  const { service, writes } = harness();
  await service.start();
  const result = await service.refresh({ reason: 'manual' });
  assert.equal(result.ok, true);
  assert.equal(service.status().source, 'network');
  assert.equal(service.status().recordCount, 1);
  assert.equal(writes.length >= 1, true);
});

test('joins concurrent refreshes', async () => {
  let resolveFetch;
  let calls = 0;
  const { service } = harness({
    fetchVersions: () => { calls += 1; return new Promise((resolve) => { resolveFetch = resolve; }); },
  });
  const first = service.refresh({ reason: 'manual' });
  const second = service.refresh({ reason: 'manual' });
  assert.strictEqual(first, second);
  resolveFetch([rawEntry]);
  await first;
  assert.equal(calls, 1);
});

test('failed refresh preserves stale cache', async () => {
  const { service } = harness({
    cache: { schemaVersion: 1, projectId: '1W98a849', fetchedAt: '2026-07-24T00:00:00Z', versions: [cachedEntry] },
    fetchVersions: async () => { throw new Error('offline'); },
  });
  await service.start();
  const result = await service.refresh({ reason: 'manual' });
  assert.equal(result.ok, false);
  assert.equal(service.status().recordCount, 1);
  assert.equal(service.status().lastError, 'offline');
});
