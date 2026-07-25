import assert from 'node:assert/strict';
import test from 'node:test';

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { createCacheInteractionHandler } from '../src/discord/cache-handler.js';

function makeInteraction({ guildId = '747184859386085380', admin = true, subcommand = 'status' } = {}) {
  const replies = [];
  const edits = [];
  const defers = [];
  return {
    commandName: 'cache',
    guildId,
    memberPermissions: { has: (permission) => admin && permission === PermissionFlagsBits.Administrator },
    options: { getSubcommand: () => subcommand },
    isChatInputCommand: () => true,
    async reply(payload) { replies.push(payload); },
    async deferReply(payload) { defers.push(payload); },
    async editReply(payload) { edits.push(payload); },
    replies,
    edits,
    defers,
  };
}

function cacheStatus(overrides = {}) {
  return {
    available: true,
    source: 'disk',
    fetchedAt: '2026-07-25T20:00:00.000Z',
    stale: false,
    refreshing: false,
    revision: 2,
    nextRefreshAt: '2026-07-26T02:00:00.000Z',
    blockedUntil: null,
    disabledReason: null,
    lastError: null,
    recordCount: 123,
    listedRecordCount: 120,
    uniqueMcaVersionCount: 40,
    minecraftVersionCount: 8,
    loaderCount: 3,
    loaders: ['fabric', 'forge', 'neoforge'],
    ...overrides,
  };
}

function makeService(initial = cacheStatus()) {
  let current = initial;
  let refreshCalls = 0;
  return {
    status: () => current,
    revision: () => current.revision,
    async refresh() {
      refreshCalls += 1;
      current = cacheStatus({ source: 'network', revision: current.revision + 1, recordCount: 130 });
      return { ok: true, status: current };
    },
    get refreshCalls() { return refreshCalls; },
  };
}

test('rejects DMs other guilds and non-admin users ephemerally', async () => {
  const handler = createCacheInteractionHandler({
    config: { allowedGuildId: '747184859386085380' },
    catalogueService: makeService(),
  });
  for (const interaction of [
    makeInteraction({ guildId: null }),
    makeInteraction({ guildId: '111111111111111111' }),
    makeInteraction({ admin: false }),
  ]) {
    assert.equal(await handler(interaction), true);
    assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
    assert.match(interaction.replies[0].content, /Administrator/i);
  }
});

test('status reports indexed records loaders and last update', async () => {
  const handler = createCacheInteractionHandler({
    config: { allowedGuildId: '747184859386085380' },
    catalogueService: makeService(),
    now: () => new Date('2026-07-25T22:00:00.000Z'),
  });
  const interaction = makeInteraction();
  await handler(interaction);
  const payload = JSON.stringify(interaction.replies[0]);
  assert.match(payload, /123/);
  assert.match(payload, /fabric/);
  assert.match(payload, /2026-07-25T20:00:00.000Z/);
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
});

test('update defers ephemerally and refreshes once', async () => {
  const catalogueService = makeService();
  const handler = createCacheInteractionHandler({
    config: { allowedGuildId: '747184859386085380' },
    catalogueService,
  });
  const interaction = makeInteraction({ subcommand: 'update' });
  await handler(interaction);
  assert.equal(interaction.defers[0].flags, MessageFlags.Ephemeral);
  assert.equal(catalogueService.refreshCalls, 1);
  assert.match(JSON.stringify(interaction.edits[0]), /130/);
});
