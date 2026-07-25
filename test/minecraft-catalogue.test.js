import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasMinecraftVersion,
  minecraftManifestStats,
  normaliseMinecraftManifest,
} from '../src/minecraft/catalogue.js';

const manifest = {
  latest: { release: '26.2', snapshot: '26.2' },
  versions: [
    {
      id: '26.2',
      type: 'release',
      url: 'https://example.invalid/26.2.json',
      time: '2026-07-20T00:00:00Z',
      releaseTime: '2026-07-20T00:00:00Z',
      sha1: 'a'.repeat(40),
      complianceLevel: 1,
    },
    {
      id: '1.21.11-rc2',
      type: 'snapshot',
      url: 'https://example.invalid/1.21.11-rc2.json',
      time: '2025-12-05T00:00:00Z',
      releaseTime: '2025-12-05T00:00:00Z',
      sha1: 'b'.repeat(40),
      complianceLevel: 1,
    },
    { id: 123, type: 'release' },
  ],
};

test('normalises Mojang manifest versions into a flat immutable array', () => {
  const versions = normaliseMinecraftManifest(manifest);
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[0], {
    id: '26.2',
    canonicalId: '26.2',
    type: 'release',
    url: 'https://example.invalid/26.2.json',
    updatedAt: '2026-07-20T00:00:00Z',
    releasedAt: '2026-07-20T00:00:00Z',
    sha1: 'a'.repeat(40),
    complianceLevel: 1,
  });
  assert.equal(Object.isFrozen(versions[0]), true);
});

test('matches user-normalised release-candidate spellings against Mojang IDs', () => {
  const versions = normaliseMinecraftManifest(manifest);
  assert.equal(hasMinecraftVersion(versions, '1.21.11-rc.2'), true);
  assert.equal(hasMinecraftVersion(versions, '1.23.4'), false);
});

test('reports Mojang manifest counts and latest IDs', () => {
  const versions = normaliseMinecraftManifest(manifest);
  assert.deepEqual(minecraftManifestStats(versions, manifest.latest), {
    versionCount: 2,
    releaseCount: 1,
    snapshotCount: 1,
    oldBetaCount: 0,
    oldAlphaCount: 0,
    latestRelease: '26.2',
    latestSnapshot: '26.2',
  });
});
