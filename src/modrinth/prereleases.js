function latest(entries) {
  return entries.reduce((current, entry) => (
    !current || entry.publishedAt > current.publishedAt ? entry : current
  ), null);
}

export function findNewerCompatiblePrereleases(catalogue, { minecraftVersion, loader = null } = {}) {
  const entries = catalogue?.entries ?? [];
  if (!minecraftVersion || entries.length === 0) return { beta: null, alpha: null };

  const compatible = entries.filter((entry) =>
    entry.minecraftVersions.includes(minecraftVersion) && (!loader || entry.loaders.includes(loader))
  );
  const stable = latest(compatible.filter((entry) => entry.versionType === 'r'));
  const stablePublishedAt = stable?.publishedAt ?? -Infinity;

  const newest = (type) => latest(
    compatible.filter((entry) => entry.versionType === type && entry.publishedAt > stablePublishedAt),
  );

  return {
    beta: newest('b'),
    alpha: newest('a'),
  };
}
