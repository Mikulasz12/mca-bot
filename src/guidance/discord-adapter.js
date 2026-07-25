function isUnknownMessage(error) {
  return error?.code === 10008 || error?.rawError?.code === 10008;
}

export function createGuidanceDiscordAdapter(client) {
  return {
    async sendMain(thread, _snapshot, payload) {
      return thread.send(payload);
    },

    async sendReminder(thread, _snapshot, payload) {
      return thread.send(payload);
    },

    async deleteMessage(threadId, messageId) {
      const thread = await client.channels.fetch(threadId);
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
