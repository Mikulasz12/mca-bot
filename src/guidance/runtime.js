import { isMissingDiscordResource } from './discord-errors.js';

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function registerGuidanceEvents(client, { coordinator, infoHandler, adapter, Events, logger = console }) {
  function run(label, operation) {
    Promise.resolve()
      .then(operation)
      .catch((error) => {
        if (!isMissingDiscordResource(error)) logger.error(`${label}: ${errorText(error)}`);
      });
  }

  client.on(Events.ThreadCreate, (thread, newlyCreated) => {
    if (newlyCreated === false) return;
    run(`Failed to start guidance for thread ${thread.id}`, () => coordinator.start(thread));
  });

  client.on(Events.ThreadUpdate, (oldThread, newThread) => {
    run(`Failed to update guidance for thread ${newThread.id}`, () => coordinator.onThreadUpdate(oldThread, newThread));
  });

  client.on(Events.ThreadDelete, (thread) => {
    run(`Failed to stop guidance for thread ${thread.id}`, () => coordinator.onThreadDelete(thread));
  });

  client.on(Events.MessageCreate, (message) => {
    run(`Failed to handle message ${message.id}`, async () => {
      await infoHandler.handle(message, adapter);
      await coordinator.onOwnerMessage(message);
    });
  });

  client.on(Events.MessageUpdate, (_oldMessage, newMessage) => {
    run(`Failed to handle edited message ${newMessage.id}`, () => coordinator.onOwnerEvidenceChanged(newMessage));
  });

  client.on(Events.MessageDelete, (message) => {
    run(`Failed to handle deleted message ${message.id}`, () => coordinator.onOwnerEvidenceChanged(message));
  });
}
