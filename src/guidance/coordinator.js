import { detectThreadVersions } from '../version/detect.js';
import { buildMainWarning, buildReminder } from './messages.js';
import { diagnoseVersions } from './policy.js';

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createGuidanceCoordinator({
  reader,
  adapter,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  reminderDelayMs = 45_000,
  logger = console,
}) {
  const active = new Map();

  async function safeDelete(threadId, messageId) {
    if (!messageId) return;
    try {
      await adapter.deleteMessage(threadId, messageId);
    } catch (error) {
      logger.error(`Failed to delete guidance message ${messageId}: ${errorText(error)}`);
    }
  }

  async function removeState(state, { cleanup = true } = {}) {
    if (state.timer) {
      clearTimer(state.timer);
      state.timer = null;
    }
    active.delete(state.threadId);
    if (cleanup) {
      await safeDelete(state.threadId, state.reminderId);
      await safeDelete(state.threadId, state.warningId);
    }
  }

  function schedule(state) {
    state.timer = setTimer(async () => {
      state.timer = null;
      await check(state.threadId, { sendReminder: true });
    }, reminderDelayMs);
  }

  async function performCheck(state, { sendReminder }) {
    let snapshot;
    try {
      snapshot = await reader.read(state.thread);
    } catch (error) {
      logger.error(`Failed to read thread ${state.threadId}: ${errorText(error)}`);
      await removeState(state);
      return;
    }

    if (!snapshot || snapshot.archived || snapshot.locked) {
      await removeState(state);
      return;
    }

    state.ownerId = snapshot.ownerId;
    state.starterId = snapshot.starterId;
    const diagnosis = diagnoseVersions(detectThreadVersions(snapshot.detectorInput));
    if (diagnosis.complete) {
      await removeState(state);
      return;
    }

    if (!sendReminder || state.reminderCount >= 2) return;

    if (state.reminderId) {
      await safeDelete(state.threadId, state.reminderId);
      state.reminderId = null;
    }

    const reminderNumber = state.reminderCount + 1;
    try {
      const message = await adapter.sendReminder(
        state.thread,
        snapshot,
        buildReminder({
          ownerId: snapshot.ownerId,
          diagnosis,
          starterId: snapshot.starterId,
          reminderNumber,
        }),
      );
      state.reminderId = message.id;
      state.reminderCount = reminderNumber;
    } catch (error) {
      logger.error(`Failed to send reminder in thread ${state.threadId}: ${errorText(error)}`);
      return;
    }

    if (state.reminderCount < 2) schedule(state);
  }

  async function check(threadId, options) {
    const state = active.get(threadId);
    if (!state) return;
    if (state.checking) return state.checking;
    state.checking = performCheck(state, options).finally(() => {
      state.checking = null;
    });
    return state.checking;
  }

  return {
    async start(thread) {
      if (active.has(thread.id)) return false;

      let snapshot;
      try {
        snapshot = await reader.read(thread);
      } catch (error) {
        logger.error(`Failed to inspect new thread ${thread.id}: ${errorText(error)}`);
        return false;
      }

      if (!snapshot || snapshot.archived || snapshot.locked) return false;
      const diagnosis = diagnoseVersions(detectThreadVersions(snapshot.detectorInput));
      if (diagnosis.complete) return false;

      let warning;
      try {
        warning = await adapter.sendMain(
          thread,
          snapshot,
          buildMainWarning({ ownerId: snapshot.ownerId, diagnosis, starterId: snapshot.starterId }),
        );
      } catch (error) {
        logger.error(`Failed to send guidance in thread ${thread.id}: ${errorText(error)}`);
        return false;
      }

      const state = {
        threadId: thread.id,
        thread,
        ownerId: snapshot.ownerId,
        starterId: snapshot.starterId,
        warningId: warning.id,
        reminderId: null,
        reminderCount: 0,
        timer: null,
        checking: null,
      };
      active.set(thread.id, state);
      schedule(state);
      return true;
    },

    async onOwnerMessage(message) {
      const state = active.get(message.channelId);
      if (!state || message.author?.id !== state.ownerId) return;
      await check(state.threadId, { sendReminder: false });
    },

    async onThreadUpdate(_oldThread, newThread) {
      const state = active.get(newThread.id);
      if (!state) return;
      state.thread = newThread;
      if (newThread.archived || newThread.locked) {
        await removeState(state);
        return;
      }
      await check(state.threadId, { sendReminder: false });
    },

    async onThreadDelete(thread) {
      const state = active.get(thread.id);
      if (state) await removeState(state, { cleanup: false });
    },

    async stop(threadId) {
      const state = active.get(threadId);
      if (state) await removeState(state);
    },

    isTracking(threadId) {
      return active.has(threadId);
    },
  };
}
