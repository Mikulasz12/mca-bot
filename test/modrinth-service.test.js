import assert from 'node:assert/strict';
import test from 'node:test';

import { createCatalogueService } from '../src/modrinth/service.js';

const cachedTuple = ['7.7.22', ['1.21.1'], ['fabric'], 'r', 1752969600, 'cached'];
const rawEntry = { id: 'network', version_number: '8.1.2+26.2', game_versions: ['26.2'], loaders: ['neoforge'], version_type: 'release', status: 'listed', date_published: '2026-07-25T00:00:00Z' };

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

test('loads compact disk cache and builds indexes', async () => {
  const { service } = harness({ cache: { schemaVersion: 2, fetchedAt: '2026-07-25T20:00:00Z', versions: [cachedTuple] } });
  await service.start();
  const status = service.status();
  assert.equal(status.source, 'disk');
  assert.equal(status.recordCount, 1);
  assert.equal(status.stale, false);
  assert.equal(status.cacheBytes > 0, true);
  assert.equal(service.catalogue().byMcaVersion.has('7.7.22'), true);
});

test('manual refresh writes compact tuples and updates indexes', async () => {
  const { service, writes } = harness();
  await service.start();
  const result = await service.refresh({ reason: 'manual' });
  assert.equal(result.ok, true);
  assert.equal(service.status().source, 'network');
  assert.equal(service.status().recordCount, 1);
  assert.deepEqual(writes.at(-1).versions[0], ['8.1.2', ['26.2'], ['neoforge'], 'r', Math.floor(Date.parse('2026-07-25T00:00:00Z') / 1000), 'network']);
});

test('joins concurrent refreshes', async () => {
  let resolveFetch;
  let calls = 0;
  const { service } = harness({ fetchVersions: () => { calls += 1; return new Promise((resolve) => { resolveFetch = resolve; }); } });
  const first = service.refresh({ reason: 'manual' });
  const second = service.refresh({ reason: 'manual' });
  assert.strictEqual(first, second);
  resolveFetch([rawEntry]);
  await first;
  assert.equal(calls, 1);
});

test('failed refresh preserves stale indexed cache', async () => {
  const { service } = harness({
    cache: { schemaVersion: 2, fetchedAt: '2026-07-24T00:00:00Z', versions: [cachedTuple] },
    fetchVersions: async () => { throw new Error('offline'); },
  });
  await service.start();
  const result = await service.refresh({ reason: 'manual' });
  assert.equal(result.ok, false);
  assert.equal(service.status().recordCount, 1);
  assert.equal(service.status().lastError, 'offline');
});
