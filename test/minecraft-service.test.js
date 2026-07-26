import assert from 'node:assert/strict';
import test from 'node:test';

import { createMinecraftVersionService } from '../src/minecraft/service.js';

const networkManifest = {
  latest: { release: '26.2', snapshot: '26w30a' },
  versions: [{ id: '26.2', type: 'release' }, { id: '26w30a', type: 'snapshot' }],
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

test('loads compact cached release IDs and exposes indexed existence checks', async () => {
  const { service } = harness({ cache: { schemaVersion: 2, fetchedAt: '2026-07-25T20:00:00Z', latestRelease: '26.2', versions: ['1.21.1'] } });
  await service.start();
  assert.equal(service.hasVersion('1.21.1'), true);
  assert.equal(service.hasVersion('1.23.4'), false);
  assert.equal(service.catalogue() instanceof Set, true);
  assert.equal(service.status().releaseCount, 1);
  assert.equal(service.status().cacheBytes > 0, true);
});

test('manual refresh stores releases only and builds the runtime Set', async () => {
  const { service, writes } = harness();
  const result = await service.refresh({ reason: 'manual' });
  assert.equal(result.ok, true);
  assert.equal(service.hasVersion('26.2'), true);
  assert.equal(service.hasVersion('26w30a'), false);
  assert.equal(service.status().latestRelease, '26.2');
  assert.deepEqual(writes[0].versions, ['26.2']);
});
