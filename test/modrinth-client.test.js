import assert from 'node:assert/strict';
import test from 'node:test';

import { createModrinthClient, MODRINTH_API_URL, MODRINTH_USER_AGENT } from '../src/modrinth/client.js';

function response({ ok = true, status = 200, json = [], headers = {} } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    async json() { return json; },
  };
}

test('fetches the MCA catalogue without changelogs using the project user agent', async () => {
  const calls = [];
  const client = createModrinthClient({
    fetchImpl: async (...args) => { calls.push(args); return response({ json: [{ id: 'a' }] }); },
    setTimer: () => 1,
    clearTimer: () => {},
  });
  assert.deepEqual(await client.fetchVersions(), [{ id: 'a' }]);
  assert.equal(calls[0][0], MODRINTH_API_URL);
  assert.equal(calls[0][1].headers['User-Agent'], MODRINTH_USER_AGENT);
});

test('reports rate limiting and endpoint removal', async () => {
  const rateLimited = createModrinthClient({
    fetchImpl: async () => response({ ok: false, status: 429, headers: { 'x-ratelimit-reset': '1785016800' } }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await assert.rejects(rateLimited.fetchVersions(), (error) => error.code === 'rate-limited' && error.retryAt instanceof Date);

  const gone = createModrinthClient({
    fetchImpl: async () => response({ ok: false, status: 410 }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await assert.rejects(gone.fetchVersions(), (error) => error.code === 'gone');
});

test('rejects malformed and server-error responses', async () => {
  const malformed = createModrinthClient({
    fetchImpl: async () => response({ json: {} }), setTimer: () => 1, clearTimer: () => {},
  });
  await assert.rejects(malformed.fetchVersions(), /array/);

  const serverError = createModrinthClient({
    fetchImpl: async () => response({ ok: false, status: 503 }), setTimer: () => 1, clearTimer: () => {},
  });
  await assert.rejects(serverError.fetchVersions(), (error) => error.status === 503);
});
