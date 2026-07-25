import { catalogueStats, normaliseModrinthVersions } from './catalogue.js';
import { CACHE_FRESH_MS, CACHE_SCHEMA_VERSION, MCA_PROJECT_ID, createDefaultCacheStore, isCacheFresh } from './cache.js';

export const DEFAULT_CACHE_PATH = 'data/modrinth-mca-versions.json';
export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createCatalogueService({
  client,
  cachePath = DEFAULT_CACHE_PATH,
  cacheStore = createDefaultCacheStore(cachePath),
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  refreshIntervalMs = REFRESH_INTERVAL_MS,
  freshnessMs = CACHE_FRESH_MS,
  logger = console,
} = {}) {
  if (!client?.fetchVersions) throw new TypeError('A Modrinth client is required');

  let entries = [];
  let fetchedAt = null;
  let source = 'unavailable';
  let currentRevision = 0;
  let refreshPromise = null;
  let intervalHandle = null;
  let nextRefreshAt = null;
  let blockedUntil = null;
  let disabledReason = null;
  let lastError = null;
  let started = false;

  function document() {
    return fetchedAt ? {
      schemaVersion: CACHE_SCHEMA_VERSION,
      projectId: MCA_PROJECT_ID,
      fetchedAt,
      versions: entries,
    } : null;
  }

  function status() {
    const stats = catalogueStats(entries);
    const cacheDocument = document();
    return Object.freeze({
      available: entries.length > 0,
      source,
      fetchedAt,
      stale: cacheDocument ? !isCacheFresh(cacheDocument, now(), freshnessMs) : true,
      refreshing: Boolean(refreshPromise),
      revision: currentRevision,
      nextRefreshAt,
      blockedUntil,
      disabledReason,
      lastError,
      ...stats,
    });
  }

  function refresh({ reason = 'automatic' } = {}) {
    if (refreshPromise) return refreshPromise;
    const nowMs = now();
    if (disabledReason) return Promise.resolve({ ok: false, reason: 'disabled', status: status() });
    if (blockedUntil && Date.parse(blockedUntil) > nowMs) {
      return Promise.resolve({ ok: false, reason: 'rate-limited', status: status() });
    }

    refreshPromise = (async () => {
      try {
        const raw = await client.fetchVersions();
        const normalised = normaliseModrinthVersions(raw);
        if (normalised.length === 0) throw new Error('Modrinth returned no usable version records');
        const refreshedAt = new Date(now()).toISOString();
        const nextDocument = {
          schemaVersion: CACHE_SCHEMA_VERSION,
          projectId: MCA_PROJECT_ID,
          fetchedAt: refreshedAt,
          versions: normalised,
        };
        await cacheStore.write(nextDocument);
        entries = normalised;
        fetchedAt = refreshedAt;
        source = 'network';
        currentRevision += 1;
        blockedUntil = null;
        lastError = null;
        nextRefreshAt = new Date(now() + refreshIntervalMs).toISOString();
        logger.info?.(`Refreshed ${normalised.length} Modrinth MCA version records (${reason}).`);
        return { ok: true, reason, revision: currentRevision, status: status() };
      } catch (error) {
        lastError = errorText(error);
        if (error?.code === 'rate-limited' && error.retryAt instanceof Date) blockedUntil = error.retryAt.toISOString();
        if (error?.code === 'gone') disabledReason = 'Modrinth API endpoint returned HTTP 410; restart after updating the endpoint.';
        logger.error?.(`Failed to refresh Modrinth MCA catalogue: ${lastError}`);
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
        entries = Object.freeze([...(cached.versions ?? [])]);
        fetchedAt = cached.fetchedAt;
        source = 'disk';
        currentRevision += 1;
      }

      nextRefreshAt = new Date(now() + refreshIntervalMs).toISOString();
      intervalHandle = setIntervalFn(() => {
        nextRefreshAt = new Date(now() + refreshIntervalMs).toISOString();
        void refresh({ reason: 'automatic' });
      }, refreshIntervalMs);

      if (!cached || !isCacheFresh(cached, now(), freshnessMs)) void refresh({ reason: cached ? 'stale-startup' : 'missing-startup' });
      return status();
    },

    stop() {
      if (intervalHandle !== null) clearIntervalFn(intervalHandle);
      intervalHandle = null;
      nextRefreshAt = null;
      started = false;
    },

    refresh,
    catalogue: () => entries,
    revision: () => currentRevision,
    status,
  };
}
