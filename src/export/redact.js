const DISCORD_WEBHOOK_PATTERN = /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]+/gi;
const DISCORD_TOKEN_PATTERN = /\b(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,})\b/g;

export function redactSensitiveText(text) {
  return String(text ?? '')
    .replace(DISCORD_WEBHOOK_PATTERN, '[REDACTED_DISCORD_WEBHOOK]')
    .replace(DISCORD_TOKEN_PATTERN, '[REDACTED_DISCORD_TOKEN]');
}
