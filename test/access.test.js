import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeScanExport } from '../src/access.js';

const config = {
  ownerUserId: '245983842672967680',
  allowedGuildId: '747184859386085380',
  scanExportRoleIds: ['999999999999999999'],
};

test('allows the owner in a bot DM', () => {
  assert.deepEqual(
    authorizeScanExport({ userId: config.ownerUserId, guildId: null, roleIds: [] }, config),
    { allowed: true, reason: 'owner-dm' },
  );
});

test('rejects another user in a bot DM', () => {
  assert.deepEqual(
    authorizeScanExport({ userId: '111111111111111111', guildId: null, roleIds: [] }, config),
    { allowed: false, reason: 'dm-owner-only' },
  );
});

test('allows the owner in the configured guild', () => {
  assert.deepEqual(
    authorizeScanExport({ userId: config.ownerUserId, guildId: config.allowedGuildId, roleIds: [] }, config),
    { allowed: true, reason: 'owner-guild' },
  );
});

test('rejects the owner in another guild', () => {
  assert.deepEqual(
    authorizeScanExport({ userId: config.ownerUserId, guildId: '333333333333333333', roleIds: [] }, config),
    { allowed: false, reason: 'wrong-guild' },
  );
});

test('allows a configured role in the configured guild', () => {
  assert.deepEqual(
    authorizeScanExport(
      { userId: '111111111111111111', guildId: config.allowedGuildId, roleIds: ['999999999999999999'] },
      config,
    ),
    { allowed: true, reason: 'configured-role' },
  );
});

test('does not allow a configured role in another guild', () => {
  assert.deepEqual(
    authorizeScanExport(
      { userId: '111111111111111111', guildId: '333333333333333333', roleIds: ['999999999999999999'] },
      config,
    ),
    { allowed: false, reason: 'wrong-guild' },
  );
});
