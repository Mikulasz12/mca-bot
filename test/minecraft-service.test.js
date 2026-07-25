import assert from 'node:assert/strict';
import test from 'node:test';

import { createMinecraftVersionService } from '../src/minecraft/service.js';

const cachedVersion = Object.freeze({
  id: '1.21.1', canonicalId: '1.21.1', type: 'release', url: 'cached',
  updatedAt: '2024-08-08T00:00:00Z', releasedAt: '2024-08-08T00:00:00Z',
  sha1: 'a'.repeat(40), complianceLevel: 1,
});
const networkManifest = {
  latest: { release: '26.2', snapshot: '26.2' },
  versions: [{
    id: '26.2', type: 'release', url: 'network', time: '2026-07-20T00:00:00Z',
    releaseTime: '2026-07-20T00:00:00Z', sha1: 'b'.repeat(40), complianceLevel: 1,
  }],
};

function harness({ cache = null, fetchManifest = async () => networkManifest } = {}) {
  const writes = [];
  const service = createMinecraftVersionService({
    client: { fetchManifest },
    cacheStore: { load: async () => cache, write: async (document) => writes.push(document) },
    now: () => Date.parse('2026-07-25T22:00:00Z'),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    logger: { info() {}, error() {} },
  });
  return { service, writes };
}

test('loads cached Mojang versions and exposes existence checks', async () => {
  const { service } = harness({
    cache: {
      schemaVersion: 1,
      source: 'mojang-version-manifest-v2',
      fetchedAt: '2026-07-25T20:00:00Z',
      latest: { release: '26.2', snapshot: '26.2' },
      versions: [cachedVersion],
    },
  });
  await service.start();
  assert.equal(service.hasVersion('1.21.1'), true);
  assert.equal(service.hasVersion('1.23.4'), false);
  assert.equal(service.status().versionCount, 1);
});

test('manual refresh normalises and atomically publishes Mojang versions', async () => {
  const { service, writes } = harness();
  const result = await service.refresh({ reason: 'manual' });
  assert.equal(result.ok, true);
  assert.equal(service.hasVersion('26.2'), true);
  assert.equal(service.status().latestRelease, '26.2');
  assert.equal(writes.length, 1);
});
