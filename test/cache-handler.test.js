import assert from 'node:assert/strict';
import test from 'node:test';

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { createCacheInteractionHandler } from '../src/discord/cache-handler.js';

function interaction({ guildId = '747184859386085380', admin = true, subcommand = 'status' } = {}) {
  const replies = [];
  const edits = [];
  const defers = [];
  return {
    commandName: 'cache', guildId,
    memberPermissions: { has: (permission) => admin && permission === PermissionFlagsBits.Administrator },
    options: { getSubcommand: () => subcommand },
    isChatInputCommand: () => true,
    async reply(payload) { replies.push(payload); },
    async deferReply(payload) { defers.push(payload); },
    async editReply(payload) { edits.push(payload); },
    replies, edits, defers,
  };
}

function status(overrides = {}) {
  return {
    available: true, source: 'disk', fetchedAt: '2026-07-25T20:00:00.000Z', stale: false,
    refreshing: false, revision: 2, nextRefreshAt: '2026-07-26T02:00:00.000Z',
    blockedUntil: null, disabledReason: null, lastError: null,
    recordCount: 123, uniqueMcaVersionCount: 40, cacheBytes: 4096,
    minecraftVersionCount: 8, loaderCount: 3, loaders: ['fabric', 'forge', 'neoforge'],
    ...overrides,
  };
}

function service(initial = status()) {
  let current = initial;
  let refreshCalls = 0;
  return {
    status: () => current,
    revision: () => current.revision,
    async refresh() { refreshCalls += 1; current = status({ source: 'network', revision: current.revision + 1, recordCount: 130, fetchedAt: '2026-07-25T22:30:00.000Z' }); return { ok: true, status: current }; },
    get refreshCalls() { return refreshCalls; },
  };
}

test('rejects DMs other guilds and non-admin users ephemerally', async () => {
  const handler = createCacheInteractionHandler({ config: { allowedGuildId: '747184859386085380' }, catalogueService: service() });
  for (const input of [interaction({ guildId: null }), interaction({ guildId: '111111111111111111' }), interaction({ admin: false })]) {
    assert.equal(await handler(input), true);
    assert.equal(input.replies[0].flags, MessageFlags.Ephemeral);
    assert.match(input.replies[0].content, /Administrator/i);
  }
});

test('status reports indexed records unique versions loaders and last update', async () => {
  const handler = createCacheInteractionHandler({ config: { allowedGuildId: '747184859386085380' }, catalogueService: service() });
  const input = interaction();
  await handler(input);
  const text = JSON.stringify(input.replies[0]);
  assert.match(text, /123/);
  assert.match(text, /40/);
  assert.match(text, /8/);
  assert.match(text, /fabric/);
  assert.match(text, /2026-07-25T20:00:00.000Z/);
  assert.equal(input.replies[0].flags, MessageFlags.Ephemeral);
});

test('update defers ephemerally refreshes once and reports changed revision', async () => {
  const catalogueService = service();
  const handler = createCacheInteractionHandler({ config: { allowedGuildId: '747184859386085380' }, catalogueService });
  const input = interaction({ subcommand: 'update' });
  await handler(input);
  assert.equal(input.defers[0].flags, MessageFlags.Ephemeral);
  assert.equal(catalogueService.refreshCalls, 1);
  assert.match(JSON.stringify(input.edits[0]), /130/);
  assert.match(JSON.stringify(input.edits[0]), /updated/i);
});

test('failed update preserves and reports existing cache status', async () => {
  const catalogueService = service(status({ stale: true, lastError: 'old failure' }));
  catalogueService.refresh = async () => ({ ok: false, error: 'offline', status: catalogueService.status() });
  const handler = createCacheInteractionHandler({ config: { allowedGuildId: '747184859386085380' }, catalogueService });
  const input = interaction({ subcommand: 'update' });
  await handler(input);
  const text = JSON.stringify(input.edits[0]);
  assert.match(text, /offline/);
  assert.match(text, /123/);
});

test('status and update include the Mojang Minecraft manifest cache', async () => {
  const catalogueService = service();
  const minecraftService = {
    status: () => ({
      available: true, source: 'disk', fetchedAt: '2026-07-25T20:30:00.000Z', stale: false,
      refreshing: false, revision: 4, nextRefreshAt: '2026-07-26T02:30:00.000Z', lastError: null,
      versionCount: 245, releaseCount: 245, latestRelease: '26.2', cacheBytes: 2048,
    }),
    revision: () => 4,
    async refresh() { return { ok: true }; },
  };
  const handler = createCacheInteractionHandler({ config: { allowedGuildId: '747184859386085380' }, catalogueService, minecraftService });
  const statusInteraction = interaction({ subcommand: 'status' });
  await handler(statusInteraction);
  assert.match(JSON.stringify(statusInteraction.replies[0]), /Mojang release IDs indexed/);
  assert.match(JSON.stringify(statusInteraction.replies[0]), /245/);
  const updateInteraction = interaction({ subcommand: 'update' });
  await handler(updateInteraction);
  assert.match(JSON.stringify(updateInteraction.edits[0]), /Mojang release IDs indexed/);
});
