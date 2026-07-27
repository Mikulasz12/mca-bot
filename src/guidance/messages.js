const WARNING_COLOR = 0xf0b232;
const INFO_COLOR = 0x5865f2;
const SUCCESS_COLOR = 0x57f287;
const MODRINTH_VERSIONS_URL = 'https://modrinth.com/mod/minecraft-comes-alive-reborn/versions';

function ownerMentions(ownerId) {
  return { users: [ownerId], roles: [], parse: [], repliedUser: false };
}

function noMentions() {
  return { users: [], roles: [], parse: [], repliedUser: false };
}

function replyTo(messageId) {
  return { messageReference: messageId, failIfNotExists: false };
}

function list(values) {
  return values.map((value) => `• ${value}`).join('\n');
}

function recommendationText(diagnosis) {
  const recommendation = diagnosis.recommendation;
  if (!recommendation || recommendation.status === 'none') return null;
  if (recommendation.status === 'loader-required') {
    return `Choose whether you use ${recommendation.loaders.map((loader) => `**${loader}**`).join(', ')}, then get the newest MCA release for Minecraft \`${diagnosis.minecraftVersion}\` from ${recommendation.url ?? MODRINTH_VERSIONS_URL}.`;
  }
  if (recommendation.status === 'direct' && recommendation.entry) {
    const loaders = recommendation.loaders?.length ? ` for ${recommendation.loaders.join(', ')}` : '';
    return `The newest compatible public release is **MCA Reborn ${recommendation.entry.mcaVersion}** for Minecraft \`${diagnosis.minecraftVersion}\`${loaders}: ${recommendation.entry.url}`;
  }
  return null;
}

function prereleaseFields(diagnosis) {
  const fields = [];
  for (const [type, label] of [['beta', 'Beta available'], ['alpha', 'Alpha available']]) {
    const entry = diagnosis.prereleases?.[type];
    if (!entry) continue;
    const loaders = entry.loaders?.length ? ` for ${entry.loaders.join(', ')}` : '';
    fields.push({
      name: label,
      value: `**MCA Reborn ${entry.mcaVersion}**${loaders}: ${entry.url}\nThis is an experimental prerelease and may be less stable than the public release.`,
    });
  }
  return fields;
}

export function buildMainWarning({ ownerId, diagnosis, starterId }) {
  const fields = [];
  if (diagnosis.missing.length > 0) fields.push({ name: 'Missing or unclear', value: list(diagnosis.missing) });
  if (diagnosis.detected.length > 0) fields.push({ name: 'Already detected', value: list(diagnosis.detected) });
  if (diagnosis.reasons.length > 0) fields.push({ name: 'Why', value: list(diagnosis.reasons) });
  const recommendation = recommendationText(diagnosis);
  if (recommendation) fields.push({ name: 'Compatible Modrinth release', value: recommendation });
  fields.push(...prereleaseFields(diagnosis));

  fields.push(
    {
      name: 'Where to look',
      value:
        'Check your launcher’s installed mod list, the profile’s `mods` folder, or the MCA file name. For example, in `mca-neoforge-7.7.23+1.21.1.jar`, `7.7.23` is the MCA Reborn version and `1.21.1` is the Minecraft version.',
    },
    {
      name: 'Crashes and technical problems',
      value:
        'For a crash, bug, loading failure, or other technical problem, it also helps to attach `logs/latest.log` or share an https://mclo.gs/ link. A log is not required for every help question.',
    },
  );

  return {
    content: `<@${ownerId}>`,
    allowedMentions: ownerMentions(ownerId),
    reply: replyTo(starterId),
    embeds: [
      {
        color: WARNING_COLOR,
        title: '⚠️ More version information is needed',
        description:
          'Please provide the exact Minecraft and MCA Reborn versions that reproduce the problem. “Latest” or “newest” is not specific enough.',
        fields,
        footer: { text: 'Use /info for more information.' },
      },
    ],
  };
}

