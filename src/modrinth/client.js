export const MODRINTH_API_URL = 'https://api.modrinth.com/v2/project/1W98a849/version?include_changelog=false';
export const MODRINTH_USER_AGENT = 'Mikulasz12/mca-bot/0.1.0 (https://github.com/Mikulasz12/mca-bot)';

function apiError(message, { status = null, code = 'request-failed', retryAt = null } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.retryAt = retryAt;
  return error;
}

function parseRetryAt(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 1e12 ? numeric : numeric > 1e9 ? numeric * 1000 : Date.now() + numeric * 1000;
    return new Date(milliseconds);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function createModrinthClient({
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');

  return {
    async fetchVersions() {
      const controller = new AbortController();
      const timeout = setTimer(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(MODRINTH_API_URL, {
          headers: {
            'User-Agent': MODRINTH_USER_AGENT,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        if (response.status === 429) {
          throw apiError('Modrinth rate limit reached', {
            status: 429,
            code: 'rate-limited',
            retryAt: parseRetryAt(response.headers?.get?.('x-ratelimit-reset')),
          });
        }
        if (response.status === 410) {
          throw apiError('Modrinth API endpoint is no longer available', { status: 410, code: 'gone' });
        }
        if (!response.ok) {
          throw apiError(`Modrinth request failed with HTTP ${response.status}`, { status: response.status });
        }

        const body = await response.json();
        if (!Array.isArray(body)) throw apiError('Modrinth version response must be an array', { code: 'invalid-response' });
        return body;
      } catch (error) {
        if (error?.name === 'AbortError') throw apiError(`Modrinth request timed out after ${timeoutMs}ms`, { code: 'timeout' });
        throw error;
      } finally {
        clearTimer(timeout);
      }
    },
  };
}
