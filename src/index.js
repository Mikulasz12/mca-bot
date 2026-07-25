import {
  Client,
  Events,
  GatewayIntentBits,
} from 'discord.js';

import { loadConfig } from './config.js';
import { scanCommandData } from './discord/command.js';
import { createInteractionHandler } from './discord/handler.js';
import { createScanAdapter } from './discord/scan-adapter.js';
import { createAtomicJsonlWriter } from './export/jsonl-writer.js';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const config = loadConfig(process.env);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
});
const adapter = createScanAdapter(client, config);
const handleInteraction = createInteractionHandler({
  config,
  adapter,
  writerFactory: createAtomicJsonlWriter,
});

client.once(Events.ClientReady, async (readyClient) => {
  await readyClient.application.commands.set([scanCommandData.toJSON()]);
  console.log(`Ready as ${readyClient.user.tag}; /scan export registered globally.`);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch(async (error) => {
    console.error('Unhandled interaction error:', error instanceof Error ? error.message : String(error));

    if (!interaction.isRepliable()) return;
    const payload = { content: 'The command failed unexpectedly. Check the local console for details.', ephemeral: true };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => undefined);
    } else {
      await interaction.reply(payload).catch(() => undefined);
    }
  });
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error.message);
});

await client.login(config.token);
