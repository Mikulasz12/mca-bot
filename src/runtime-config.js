import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DEFAULT_RUNTIME_CONFIG_PATH = 'data/bot-config.json';
export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  retryCadence: 45_000,
  retryCount: 2,
  excludedTagNames: Object.freeze(['Server Help', 'Non-MCA Help', 'Translation Help']),
});

function normalise(input = {}) {
  const retryCadence = Number.isInteger(input.retryCadence) && input.retryCadence >= 5_000 && input.retryCadence <= 86_400_000
    ? input.retryCadence
    : DEFAULT_RUNTIME_CONFIG.retryCadence;
  const retryCount = Number.isInteger(input.retryCount) && input.retryCount >= 0 && input.retryCount <= 10
    ? input.retryCount
    : DEFAULT_RUNTIME_CONFIG.retryCount;
  const excludedTagNames = Array.isArray(input.excludedTagNames)
    ? [...new Set(input.excludedTagNames.map((value) => String(value).trim()).filter(Boolean))].slice(0, 25)
    : [...DEFAULT_RUNTIME_CONFIG.excludedTagNames];
  return Object.freeze({ retryCadence, retryCount, excludedTagNames: Object.freeze(excludedTagNames) });
}

export function createRuntimeConfigService({ path = DEFAULT_RUNTIME_CONFIG_PATH } = {}) {
  let current = DEFAULT_RUNTIME_CONFIG;

  async function save(value) {
    const next = normalise(value);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
    current = next;
    return current;
  }

  return {
    async start() {
      try {
        current = normalise(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
        await save(DEFAULT_RUNTIME_CONFIG);
      }
      return current;
    },
    get: () => current,
    async update(patch) {
      return save({ ...current, ...patch });
    },
  };
}
