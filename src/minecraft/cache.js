import { dirname } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

export const MINECRAFT_CACHE_SCHEMA_VERSION = 2;
export const MINECRAFT_CACHE_FRESH_MS = 6 * 60 * 60 * 1000;

function validDocument(document) {
  return document && document.schemaVersion === MINECRAFT_CACHE_SCHEMA_VERSION &&
    typeof document.fetchedAt === 'string' && Number.isFinite(Date.parse(document.fetchedAt)) &&
    (document.latestRelease === null || typeof document.latestRelease === 'string') &&
    Array.isArray(document.versions) && document.versions.every((version) => typeof version === 'string');
}

export async function loadMinecraftVersionCache(path, { readFile: read = readFile } = {}) {
  try {
    const document = JSON.parse(String(await read(path, 'utf8')));
    return validDocument(document) ? document : null;
  } catch {
    return null;
  }
}

export async function writeMinecraftVersionCache(path, document, {
  mkdir: makeDirectory = mkdir,
  writeFile: write = writeFile,
  rename: move = rename,
  rm: remove = rm,
  random = () => `${process.pid}-${Date.now()}`,
} = {}) {
  if (!validDocument(document)) throw new TypeError('Invalid Minecraft version cache document');
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

export function isMinecraftCacheFresh(document, nowMs = Date.now(), freshnessMs = MINECRAFT_CACHE_FRESH_MS) {
  if (!validDocument(document)) return false;
  const age = nowMs - Date.parse(document.fetchedAt);
  return age >= 0 && age < freshnessMs;
}

export function createMinecraftCacheStore(path) {
  return {
    load: () => loadMinecraftVersionCache(path),
    write: (document) => writeMinecraftVersionCache(path, document),
  };
}
