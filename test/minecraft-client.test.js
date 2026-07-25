import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMinecraftManifestClient,
  MINECRAFT_MANIFEST_URL,
  MINECRAFT_MANIFEST_USER_AGENT,
} from '../src/minecraft/client.js';

function response({ ok = true, status = 200, json = { latest: {}, versions: [] } } = {}) {
  return { ok, status, async json() { return json; } };
}

test('fetches Mojang version_manifest_v2 with an identifying user agent', async () => {
  const calls = [];
  const client = createMinecraftManifestClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return response({ json: { latest: { release: '26.2', snapshot: '26.2' }, versions: [] } });
    },
    setTimer: () => 1,
    clearTimer: () => {},
  });

  const result = await client.fetchManifest();
  assert.equal(result.latest.release, '26.2');
  assert.equal(calls[0][0], MINECRAFT_MANIFEST_URL);
  assert.equal(calls[0][1].headers['User-Agent'], MINECRAFT_MANIFEST_USER_AGENT);
});

test('rejects malformed Mojang manifests and HTTP failures', async () => {
  const malformed = createMinecraftManifestClient({
    fetchImpl: async () => response({ json: [] }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await assert.rejects(malformed.fetchManifest(), /versions array/i);

  const failed = createMinecraftManifestClient({
    fetchImpl: async () => response({ ok: false, status: 503 }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await assert.rejects(failed.fetchManifest(), (error) => error.status === 503);
});
