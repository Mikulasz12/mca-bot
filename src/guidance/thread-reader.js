import { isUnknownChannel } from './discord-errors.js';
import { appliedForumTags, hasExcludedGuidanceTag } from './thread-policy.js';

const STARTER_RETRY_DELAYS = [250, 750];

function valuesOf(collection) {
  if (!collection) return [];
  if (typeof collection.values === 'function') return [...collection.values()];
  if (Array.isArray(collection)) return collection;
  return [];
}

function mapAttachments(attachments) {
  return valuesOf(attachments).map((attachment) => ({ name: attachment.name ?? null }));
}

function toDetectorMessage(message, position) {
  return {
    position,
    authorKind: 'thread-owner',
    content: String(message.content ?? ''),
    attachments: mapAttachments(message.attachments),
  };
}

async function fetchStarterWithRetry(thread, sleep) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const starter = await thread.fetchStarterMessage();
      if (!starter) throw new Error('Starter message is not available yet');
      return starter;
    } catch (error) {
      if (isUnknownChannel(error)) throw error;
      lastError = error;
      if (attempt < STARTER_RETRY_DELAYS.length) await sleep(STARTER_RETRY_DELAYS[attempt]);
    }
  }
  throw lastError;
}

export function createThreadReader({ forumChannelIds, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const configured = new Set(forumChannelIds.map(String));

  return {
    async read(thread) {
      if (!configured.has(String(thread.parentId))) return null;
      if (hasExcludedGuidanceTag(thread)) return null;

      const starter = await fetchStarterWithRetry(thread, sleep);
      const fetched = await thread.messages.fetch({ limit: 100 });
      const ownerMessages = valuesOf(fetched)
        .filter((message) => message.id !== starter.id)
        .filter((message) => !message.author?.bot && message.author?.id === thread.ownerId)
        .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0));

      return {
        threadId: thread.id,
        ownerId: thread.ownerId,
        starterId: starter.id,
        archived: Boolean(thread.archived),
        locked: Boolean(thread.locked),
        detectorInput: {
          tags: appliedForumTags(thread),
          title: String(thread.name ?? ''),
          messages: [
            toDetectorMessage(starter, 'starter'),
            ...ownerMessages.map((message, index) => toDetectorMessage(message, `reply-${index + 1}`)),
          ],
        },
      };
    },
  };
}
