import { ChannelType } from 'discord.js';

function normalizeAttachment(attachment) {
  return {
    name: attachment.name ?? null,
    contentType: attachment.contentType ?? null,
    size: attachment.size ?? null,
  };
}

function normalizeMessage(message) {
  return {
    id: message.id,
    createdAt: message.createdAt,
    content: message.content ?? '',
    author: {
      id: message.author.id,
      bot: message.author.bot,
    },
    attachments: [...message.attachments.values()].map(normalizeAttachment),
  };
}

function normalizeThread(thread, guildId) {
  return {
    id: thread.id,
    name: thread.name,
    url: `https://discord.com/channels/${guildId}/${thread.id}`,
    ownerId: thread.ownerId,
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt,
    archivedAtTimestamp: thread.archivedAtTimestamp,
    archived: thread.archived,
    locked: thread.locked,
    appliedTagIds: [...thread.appliedTags],
    raw: thread,
  };
}

function collectionValues(collection) {
  return [...collection.values()];
}

export function createScanAdapter(client, config) {
  return {
    async openForum(channelId) {
      const channel = await client.channels.fetch(channelId);

      if (!channel || channel.type !== ChannelType.GuildForum) {
        throw new Error(`Configured channel ${channelId} is not a forum channel`);
      }
      if (channel.guildId !== config.allowedGuildId) {
        throw new Error(`Configured channel ${channelId} is not in guild ${config.allowedGuildId}`);
      }

      return {
        id: channel.id,
        name: channel.name,
        availableTags: channel.availableTags.map((tag) => ({ id: tag.id, name: tag.name })),

        async fetchActive() {
          const result = await channel.threads.fetchActive(false);
          return collectionValues(result.threads).map((thread) => normalizeThread(thread, config.allowedGuildId));
        },

        async fetchArchived({ before }) {
          const result = await channel.threads.fetchArchived(
            {
              type: 'public',
              limit: 100,
              before: before?.raw ?? before,
            },
            false,
          );

          return {
            threads: collectionValues(result.threads).map((thread) => normalizeThread(thread, config.allowedGuildId)),
            hasMore: result.hasMore === true,
          };
        },

        async readThread(thread) {
          const rawThread = thread.raw ?? (await client.channels.fetch(thread.id));
          if (!rawThread?.isThread?.()) {
            throw new Error(`Thread ${thread.id} is unavailable`);
          }

          const starter = await rawThread.fetchStarterMessage({ cache: false });
          if (!starter) {
            throw new Error('Starter message is unavailable');
          }

          const messageWindow = await rawThread.messages.fetch({
            around: starter.id,
            limit: 6,
            cache: false,
          });

          return {
            starter: normalizeMessage(starter),
            messages: collectionValues(messageWindow).map(normalizeMessage),
          };
        },
      };
    },
  };
}
