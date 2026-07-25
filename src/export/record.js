import { redactSensitiveText } from './redact.js';

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function classifyAuthor(message, threadOwnerId) {
  if (message.author?.bot) return 'bot';
  if (message.author?.id === threadOwnerId) return 'thread-owner';
  return 'other';
}

function mapAttachments(attachments = []) {
  return [...attachments].map((attachment) => ({
    name: attachment.name ?? null,
    contentType: attachment.contentType ?? null,
    size: attachment.size ?? null,
  }));
}

function mapMessage(message, position, threadOwnerId) {
  return {
    position,
    createdAt: toIso(message.createdAt),
    authorKind: classifyAuthor(message, threadOwnerId),
    content: redactSensitiveText(message.content),
    attachments: mapAttachments(message.attachments),
  };
}

export function createThreadRecord({ exportedAt, guildId, forum, thread, starter, replies = [], errors = [] }) {
  return {
    schemaVersion: 1,
    exportedAt: toIso(exportedAt),
    guildId,
    forum: {
      id: forum.id,
      name: forum.name,
      tags: [...(forum.tags ?? [])].map((tag) => ({ id: tag.id, name: tag.name })),
    },
    thread: {
      id: thread.id,
      url: thread.url,
      title: thread.name,
      createdAt: toIso(thread.createdAt),
      archivedAt: toIso(thread.archivedAt),
      archived: Boolean(thread.archived),
      locked: Boolean(thread.locked),
      appliedTagIds: [...(thread.appliedTagIds ?? [])],
    },
    messages: starter
      ? [
          mapMessage(starter, 'starter', thread.ownerId),
          ...replies.map((message, index) => mapMessage(message, `reply-${index + 1}`, thread.ownerId)),
        ]
      : [],
    errors: errors.map(String),
  };
}
