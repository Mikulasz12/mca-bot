const WARNING_COLOR = 0xf0b232;
const INFO_COLOR = 0x5865f2;

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

export function buildMainWarning({ ownerId, diagnosis, starterId }) {
  const fields = [
    {
      name: 'Missing or unclear',
      value: list(diagnosis.missing),
    },
  ];

  if (diagnosis.detected.length > 0) {
    fields.push({ name: 'Already detected', value: list(diagnosis.detected) });
  }

  if (diagnosis.reasons.length > 0) {
    fields.push({ name: 'Why', value: list(diagnosis.reasons) });
  }

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
        footer: { text: 'For more information, type `info` in this thread.' },
      },
    ],
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

export function buildInfoReply({ messageId }) {
  return {
    allowedMentions: noMentions(),
    reply: replyTo(messageId),
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
              'Open your launcher’s mod list or the instance/profile `mods` folder. In `mca-neoforge-7.7.23+1.21.1.jar`, `7.7.23` is MCA Reborn and `1.21.1` is Minecraft. “Latest” and “newest” are not exact versions.',
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
}
