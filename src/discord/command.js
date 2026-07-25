import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export const scanCommandData = new SlashCommandBuilder()
  .setName('scan')
  .setDescription('MCA support forum scan tools')
  .addSubcommand((subcommand) =>
    subcommand.setName('export').setDescription('Export existing support threads to a local JSONL file'),
  )
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
