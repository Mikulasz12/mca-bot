import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  PermissionsBitField,
} from 'discord.js';

import { loadConfig } from './config.js';
import { cacheCommandData } from './discord/cache-command.js';
import { createCacheInteractionHandler } from './discord/cache-handler.js';
import { scanCommandData } from './discord/command.js';
import { createInteractionHandler } from './discord/handler.js';
import { createScanAdapter } from './discord/scan-adapter.js';
import { createAtomicJsonlWriter } from './export/jsonl-writer.js';
import { createGuidanceCoordinator } from './guidance/coordinator.js';
import { createGuidanceDiscordAdapter } from './guidance/discord-adapter.js';
import { createInfoHandler } from './guidance/info-handler.js';
import { registerGuidanceEvents } from './guidance/runtime.js';
import { createThreadReader } from './guidance/thread-reader.js';
import { createMinecraftManifestClient } from './minecraft/client.js';
import { createMinecraftVersionService } from './minecraft/service.js';
import { createModrinthClient } from './modrinth/client.js';
import { createCatalogueService } from './modrinth/service.js';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const config = loadConfig(process.env);
const catalogueService = createCatalogueService({ client: createModrinthClient() });
const minecraftService = createMinecraftVersionService({ client: createMinecraftManifestClient() });
await Promise.all([catalogueService.start(), minecraftService.start()]);
await Promise.all([
  catalogueService.status().available ? null : catalogueService.refresh({ reason: 'startup-required' }),
  minecraftService.status().available ? null : minecraftService.refresh({ reason: 'startup-required' }),
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const scanAdapter = createScanAdapter(client, config);
const handleScanInteraction = createInteractionHandler({
  config,
  adapter: scanAdapter,
  writerFactory: createAtomicJsonlWriter,
});
const handleCacheInteraction = createCacheInteractionHandler({
  config,
  catalogueService,
  minecraftService,
});

const guidanceAdapter = createGuidanceDiscordAdapter(client);
const threadReader = createThreadReader({ forumChannelIds: config.forumChannelIds });
const guidanceCoordinator = createGuidanceCoordinator({
  reader: threadReader,
  adapter: guidanceAdapter,
  catalogueService,
  minecraftService,
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
  await readyClient.application.commands.set([cacheCommandData.toJSON()], config.allowedGuildId);
  console.log(
    `Ready as ${readyClient.user.tag}; /scan export registered globally and /cache registered in guild ${config.allowedGuildId}.`,
  );
});

client.on(Events.InteractionCreate, (interaction) => {
  Promise.resolve()
    .then(async () => {
      if (await handleCacheInteraction(interaction)) return;
      await handleScanInteraction(interaction);
    })
    .catch(async (error) => {
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

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  guidanceCoordinator.shutdown();
  catalogueService.stop();
  minecraftService.stop();
  client.destroy();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await client.login(config.token);
} catch (error) {
  guidanceCoordinator.shutdown();
  catalogueService.stop();
  minecraftService.stop();
  throw error;
}