export function buildProgressAcknowledgement({ ownerId, diagnosis, messageId, invalidAttemptCount = 1 }) {
  const detected = diagnosis.detected ?? [];
  let content = `<@${ownerId}> Thanks`;
  if (detected.length > 0) content += ` — I detected ${detected.join(' and ')}`;
  content += '.';

  if ((diagnosis.invalid ?? []).length > 0) {
    content += ` I couldn’t verify the version information you sent: ${diagnosis.invalid.join(' ')}`;
  } else if (diagnosis.compatibility === 'known-incompatible') {
    content += ` ${diagnosis.reasons.join(' ')}`;
  } else if ((diagnosis.missing ?? []).length > 0) {
    content += ` I still need ${diagnosis.missing.join(' and ')}.`;
  }

  const fields = [];
  const recommendation = recommendationText(diagnosis);
  if (recommendation) fields.push({ name: 'Recommended compatible release', value: recommendation });
  fields.push(...prereleaseFields(diagnosis));

  if (invalidAttemptCount >= 2) {
    fields.push({
      name: 'Check the MCA file',
      value: 'A complete file name such as `mca-neoforge-7.7.23+1.21.1.jar` shows the loader, MCA version, and Minecraft version together.',
    });
  }
  if (invalidAttemptCount >= 3) {
    fields.push({
      name: 'Send what you can find',
      value: `Attach or paste the complete MCA JAR filename from the instance \`mods\` folder. A screenshot of the launcher’s installed-mod entry also works. For technical problems, also attach \`latest.log\` or share an https://mclo.gs/ link. MCA releases: ${MODRINTH_VERSIONS_URL}`,
    });
  }

  return {
    content,
    allowedMentions: ownerMentions(ownerId),
    reply: replyTo(messageId),
    embeds: fields.length > 0 ? [{ color: invalidAttemptCount >= 3 ? INFO_COLOR : SUCCESS_COLOR, fields }] : [],
  };
}

export function buildUpdateAdvisory({ ownerId, diagnosis, messageId }) {
  const update = diagnosis.updateAvailable;
  if (!update?.entry) throw new TypeError('An update recommendation is required');
  const loaders = update.loaders?.length ? ` for ${update.loaders.join(', ')}` : '';
  const prereleaseOnly = update.status === 'prerelease';
  const description = prereleaseOnly
    ? `Your MCA Reborn version \`${diagnosis.mcaVersion}\` is valid. A newer experimental prerelease, **${update.entry.mcaVersion}**, is available for Minecraft \`${diagnosis.minecraftVersion}\`${loaders}. Prereleases are optional and may be less stable than the public release.`
    : `Your MCA Reborn version \`${diagnosis.mcaVersion}\` is valid, but **${update.entry.mcaVersion}** is the newest compatible public release for Minecraft \`${diagnosis.minecraftVersion}\`${loaders}. Updating is optional, but it may include fixes already made after your installed version.`;
  const fields = prereleaseOnly
    ? prereleaseFields(diagnosis)
    : [{ name: 'Download', value: update.entry.url }, ...prereleaseFields(diagnosis)];
  return {
    content: `<@${ownerId}>`,
    allowedMentions: ownerMentions(ownerId),
    reply: replyTo(messageId),
    embeds: [{
      color: INFO_COLOR,
      title: prereleaseOnly ? 'MCA Reborn prerelease available' : 'MCA Reborn update available',
      description,
      fields,
    }],
  };
}

export function buildReminder({ ownerId, diagnosis, starterId, reminderNumber }) {
  const needed = diagnosis.missing.length > 0 ? diagnosis.missing.join(' and ') : 'the exact version information';
  return {
    content: `<@${ownerId}> Reminder ${reminderNumber}/2: we still need ${needed} before this can be investigated.`,
    allowedMentions: ownerMentions(ownerId),
    reply: replyTo(starterId),
  };
}

export function buildInfoReply({ messageId } = {}) {
  const payload = {
    allowedMentions: noMentions(),
    embeds: [
      {
        color: INFO_COLOR,
        title: 'Finding your MCA, Minecraft, and log information',
        description:
          'Minecraft and MCA Reborn use different version numbers. Please give the exact versions from the profile where the problem occurs.',
        fields: [
          {
            name: 'Find the versions',
            value:
              `Open your launcher’s mod list or the instance/profile \`mods\` folder. In \`mca-neoforge-7.7.23+1.21.1.jar\`, \`7.7.23\` is MCA Reborn and \`1.21.1\` is Minecraft. “Latest” and “newest” are not exact versions. Get the latest release matching your Minecraft version and loader from ${MODRINTH_VERSIONS_URL}.`,
          },
          {
            name: 'When a log helps',
            value:
              'For crashes, bugs, loading failures, or other technical problems, send `latest.log`. It is useful evidence but is not required for every help question.',
          },
          {
            name: 'Log locations',
            value:
              '**Windows:** `%appdata%\\.minecraft\\logs\\latest.log`\n**Linux:** `~/.minecraft/logs/latest.log`\n**macOS:** `~/Library/Application Support/minecraft/logs/latest.log`\n**CurseForge, Modrinth, and other launchers:** open the affected instance/profile folder, then `logs/latest.log`.',
          },
          {
            name: 'Send the log',
            value:
              'Attach `latest.log` directly in this thread, or upload its contents to https://mclo.gs/ and send the resulting link. For server problems, both the client and server `latest.log` may be useful.',
          },
        ],
      },
    ],
  };
  if (messageId) payload.reply = replyTo(messageId);
  return payload;
}
