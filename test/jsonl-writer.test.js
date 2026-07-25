import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createAtomicJsonlWriter } from '../src/export/jsonl-writer.js';

async function doesNotExist(filePath) {
  try {
    await access(filePath);
    return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

test('writes one JSON object per line and atomically publishes the output', async () => {
  const exportDir = await mkdtemp(path.join(os.tmpdir(), 'mca-export-'));
  const writer = await createAtomicJsonlWriter({
    exportDir,
    now: new Date('2026-07-25T20:32:07.123Z'),
  });

  assert.equal(path.basename(writer.outputPath), 'mca-thread-scan-2026-07-25T20-32-07.123Z.jsonl');
  assert.equal(await doesNotExist(writer.outputPath), true);

  await writer.append({ id: 1 });
  await writer.append({ id: 2 });
  await writer.commit();

  assert.equal(await readFile(writer.outputPath, 'utf8'), '{"id":1}\n{"id":2}\n');
  assert.equal(await doesNotExist(`${writer.outputPath}.tmp`), true);
});

test('removes the temporary file when aborted', async () => {
  const exportDir = await mkdtemp(path.join(os.tmpdir(), 'mca-export-'));
  const writer = await createAtomicJsonlWriter({
    exportDir,
    now: new Date('2026-07-25T20:32:07.123Z'),
  });

  await writer.append({ id: 1 });
  await writer.abort();

  assert.equal(await doesNotExist(writer.outputPath), true);
  assert.equal(await doesNotExist(`${writer.outputPath}.tmp`), true);
});
