import { detectThreadVersions } from '../version/detect.js';
import { buildMainWarning, buildProgressAcknowledgement, buildReminder } from './messages.js';
import { diagnoseVersions } from './policy.js';

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createGuidanceCoordinator({
  reader,
  adapter,
  catalogueService = { catalogue: () => [], revision: () => 0 },
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

  function invalidateTimer(state) {
    if (state.timer) clearTimer(state.timer);
    state.timer = null;
    state.timerGeneration += 1;
  }

  async function removeState(state, { cleanup = true } = {}) {
    invalidateTimer(state);
    active.delete(state.threadId);
    if (cleanup) {
      await safeDelete(state.threadId, state.responseId);
      await safeDelete(state.threadId, state.warningId);
    }
  }

  function schedule(state) {
    invalidateTimer(state);
    if (state.reminderCount >= 2) return;
    const generation = state.timerGeneration;
    state.timer = setTimer(async () => {
      const current = active.get(state.threadId);
      if (!current || current.timerGeneration !== generation) return;
      current.timer = null;
      await check(state.threadId, { mode: 'reminder', generation });
    }, reminderDelayMs);
  }

  function diagnose(snapshot) {
    return diagnoseVersions(
      detectThreadVersions(snapshot.detectorInput),
      catalogueService.catalogue(),
    );
  }

  async function updateMain(state, snapshot, diagnosis) {
    const payload = buildMainWarning({
      ownerId: snapshot.ownerId,
      diagnosis,
      starterId: snapshot.starterId,
    });
    try {
      await adapter.editMessage(state.threadId, state.warningId, payload);
    } catch (error) {
      logger.error(`Failed to edit guidance message ${state.warningId}: ${errorText(error)}`);
      await safeDelete(state.threadId, state.warningId);
      const replacement = await adapter.sendMain(state.thread, snapshot, payload);
      state.warningId = replacement.id;
    }
  }

  async function replaceResponse(state, operation) {
    if (state.responseId) {
      await safeDelete(state.threadId, state.responseId);
      state.responseId = null;
    }
    const message = await operation();
    state.responseId = message.id;
  }

  async function performCheck(state, { mode, messageId = null, generation = null }) {
    if (generation !== null && state.timerGeneration !== generation) return;

    let snapshot;
    try {
      snapshot = await reader.read(state.thread);
    } catch (error) {
      logger.error(`Failed to read thread ${state.threadId}: ${errorText(error)}`);
      await removeState(state);
      return;
    }

    if (generation !== null && state.timerGeneration !== generation) return;
    if (!snapshot || snapshot.archived || snapshot.locked) {
      await removeState(state);
      return;
    }

    state.ownerId = snapshot.ownerId;
    state.starterId = snapshot.starterId;
    const diagnosis = diagnose(snapshot);
    if (diagnosis.complete) {
      await removeState(state);
      return;
    }

    const changed = diagnosis.fingerprint !== state.lastDiagnosisFingerprint;

    if (mode === 'owner' || mode === 'evidence') {
      if (!changed) return;
      state.lastDiagnosisFingerprint = diagnosis.fingerprint;
      state.catalogueRevision = catalogueService.revision();
      state.invalidAttemptCount += 1;
      await updateMain(state, snapshot, diagnosis);

      if (mode === 'owner' && messageId) {
        try {
          await replaceResponse(state, () => adapter.sendResponse(
            state.thread,
            snapshot,
            buildProgressAcknowledgement({
              ownerId: snapshot.ownerId,
              diagnosis,
              messageId,
              invalidAttemptCount: state.invalidAttemptCount,
            }),
          ));
        } catch (error) {
          logger.error(`Failed to acknowledge version progress in thread ${state.threadId}: ${errorText(error)}`);
        }
      } else if (state.responseId) {
        await safeDelete(state.threadId, state.responseId);
        state.responseId = null;
      }

      if (state.reminderCount < 2) schedule(state);
      return;
    }

    if (changed) {
      state.lastDiagnosisFingerprint = diagnosis.fingerprint;
      state.catalogueRevision = catalogueService.revision();
      await updateMain(state, snapshot, diagnosis);
    }

    if (state.reminderCount >= 2) return;
    const reminderNumber = state.reminderCount + 1;
    try {
      await replaceResponse(state, () => adapter.sendReminder(
        state.thread,
        snapshot,
        buildReminder({
          ownerId: snapshot.ownerId,
          diagnosis,
          starterId: snapshot.starterId,
          reminderNumber,
        }),
      ));
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
      const diagnosis = diagnose(snapshot);
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
        responseId: null,
        reminderCount: 0,
        invalidAttemptCount: 0,
        lastDiagnosisFingerprint: diagnosis.fingerprint,
        catalogueRevision: catalogueService.revision(),
        timer: null,
        timerGeneration: 0,
        checking: null,
      };
      active.set(thread.id, state);
      schedule(state);
      return true;
    },

    async onOwnerMessage(message) {
      const state = active.get(message.channelId);
      if (!state || message.author?.id !== state.ownerId) return;
      await check(state.threadId, { mode: 'owner', messageId: message.id });
    },

    async onOwnerEvidenceChanged(message) {
      const state = active.get(message.channelId);
      if (!state) return;
      if (message.author?.id && message.author.id !== state.ownerId) return;
      await check(state.threadId, { mode: 'evidence' });
    },

    async onThreadUpdate(_oldThread, newThread) {
      const state = active.get(newThread.id);
      if (!state) return;
      state.thread = newThread;
      if (newThread.archived || newThread.locked) {
        await removeState(state);
        return;
      }
      await check(state.threadId, { mode: 'evidence' });
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
