import { MessageFlags, PermissionFlagsBits } from 'discord.js';

function isCacheInteraction(interaction) {
  if (!interaction.isChatInputCommand?.()) return false;
  if (interaction.commandName !== 'cache') return false;
  try {
    return ['status', 'update'].includes(interaction.options.getSubcommand(false));
  } catch {
    return false;
  }
}

function isAdministrator(interaction, allowedGuildId) {
  if (!interaction.guildId || interaction.guildId !== allowedGuildId) return false;
  return interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) === true;
}

function formatAge(fetchedAt, now) {
  if (!fetchedAt) return 'unknown';
  const ageMs = Math.max(0, now.getTime() - new Date(fetchedAt).getTime());
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

function formatStatus(status, { now, headline = 'Modrinth cache status', note = null } = {}) {
  const source = status.available ? status.source ?? 'memory' : 'unavailable';
  const loaders = status.loaders?.length ? status.loaders.join(', ') : 'none';
  const freshness = !status.available ? 'unavailable' : status.stale ? 'stale' : 'fresh';
  const fields = [
    {
      name: 'Indexed catalogue',
      value: [
        `Modrinth version records indexed: **${status.recordCount ?? 0}**`,
        `Listed public records: **${status.listedRecordCount ?? 0}**`,
        `Unique MCA versions: **${status.uniqueMcaVersionCount ?? 0}**`,
        `Supported Minecraft versions: **${status.minecraftVersionCount ?? 0}**`,
        `Loaders (${status.loaderCount ?? 0}): **${loaders}**`,
      ].join('\n'),
    },
    {
      name: 'Cache state',
      value: [
        `Available: **${status.available ? 'yes' : 'no'}**`,
        `Source: **${source}**`,
        `Freshness: **${freshness}**`,
        `Refresh running: **${status.refreshing ? 'yes' : 'no'}**`,
        `Revision: **${status.revision ?? 0}**`,
      ].join('\n'),
    },
    {
      name: 'Timing',
      value: [
        `Last successful update: **${status.fetchedAt ?? 'never'}**`,
        `Cache age: **${formatAge(status.fetchedAt, now)}**`,
        `Next automatic refresh: **${status.nextRefreshAt ?? 'not scheduled'}**`,
      ].join('\n'),
    },
  ];

  if (status.blockedUntil || status.disabledReason || status.lastError) {
    fields.push({
      name: 'Refresh diagnostics',
      value: [
        status.blockedUntil ? `Rate-limit delay until: **${status.blockedUntil}**` : null,
        status.disabledReason ? `Automatic refresh disabled: **${status.disabledReason}**` : null,
        status.lastError ? `Last refresh error: **${status.lastError}**` : null,
      ].filter(Boolean).join('\n'),
    });
  }

  return {
    embeds: [
      {
        color: status.available ? 0x57f287 : 0xed4245,
        title: headline,
        description: note ?? undefined,
        fields,
      },
    ],
  };
}

export function createCacheInteractionHandler({
  config,
  catalogueService,
  now = () => new Date(),
}) {
  return async function handleCacheInteraction(interaction) {
    if (!isCacheInteraction(interaction)) return false;

    if (!isAdministrator(interaction, config.allowedGuildId)) {
      await interaction.reply({
        content: 'This command is available only to members with the Administrator permission in the configured MCA guild.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'status') {
      await interaction.reply({
        ...formatStatus(catalogueService.status(), { now: now() }),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const revisionBefore = catalogueService.revision();
    let result;
    try {
      result = await catalogueService.refresh({ reason: 'manual' });
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        status: catalogueService.status(),
      };
    }

    const status = catalogueService.status();
    const revisionAfter = catalogueService.revision();
    const changed = revisionAfter !== revisionBefore;
    const headline = result.ok
      ? changed ? 'Modrinth cache updated' : 'Modrinth cache refresh completed'
      : 'Modrinth cache update failed';
    const note = result.ok
      ? changed
        ? 'The cached MCA catalogue was updated successfully.'
        : 'The refresh completed, but the catalogue revision did not change.'
      : `The previous cache was preserved. ${result.error ?? status.lastError ?? 'The refresh failed.'}`;

    await interaction.editReply(formatStatus(status, { now: now(), headline, note }));
    return true;
  };
}
