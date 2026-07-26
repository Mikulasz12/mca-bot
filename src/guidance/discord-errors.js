const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;

function numericCode(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function collectCodes(error, seen = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) return [];
  seen.add(error);

  const codes = [numericCode(error.code)].filter((code) => code !== null);
  for (const nested of [error.rawError, error.data, error.cause]) {
    codes.push(...collectCodes(nested, seen));
  }
  return codes;
}

function messageMatches(error, pattern) {
  const message = error instanceof Error ? error.message : error?.message;
  return typeof message === 'string' && pattern.test(message);
}

export function isUnknownMessage(error) {
  return collectCodes(error).includes(UNKNOWN_MESSAGE) || messageMatches(error, /\bUnknown Message\b/i);
}

export function isUnknownChannel(error) {
  return collectCodes(error).includes(UNKNOWN_CHANNEL) || messageMatches(error, /\bUnknown Channel\b/i);
}

export function isMissingDiscordResource(error) {
  return isUnknownMessage(error) || isUnknownChannel(error);
}
