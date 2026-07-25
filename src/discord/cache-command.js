import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export const cacheCommandData = new SlashCommandBuilder()
  .setName('cache')
  .setDescription('MCA Modrinth catalogue cache tools')
  .addSubcommand((subcommand) =>
    subcommand.setName('status').setDescription('Show the MCA Modrinth catalogue cache status'),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('update').setDescription('Refresh the MCA Modrinth catalogue cache now'),
  )
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
