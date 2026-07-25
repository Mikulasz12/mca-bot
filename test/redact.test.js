import assert from 'node:assert/strict';
import test from 'node:test';

import { redactSensitiveText } from '../src/export/redact.js';

test('redacts Discord webhook URLs', () => {
  const input = 'send to https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123';
  assert.equal(redactSensitiveText(input), 'send to [REDACTED_DISCORD_WEBHOOK]');
});

test('redacts Discord token-like strings', () => {
  const token = 'ABCDEFGHIJKLMNOPQRSTUVWX.abcdef.ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
  assert.equal(redactSensitiveText(`token=${token}`), 'token=[REDACTED_DISCORD_TOKEN]');
});

test('preserves Minecraft and MCA version strings', () => {
  const input = 'Minecraft 1.21.1 with mca-neoforge-7.7.18+1.21.1.jar';
  assert.equal(redactSensitiveText(input), input);
});
