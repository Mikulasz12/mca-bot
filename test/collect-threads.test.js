import assert from 'node:assert/strict';
import test from 'node:test';

import { collectThreads } from '../src/scan/collect-threads.js';

const thread = (id, archivedAtTimestamp) => ({ id, archivedAtTimestamp });

test('collects active and paginated archived threads without duplicates', async () => {
  const calls = [];
  const pages = [
    {
      threads: [thread('30', 300), thread('20', 200)],
      hasMore: true,
    },
    {
      threads: [thread('20', 200), thread('10', 100)],
      hasMore: false,
    },
  ];

  const result = await collectThreads({
    fetchActive: async () => [thread('40', null), thread('30', null)],
    fetchArchived: async ({ before }) => {
      calls.push(before?.id ?? null);
      return pages.shift();
    },
  });

  assert.deepEqual(result.map(({ id }) => id), ['40', '30', '20', '10']);
  assert.deepEqual(calls, [null, '20']);
});

test('stops when an archived page is empty even if hasMore is true', async () => {
  let calls = 0;
  const result = await collectThreads({
    fetchActive: async () => [],
    fetchArchived: async () => {
      calls += 1;
      return { threads: [], hasMore: true };
    },
  });

  assert.deepEqual(result, []);
  assert.equal(calls, 1);
});

test('stops when Discord repeats the same pagination cursor', async () => {
  let calls = 0;
  const repeated = thread('10', 100);
  const result = await collectThreads({
    fetchActive: async () => [],
    fetchArchived: async () => {
      calls += 1;
      return { threads: [repeated], hasMore: true };
    },
  });

  assert.deepEqual(result.map(({ id }) => id), ['10']);
  assert.equal(calls, 2);
});
