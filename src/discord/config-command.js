import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const configCommandData = new SlashCommandBuilder()
  .setName('config')
  .setDescription('View or change MCA bot runtime configuration')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((command) => command.setName('show').setDescription('Show the current bot configuration'))
  .addSubcommand((command) => command
    .setName('retry-cadence')
    .setDescription('Set the delay between reminder attempts')
    .addIntegerOption((option) => option
      .setName('seconds').setDescription('Delay in seconds (5 to 86400)').setRequired(true).setMinValue(5).setMaxValue(86_400)))
  .addSubcommand((command) => command
    .setName('retry-count')
    .setDescription('Set the maximum number of reminders')
    .addIntegerOption((option) => option
      .setName('count').setDescription('Reminder count (0 to 10)').setRequired(true).setMinValue(0).setMaxValue(10)))
  .addSubcommand((command) => command
    .setName('excluded-tags')
    .setDescription('Replace the forum tag names ignored by guidance')
    .addStringOption((option) => option
      .setName('names').setDescription('Comma-separated tag names; leave empty text to clear').setRequired(true).setMaxLength(1000)));

function render(config) {
  const tags = config.excludedTagNames.length ? config.excludedTagNames.map((name) => `• ${name}`).join('\n') : 'None';
  return {
    embeds: [{
      title: 'MCA bot configuration',
      fields: [
        { name: 'Retry cadence', value: `${config.retryCadence / 1000} seconds`, inline: true },
        { name: 'Retry count', value: String(config.retryCount), inline: true },
        { name: 'Excluded tag names', value: tags },
      ],
    }],
    flags: MessageFlags.Ephemeral,
  };
}

export function createConfigInteractionHandler({ configService, allowedGuildId }) {
  return async function handleConfigInteraction(interaction) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'config') return false;
    if (interaction.guildId !== allowedGuildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'This command is only available to administrators in the configured guild.', flags: MessageFlags.Ephemeral });
      return true;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'show') {
      await interaction.reply(render(configService.get()));
      return true;
    }

    let next;
    if (subcommand === 'retry-cadence') {
      next = await configService.update({ retryCadence: interaction.options.getInteger('seconds', true) * 1000 });
    } else if (subcommand === 'retry-count') {
      next = await configService.update({ retryCount: interaction.options.getInteger('count', true) });
    } else {
      const names = interaction.options.getString('names', true).split(',').map((name) => name.trim()).filter(Boolean);
      next = await configService.update({ excludedTagNames: names });
    }
    await interaction.reply({ content: 'Configuration updated.', ...render(next) });
    return true;
  };
}
