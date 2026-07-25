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
  return `${hours}h ${minutes % 60}m`;
}

function unavailableMinecraftStatus() {
  return {
    available: false, source: 'unavailable', fetchedAt: null, stale: true,
    refreshing: false, revision: 0, nextRefreshAt: null, lastError: null,
    versionCount: 0, releaseCount: 0, snapshotCount: 0,
    oldBetaCount: 0, oldAlphaCount: 0, latestRelease: null, latestSnapshot: null,
  };
}

function sourceState(status) {
  const source = status.available ? status.source ?? 'memory' : 'unavailable';
  const freshness = !status.available ? 'unavailable' : status.stale ? 'stale' : 'fresh';
  return `Source: **${source}** · Freshness: **${freshness}** · Refreshing: **${status.refreshing ? 'yes' : 'no'}** · Revision: **${status.revision ?? 0}**`;
}

function formatStatus(modrinth, minecraft, { now, headline = 'Version cache status', note = null } = {}) {
  const loaders = modrinth.loaders?.length ? modrinth.loaders.join(', ') : 'none';
  const fields = [
    {
      name: 'Modrinth MCA catalogue',
      value: [
        `Modrinth version records indexed: **${modrinth.recordCount ?? 0}**`,
        `Listed public records: **${modrinth.listedRecordCount ?? 0}**`,
        `Unique MCA versions: **${modrinth.uniqueMcaVersionCount ?? 0}**`,
        `MCA-supported Minecraft versions: **${modrinth.minecraftVersionCount ?? 0}**`,
        `Loaders (${modrinth.loaderCount ?? 0}): **${loaders}**`,
        sourceState(modrinth),
        `Last update: **${modrinth.fetchedAt ?? 'never'}** (${formatAge(modrinth.fetchedAt, now)} ago)`,
      ].join('\n'),
    },
    {
      name: 'Official Mojang Java versions',
      value: [
        `Mojang Minecraft versions indexed: **${minecraft.versionCount ?? 0}**`,
        `Releases: **${minecraft.releaseCount ?? 0}** · Snapshots/testing: **${minecraft.snapshotCount ?? 0}**`,
        `Old beta: **${minecraft.oldBetaCount ?? 0}** · Old alpha: **${minecraft.oldAlphaCount ?? 0}**`,
        `Latest release: **${minecraft.latestRelease ?? 'unknown'}**`,
        `Latest snapshot/testing version: **${minecraft.latestSnapshot ?? 'unknown'}**`,
        sourceState(minecraft),
        `Last update: **${minecraft.fetchedAt ?? 'never'}** (${formatAge(minecraft.fetchedAt, now)} ago)`,
      ].join('\n'),
    },
    {
      name: 'Next automatic refresh',
      value: [
        `Modrinth: **${modrinth.nextRefreshAt ?? 'not scheduled'}**`,
        `Mojang: **${minecraft.nextRefreshAt ?? 'not scheduled'}**`,
      ].join('\n'),
    },
  ];

  const diagnostics = [
    modrinth.blockedUntil ? `Modrinth rate-limit delay until: **${modrinth.blockedUntil}**` : null,
    modrinth.disabledReason ? `Modrinth refresh disabled: **${modrinth.disabledReason}**` : null,
    modrinth.lastError ? `Modrinth error: **${modrinth.lastError}**` : null,
    minecraft.lastError ? `Mojang error: **${minecraft.lastError}**` : null,
  ].filter(Boolean);
  if (diagnostics.length > 0) fields.push({ name: 'Refresh diagnostics', value: diagnostics.join('\n') });

  return {
    embeds: [{
      color: modrinth.available && minecraft.available ? 0x57f287 : 0xf0b232,
      title: headline,
      description: note ?? undefined,
      fields,
    }],
  };
}

export function createCacheInteractionHandler({
  config,
  catalogueService,
  minecraftService = null,
  now = () => new Date(),
}) {
  const minecraft = minecraftService ?? {
    status: unavailableMinecraftStatus,
    revision: () => 0,
    refresh: async () => ({ ok: false, error: 'Mojang manifest service is unavailable.' }),
  };

  return async function handleCacheInteraction(interaction) {
    if (!isCacheInteraction(interaction)) return false;

    if (!isAdministrator(interaction, config.allowedGuildId)) {
      await interaction.reply({
        content: 'This command is available only to members with the Administrator permission in the configured MCA guild.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.options.getSubcommand() === 'status') {
      await interaction.reply({
        ...formatStatus(catalogueService.status(), minecraft.status(), { now: now() }),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const modrinthRevision = catalogueService.revision();
    const minecraftRevision = minecraft.revision();
    const [modrinthResult, minecraftResult] = await Promise.all([
      catalogueService.refresh({ reason: 'manual' }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) })),
      minecraft.refresh({ reason: 'manual' }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) })),
    ]);

    const changed = catalogueService.revision() !== modrinthRevision || minecraft.revision() !== minecraftRevision;
    const failures = [
      !modrinthResult.ok ? `Modrinth: ${modrinthResult.error ?? catalogueService.status().lastError ?? 'refresh failed'}` : null,
      !minecraftResult.ok ? `Mojang: ${minecraftResult.error ?? minecraft.status().lastError ?? 'refresh failed'}` : null,
    ].filter(Boolean);
    const headline = failures.length === 0
      ? changed ? 'Version caches updated' : 'Version cache refresh completed'
      : changed ? 'Version caches partially updated' : 'Version cache update failed';
    const note = failures.length === 0
      ? changed ? 'The MCA and Minecraft version indexes were refreshed successfully.' : 'Both refreshes completed without changing their revisions.'
      : `Existing cache data was preserved where refreshes failed. ${failures.join(' · ')}`;

    await interaction.editReply(formatStatus(catalogueService.status(), minecraft.status(), {
      now: now(), headline, note,
    }));
    return true;
  };
}
