import assert from 'node:assert/strict';
import test from 'node:test';

import { createMinecraftVersionIndex, hasMinecraftVersion, minecraftManifestStats, normaliseMinecraftManifest } from '../src/minecraft/catalogue.js';

const manifest = {
  latest: { release: '26.2', snapshot: '26w30a' },
  versions: [
    { id: '26.2', type: 'release' },
    { id: '1.21.1', type: 'release' },
    { id: '26w30a', type: 'snapshot' },
    { id: '1.21.11-rc2', type: 'snapshot' },
    { id: 123, type: 'release' },
  ],
};

test('normalises only Mojang releases into canonical IDs', () => {
  const versions = normaliseMinecraftManifest(manifest);
  assert.deepEqual(versions, ['26.2', '1.21.1']);
  assert.equal(Object.isFrozen(versions), true);
});

test('uses a Set index for exact canonical release checks', () => {
  const index = createMinecraftVersionIndex(normaliseMinecraftManifest(manifest));
  assert.equal(hasMinecraftVersion(index, '1.21.1'), true);
  assert.equal(hasMinecraftVersion(index, '1.21.11-rc.2'), false);
  assert.equal(hasMinecraftVersion(index, '1.23.4'), false);
});

test('reports release-only Mojang index statistics', () => {
  const versions = normaliseMinecraftManifest(manifest);
  assert.deepEqual(minecraftManifestStats(versions, manifest.latest.release), { versionCount: 2, releaseCount: 2, latestRelease: '26.2' });
});
