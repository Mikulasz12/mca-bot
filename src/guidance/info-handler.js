import { buildInfoReply } from './messages.js';

export function createInfoHandler({
  forumChannelIds,
  now = Date.now,
  cooldownMs = 60_000,
  canManageMessages = () => false,
}) {
  const configuredForums = new Set(forumChannelIds.map(String));
  const cooldowns = new Map();

  return {
    async handle(message, adapter) {
      if (message.author?.bot) return false;
      if (String(message.content ?? '').trim().toLowerCase() !== 'info') return false;
      if (!message.channel?.isThread?.()) return false;
      if (!configuredForums.has(String(message.channel.parentId))) return false;

      const bypass = Boolean(canManageMessages(message));
      const key = `${message.channelId}:${message.author.id}`;
      const currentTime = now();
      const expiresAt = cooldowns.get(key) ?? 0;

      if (!bypass && currentTime < expiresAt) return true;

      await adapter.sendInfo(message, buildInfoReply({ messageId: message.id }));
      if (!bypass) cooldowns.set(key, currentTime + cooldownMs);
      return true;
    },
  };
}
