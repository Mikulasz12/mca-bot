import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

const baseEnv = {
  DISCORD_TOKEN: 'test-token',
};

test('loads approved defaults and comma-separated role ids', () => {
  const config = loadConfig({
    ...baseEnv,
    SCAN_EXPORT_ROLE_IDS: '111111111111111111, 222222222222222222',
  });

  assert.equal(config.token, 'test-token');
  assert.equal(config.ownerUserId, '245983842672967680');
  assert.equal(config.allowedGuildId, '747184859386085380');
  assert.deepEqual(config.forumChannelIds, ['1082779790714613840', '1131690144160825455']);
  assert.deepEqual(config.scanExportRoleIds, ['111111111111111111', '222222222222222222']);
  assert.equal(config.exportDir, './exports');
});

test('requires a Discord token', () => {
  assert.throws(() => loadConfig({}), /DISCORD_TOKEN is required/);
});

test('rejects malformed snowflakes', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, OWNER_USER_ID: 'not-an-id' }),
    /OWNER_USER_ID must be a Discord snowflake/,
  );
});

test('requires at least one forum channel id', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, FORUM_CHANNEL_IDS: ' , ' }),
    /FORUM_CHANNEL_IDS must contain at least one Discord snowflake/,
  );
});
