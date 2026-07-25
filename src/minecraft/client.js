export const MINECRAFT_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
export const MINECRAFT_MANIFEST_USER_AGENT = 'Mikulasz12/mca-bot/0.1.0 (https://github.com/Mikulasz12/mca-bot)';

function requestError(message, { status = null, code = 'request-failed' } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function createMinecraftManifestClient({
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');

  return {
    async fetchManifest() {
      const controller = new AbortController();
      const timeout = setTimer(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(MINECRAFT_MANIFEST_URL, {
          headers: {
            'User-Agent': MINECRAFT_MANIFEST_USER_AGENT,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw requestError(`Mojang version manifest request failed with HTTP ${response.status}`, {
            status: response.status,
          });
        }
        const body = await response.json();
        if (!body || typeof body !== 'object' || !Array.isArray(body.versions)) {
          throw requestError('Mojang version manifest must contain a versions array', {
            code: 'invalid-response',
          });
        }
        return body;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw requestError(`Mojang version manifest request timed out after ${timeoutMs}ms`, {
            code: 'timeout',
          });
        }
        throw error;
      } finally {
        clearTimer(timeout);
      }
    },
  };
}
