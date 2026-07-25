import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionsBitField,
} from 'discord.js';

import { loadConfig } from './config.js';
import { scanCommandData } from './discord/command.js';
import { createInteractionHandler } from './discord/handler.js';
import { createScanAdapter } from './discord/scan-adapter.js';
import { createAtomicJsonlWriter } from './export/jsonl-writer.js';
import { createGuidanceCoordinator } from './guidance/coordinator.js';
import { createGuidanceDiscordAdapter } from './guidance/discord-adapter.js';
import { createInfoHandler } from './guidance/info-handler.js';
import { registerGuidanceEvents } from './guidance/runtime.js';
import { createThreadReader } from './guidance/thread-reader.js';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const config = loadConfig(process.env);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const scanAdapter = createScanAdapter(client, config);
const handleInteraction = createInteractionHandler({
  config,
  adapter: scanAdapter,
  writerFactory: createAtomicJsonlWriter,
});

const guidanceAdapter = createGuidanceDiscordAdapter(client);
const threadReader = createThreadReader({ forumChannelIds: config.forumChannelIds });
const guidanceCoordinator = createGuidanceCoordinator({
  reader: threadReader,
  adapter: guidanceAdapter,
});
const infoHandler = createInfoHandler({
  forumChannelIds: config.forumChannelIds,
  canManageMessages: (message) =>
    message.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages) ?? false,
});
registerGuidanceEvents(client, {
  coordinator: guidanceCoordinator,
  infoHandler,
  adapter: guidanceAdapter,
  Events,
});

client.once(Events.ClientReady, async (readyClient) => {
  await readyClient.application.commands.set([scanCommandData.toJSON()]);
  console.log(`Ready as ${readyClient.user.tag}; /scan export registered globally.`);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch(async (error) => {
    console.error('Unhandled interaction error:', error instanceof Error ? error.message : String(error));

    if (!interaction.isRepliable()) return;
    const content = 'The command failed unexpectedly. Check the local console for details.';

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => undefined);
    } else {
      const payload = interaction.guildId
        ? { content, flags: MessageFlags.Ephemeral }
        : { content };
      await interaction.reply(payload).catch(() => undefined);
    }
  });
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error.message);
});

await client.login(config.token);
