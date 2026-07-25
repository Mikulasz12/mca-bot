export function authorizeScanExport({ userId, guildId, roleIds = [] }, config) {
  if (guildId === null || guildId === undefined) {
    return userId === config.ownerUserId
      ? { allowed: true, reason: 'owner-dm' }
      : { allowed: false, reason: 'dm-owner-only' };
  }

  if (guildId !== config.allowedGuildId) {
    return { allowed: false, reason: 'wrong-guild' };
  }

  if (userId === config.ownerUserId) {
    return { allowed: true, reason: 'owner-guild' };
  }

  const configuredRoles = new Set(config.scanExportRoleIds);
  if (roleIds.some((roleId) => configuredRoles.has(roleId))) {
    return { allowed: true, reason: 'configured-role' };
  }

  return { allowed: false, reason: 'not-authorized' };
}
