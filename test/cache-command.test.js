import assert from 'node:assert/strict';
import test from 'node:test';

import { InteractionContextType, PermissionFlagsBits } from 'discord.js';
import { cacheCommandData } from '../src/discord/cache-command.js';

test('cache command is guild-only and Administrator-only', () => {
  const json = cacheCommandData.toJSON();
  assert.equal(json.name, 'cache');
  assert.deepEqual(json.options.map(({ name }) => name), ['status', 'update']);
  assert.deepEqual(json.contexts, [InteractionContextType.Guild]);
  assert.equal(json.default_member_permissions, String(PermissionFlagsBits.Administrator));
});
