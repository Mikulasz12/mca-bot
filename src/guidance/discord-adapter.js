function editablePayload(payload) {
  const { reply: _reply, ...editable } = payload ?? {};
  return editable;
}

function isUnknownMessage(error) {
  return error?.code === 10008 || error?.rawError?.code === 10008;
}

export function createGuidanceDiscordAdapter(client) {
  async function fetchThread(threadId) {
    return client.channels.fetch(threadId);
  }

  return {
    async sendMain(thread, _snapshot, payload) {
      return thread.send(payload);
    },

    async sendResponse(thread, _snapshot, payload) {
      return thread.send(payload);
    },

    async sendReminder(thread, _snapshot, payload) {
      return thread.send(payload);
    },

    async editMessage(threadId, messageId, payload) {
      const thread = await fetchThread(threadId);
      if (!thread?.messages?.fetch) throw new Error(`Thread ${threadId} cannot fetch messages`);
      const message = await thread.messages.fetch(messageId);
      if (!message?.edit) throw new Error(`Message ${messageId} cannot be edited`);
      return message.edit(editablePayload(payload));
    },

    async deleteMessage(threadId, messageId) {
      const thread = await fetchThread(threadId);
      if (!thread?.messages?.delete) return;
      try {
        await thread.messages.delete(messageId);
      } catch (error) {
        if (!isUnknownMessage(error)) throw error;
      }
    },

    async sendInfo(message, payload) {
      return message.channel.send(payload);
    },
  };
}
