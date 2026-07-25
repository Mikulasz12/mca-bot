import { createMinecraftCacheStore, isMinecraftCacheFresh, MINECRAFT_CACHE_FRESH_MS, MINECRAFT_CACHE_SCHEMA_VERSION, MINECRAFT_CACHE_SOURCE } from './cache.js';
import { hasMinecraftVersion, minecraftManifestStats, normaliseMinecraftManifest } from './catalogue.js';

export const DEFAULT_MINECRAFT_CACHE_PATH = 'data/mojang-minecraft-versions.json';
export const MINECRAFT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createMinecraftVersionService({
  client,
  cachePath = DEFAULT_MINECRAFT_CACHE_PATH,
  cacheStore = createMinecraftCacheStore(cachePath),
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  refreshIntervalMs = MINECRAFT_REFRESH_INTERVAL_MS,
  freshnessMs = MINECRAFT_CACHE_FRESH_MS,
  logger = console,
} = {}) {
  if (!client?.fetchManifest) throw new TypeError('A Mojang Minecraft manifest client is required');

  let versions = [];
  let latest = { release: null, snapshot: null };
  let fetchedAt = null;
  let source = 'unavailable';
  let currentRevision = 0;
  let refreshPromise = null;
  let intervalHandle = null;
  let nextRefreshAt = null;
  let lastError = null;
  let started = false;

  function document() {
    return fetchedAt ? {
      schemaVersion: MINECRAFT_CACHE_SCHEMA_VERSION,
      source: MINECRAFT_CACHE_SOURCE,
      fetchedAt,
      latest,
      versions,
    } : null;
  }

  function status() {
    const cacheDocument = document();
    return Object.freeze({
      available: versions.length > 0,
      source,
      fetchedAt,
      stale: cacheDocument ? !isMinecraftCacheFresh(cacheDocument, now(), freshnessMs) : true,
      refreshing: Boolean(refreshPromise),
      revision: currentRevision,
      nextRefreshAt,
      lastError,
      ...minecraftManifestStats(versions, latest),
    });
  }

  function refresh({ reason = 'automatic' } = {}) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const manifest = await client.fetchManifest();
        const normalised = normaliseMinecraftManifest(manifest);
        if (normalised.length === 0) throw new Error('Mojang returned no usable Minecraft version records');
        const refreshedAt = new Date(now()).toISOString();
        const nextDocument = {
          schemaVersion: MINECRAFT_CACHE_SCHEMA_VERSION,
          source: MINECRAFT_CACHE_SOURCE,
          fetchedAt: refreshedAt,
          latest: {
            release: manifest.latest?.release ?? null,
            snapshot: manifest.latest?.snapshot ?? null,
          },
          versions: normalised,
        };
        await cacheStore.write(nextDocument);
        versions = normalised;
        latest = nextDocument.latest;
        fetchedAt = refreshedAt;
        source = 'network';
        currentRevision += 1;
        lastError = null;
        nextRefreshAt = new Date(now() + refreshIntervalMs).toISOString();
        logger.info?.(`Refreshed ${normalised.length} Mojang Minecraft version records (${reason}).`);
        return { ok: true, reason, revision: currentRevision, status: status() };
      } catch (error) {
        lastError = errorText(error);
        logger.error?.(`Failed to refresh Mojang Minecraft version manifest: ${lastError}`);
        return { ok: false, reason, error: lastError, status: status() };
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  return {
    async start() {
      if (started) return status();
      started = true;
      const cached = await cacheStore.load();
      if (cached) {
        versions = Object.freeze([...(cached.versions ?? [])]);
        latest = Object.freeze({ ...(cached.latest ?? {}) });
        fetchedAt = cached.fetchedAt;
        source = 'disk';
        currentRevision += 1;
      }
      nextRefreshAt = new Date(now() + refreshIntervalMs).toISOString();
      intervalHandle = setIntervalFn(() => {
        nextRefreshAt = new Date(now() + refreshIntervalMs).toISOString();
        void refresh({ reason: 'automatic' });
      }, refreshIntervalMs);
      if (!cached || !isMinecraftCacheFresh(cached, now(), freshnessMs)) {
        void refresh({ reason: cached ? 'stale-startup' : 'missing-startup' });
      }
      return status();
    },

    stop() {
      if (intervalHandle !== null) clearIntervalFn(intervalHandle);
      intervalHandle = null;
      nextRefreshAt = null;
      started = false;
    },

    refresh,
    catalogue: () => versions,
    hasVersion: (candidate) => hasMinecraftVersion(versions, candidate),
    revision: () => currentRevision,
    status,
  };
}
