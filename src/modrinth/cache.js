import { dirname } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

export const CACHE_SCHEMA_VERSION = 2;
export const CACHE_FRESH_MS = 6 * 60 * 60 * 1000;

function validTuple(tuple) {
  return Array.isArray(tuple) && tuple.length === 6 &&
    typeof tuple[0] === 'string' &&
    Array.isArray(tuple[1]) && tuple[1].every((value) => typeof value === 'string') &&
    Array.isArray(tuple[2]) && tuple[2].every((value) => typeof value === 'string') &&
    ['r', 'b', 'a'].includes(tuple[3]) &&
    Number.isInteger(tuple[4]) &&
    typeof tuple[5] === 'string';
}

function validDocument(document) {
  return document && document.schemaVersion === CACHE_SCHEMA_VERSION &&
    typeof document.fetchedAt === 'string' && Number.isFinite(Date.parse(document.fetchedAt)) &&
    Array.isArray(document.versions) && document.versions.every(validTuple);
}

export async function loadCatalogueCache(path, { readFile: read = readFile } = {}) {
  try {
    const document = JSON.parse(String(await read(path, 'utf8')));
    return validDocument(document) ? document : null;
  } catch {
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
    await write(temporaryPath, `${JSON.stringify(document)}\n`, 'utf8');
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
