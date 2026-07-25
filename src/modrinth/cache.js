import { dirname } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

export const CACHE_SCHEMA_VERSION = 1;
export const MCA_PROJECT_ID = '1W98a849';
export const CACHE_FRESH_MS = 6 * 60 * 60 * 1000;

function validDocument(document) {
  return document && document.schemaVersion === CACHE_SCHEMA_VERSION &&
    document.projectId === MCA_PROJECT_ID &&
    typeof document.fetchedAt === 'string' && Number.isFinite(Date.parse(document.fetchedAt)) &&
    Array.isArray(document.versions);
}

export async function loadCatalogueCache(path, { readFile: read = readFile } = {}) {
  try {
    const raw = await read(path, 'utf8');
    const document = JSON.parse(String(raw));
    return validDocument(document) ? document : null;
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError || error instanceof TypeError) return null;
    return null;
  }
}

export async function writeCatalogueCache(path, document, {
  mkdir: makeDirectory = mkdir,
  writeFile: write = writeFile,
  rename: move = rename,
  rm: remove = rm,
  random = () => `${process.pid}-${Date.now()}`,
} = {}) {
  if (!validDocument(document)) throw new TypeError('Invalid Modrinth cache document');
  await makeDirectory(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${random()}.tmp`;
  try {
    await write(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await move(temporaryPath, path);
  } catch (error) {
    await remove(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function isCacheFresh(document, nowMs = Date.now(), freshnessMs = CACHE_FRESH_MS) {
  if (!validDocument(document)) return false;
  const age = nowMs - Date.parse(document.fetchedAt);
  return age >= 0 && age < freshnessMs;
}

export function createDefaultCacheStore(path) {
  return {
    load: () => loadCatalogueCache(path),
    write: (document) => writeCatalogueCache(path, document),
  };
}
