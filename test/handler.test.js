import assert from 'node:assert/strict';
import test from 'node:test';

import { createInteractionHandler } from '../src/discord/handler.js';

const config = {
  ownerUserId: '245983842672967680',
  allowedGuildId: '747184859386085380',
  forumChannelIds: ['1082779790714613840'],
  scanExportRoleIds: [],
  exportDir: './exports',
};

function makeInteraction({
  userId = config.ownerUserId,
  guildId = null,
  commandName = 'scan',
  subcommand = 'export',
  roleIds = [],
  failAttachmentOnce = false,
} = {}) {
  const calls = { reply: [], deferReply: [], editReply: [] };
  let attachmentFailed = false;

  return {
    user: { id: userId },
    guildId,
    member: guildId ? { roles: { cache: new Map(roleIds.map((id) => [id, {}])) } } : null,
    commandName,
    options: { getSubcommand: () => subcommand },
    isChatInputCommand: () => true,
    calls,
    async reply(payload) {
      calls.reply.push(payload);
    },
    async deferReply(payload) {
      calls.deferReply.push(payload);
    },
    async editReply(payload) {
      calls.editReply.push(payload);
      if (failAttachmentOnce && payload.files && !attachmentFailed) {
        attachmentFailed = true;
        throw new Error('attachment too large');
      }
    },
  };
}

function makeThread(id = '100000000000000000') {
  return {
    id,
    name: `Thread ${id}`,
    url: `https://discord.com/channels/${config.allowedGuildId}/${id}`,
    ownerId: config.ownerUserId,
    createdAt: '2026-07-01T10:00:00.000Z',
    archivedAt: null,
    archivedAtTimestamp: null,
    archived: false,
    locked: false,
    appliedTagIds: ['tag-1'],
  };
}

function makeMessage(id, content = 'Minecraft 1.21.1') {
  return {
    id,
    createdAt: '2026-07-01T10:00:00.000Z',
    content,
    author: { id: config.ownerUserId, bot: false },
    attachments: [],
  };
}

function makeWriter() {
  const records = [];
  return {
    outputPath: '/tmp/mca-thread-scan.jsonl',
    records,
    committed: false,
    aborted: false,
    async append(record) {
      records.push(record);
    },
    async commit() {
      this.committed = true;
      return this.outputPath;
    },
    async abort() {
      this.aborted = true;
    },
  };
}

function makeSuccessfulAdapter({ readThread } = {}) {
  const thread = makeThread();
  return {
    async openForum() {
      return {
        id: config.forumChannelIds[0],
        name: 'support',
        availableTags: [{ id: 'tag-1', name: 'NeoForge' }],
        fetchActive: async () => [thread],
        fetchArchived: async () => ({ threads: [], hasMore: false }),
        readThread:
          readThread ??
          (async () => ({
            starter: makeMessage(thread.id),
            messages: [makeMessage('100000000000000001', 'MCA 7.7.18')],
          })),
      };
    },
  };
}

test('ignores interactions that are not /scan export', async () => {
  const interaction = makeInteraction({ commandName: 'other' });
  const handler = createInteractionHandler({
    config,
    adapter: makeSuccessfulAdapter(),
    writerFactory: async () => makeWriter(),
  });

  assert.equal(await handler(interaction), false);
  assert.deepEqual(interaction.calls.reply, []);
});

test('rejects unauthorized users before starting a scan', async () => {
  const interaction = makeInteraction({ userId: '111111111111111111' });
  const handler = createInteractionHandler({
    config,
    adapter: makeSuccessfulAdapter(),
    writerFactory: async () => makeWriter(),
  });

  assert.equal(await handler(interaction), true);
  assert.match(interaction.calls.reply[0].content, /not authorized/i);
  assert.equal(interaction.calls.deferReply.length, 0);
});

test('exports successful and failed threads without aborting the scan', async () => {
  const good = makeThread('100000000000000000');
  const bad = makeThread('100000000000000010');
  const writer = makeWriter();
  const adapter = {
    async openForum() {
      return {
        id: config.forumChannelIds[0],
        name: 'support',
        availableTags: [{ id: 'tag-1', name: 'NeoForge' }],
        fetchActive: async () => [good, bad],
        fetchArchived: async () => ({ threads: [], hasMore: false }),
        async readThread(thread) {
          if (thread.id === bad.id) throw new Error('starter deleted');
          return {
            starter: makeMessage(good.id),
            messages: [makeMessage('100000000000000001', 'MCA 7.7.18')],
          };
        },
      };
    },
  };
  const interaction = makeInteraction({ guildId: config.allowedGuildId });
  const handler = createInteractionHandler({ config, adapter, writerFactory: async () => writer });

  await handler(interaction);

  assert.equal(writer.committed, true);
  assert.equal(writer.aborted, false);
  assert.equal(writer.records.length, 2);
  assert.equal(writer.records[0].messages.length, 2);
  assert.deepEqual(writer.records[1].messages, []);
  assert.deepEqual(writer.records[1].errors, ['starter deleted']);
  assert.match(interaction.calls.editReply[0].content, /2 threads/);
  assert.match(interaction.calls.editReply[0].content, /1 thread error/);
  assert.deepEqual(interaction.calls.editReply[0].files, [writer.outputPath]);
});

test('aborts the writer when resolving a configured forum fails', async () => {
  const writer = makeWriter();
  const interaction = makeInteraction();
  const handler = createInteractionHandler({
    config,
    adapter: { openForum: async () => Promise.reject(new Error('missing ViewChannel permission')) },
    writerFactory: async () => writer,
  });

  await handler(interaction);

  assert.equal(writer.aborted, true);
  assert.equal(writer.committed, false);
  assert.match(interaction.calls.editReply[0].content, /scan failed/i);
  assert.match(interaction.calls.editReply[0].content, /missing ViewChannel permission/);
});

test('falls back to the disk path when Discord rejects the attachment', async () => {
  const writer = makeWriter();
  const interaction = makeInteraction({ failAttachmentOnce: true });
  const handler = createInteractionHandler({
    config,
    adapter: makeSuccessfulAdapter(),
    writerFactory: async () => writer,
  });

  await handler(interaction);

  assert.equal(interaction.calls.editReply.length, 2);
  assert.deepEqual(interaction.calls.editReply[0].files, [writer.outputPath]);
  assert.equal(Object.hasOwn(interaction.calls.editReply[1], 'files'), false);
  assert.match(interaction.calls.editReply[1].content, /saved locally/i);
  assert.match(interaction.calls.editReply[1].content, /\/tmp\/mca-thread-scan\.jsonl/);
});

test('allows only one scan at a time', async () => {
  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const adapter = {
    async openForum() {
      await blocker;
      return makeSuccessfulAdapter().openForum();
    },
  };
  const handler = createInteractionHandler({
    config,
    adapter,
    writerFactory: async () => makeWriter(),
  });
  const first = makeInteraction();
  const second = makeInteraction();

  const firstRun = handler(first);
  await new Promise((resolve) => setImmediate(resolve));
  await handler(second);

  assert.match(second.calls.reply[0].content, /already running/i);

  release();
  await firstRun;
});
