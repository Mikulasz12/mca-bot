import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

function timestampForFilename(date) {
  return date.toISOString().replaceAll(':', '-');
}

export async function createAtomicJsonlWriter({ exportDir, now = new Date() }) {
  await mkdir(exportDir, { recursive: true });

  const outputPath = path.resolve(exportDir, `mca-thread-scan-${timestampForFilename(now)}.jsonl`);
  const temporaryPath = `${outputPath}.tmp`;
  const handle = await open(temporaryPath, 'wx');
  let state = 'open';

  function assertOpen() {
    if (state !== 'open') {
      throw new Error(`JSONL writer is ${state}`);
    }
  }

  return {
    outputPath,

    async append(record) {
      assertOpen();
      await handle.appendFile(`${JSON.stringify(record)}\n`, 'utf8');
    },

    async commit() {
      assertOpen();
      await handle.sync();
      await handle.close();
      await rename(temporaryPath, outputPath);
      state = 'committed';
      return outputPath;
    },

    async abort() {
      if (state !== 'open') return;
      state = 'aborted';
      await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true });
    },
  };
}
