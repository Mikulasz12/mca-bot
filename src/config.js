const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

const DEFAULTS = Object.freeze({
  ownerUserId: '245983842672967680',
  allowedGuildId: '747184859386085380',
  forumChannelIds: ['1082779790714613840', '1131690144160825455'],
  exportDir: './exports',
});

function splitCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function assertSnowflake(name, value) {
  if (!SNOWFLAKE_PATTERN.test(value)) {
    throw new Error(`${name} must be a Discord snowflake`);
  }
  return value;
}

function assertSnowflakeList(name, values) {
  if (values.length === 0) {
    throw new Error(`${name} must contain at least one Discord snowflake`);
  }
  return values.map((value) => assertSnowflake(name, value));
}

export function loadConfig(env = process.env) {
  const token = String(env.DISCORD_TOKEN ?? '').trim();
  if (!token) {
    throw new Error('DISCORD_TOKEN is required');
  }

  const ownerUserId = assertSnowflake('OWNER_USER_ID', String(env.OWNER_USER_ID ?? DEFAULTS.ownerUserId).trim());
  const allowedGuildId = assertSnowflake(
    'ALLOWED_GUILD_ID',
    String(env.ALLOWED_GUILD_ID ?? DEFAULTS.allowedGuildId).trim(),
  );
  const forumChannelIds = assertSnowflakeList(
    'FORUM_CHANNEL_IDS',
    env.FORUM_CHANNEL_IDS === undefined ? DEFAULTS.forumChannelIds : splitCsv(env.FORUM_CHANNEL_IDS),
  );
  const scanExportRoleIds = splitCsv(env.SCAN_EXPORT_ROLE_IDS).map((value) =>
    assertSnowflake('SCAN_EXPORT_ROLE_IDS', value),
  );
  const exportDir = String(env.EXPORT_DIR ?? DEFAULTS.exportDir).trim() || DEFAULTS.exportDir;

  return Object.freeze({
    token,
    ownerUserId,
    allowedGuildId,
    forumChannelIds: Object.freeze([...forumChannelIds]),
    scanExportRoleIds: Object.freeze([...scanExportRoleIds]),
    exportDir,
  });
}
