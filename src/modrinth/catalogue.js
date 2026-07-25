const MODRINTH_VERSIONS_URL = 'https://modrinth.com/mod/minecraft-comes-alive-reborn/versions';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normaliseLoaders(loaders) {
  return unique((loaders ?? []).map((loader) => String(loader).toLowerCase().replace(/\s+/g, ''))).sort();
}

function primaryFilename(files) {
  const file = (files ?? []).find((candidate) => candidate?.primary) ?? (files ?? [])[0];
  return file?.filename ?? null;
}

function stripVersionSuffix(versionNumber, minecraftVersions) {
  let value = String(versionNumber ?? '').trim();
  value = value.replace(/_(?:fabric|forge|neoforge|quilt|universal)$/i, '');
  const matchingMinecraft = [...minecraftVersions]
    .sort((a, b) => b.length - a.length)
    .find((minecraft) => value.toLowerCase().endsWith(`+${minecraft.toLowerCase()}`));
  if (matchingMinecraft) value = value.slice(0, -(matchingMinecraft.length + 1));
  return value.replace(/_(?:fabric|forge|neoforge|quilt|universal)$/i, '');
}

function validRecord(record) {
  return record && typeof record.id === 'string' && typeof record.version_number === 'string' &&
    Array.isArray(record.game_versions) && Array.isArray(record.loaders) &&
    typeof record.date_published === 'string';
}

export function normaliseModrinthVersions(records) {
  if (!Array.isArray(records)) throw new TypeError('Modrinth version response must be an array');
  return records.filter(validRecord).map((record) => {
    const minecraftVersions = unique(record.game_versions.map(String)).sort();
    return Object.freeze({
      id: record.id,
      mcaVersion: stripVersionSuffix(record.version_number, minecraftVersions),
      versionNumber: record.version_number,
      minecraftVersions: Object.freeze(minecraftVersions),
      loaders: Object.freeze(normaliseLoaders(record.loaders)),
      versionType: String(record.version_type ?? 'release').toLowerCase(),
      status: String(record.status ?? 'listed').toLowerCase(),
      publishedAt: record.date_published,
      filename: primaryFilename(record.files),
      url: `https://modrinth.com/mod/minecraft-comes-alive-reborn/version/${encodeURIComponent(record.id)}`,
    });
  });
}

function listed(catalogue) {
  return (catalogue ?? []).filter((entry) => entry.status === 'listed');
}

function typeRank(type) {
  if (type === 'release') return 0;
  if (type === 'beta') return 1;
  if (type === 'alpha') return 2;
  return 3;
}

function latestEntry(entries) {
  if (entries.length === 0) return null;
  const bestRank = Math.min(...entries.map((entry) => typeRank(entry.versionType)));
  return entries
    .filter((entry) => typeRank(entry.versionType) === bestRank)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null;
}

export function findLatestCompatible(catalogue, { minecraftVersion, loader = null } = {}) {
  if (!Array.isArray(catalogue) || catalogue.length === 0 || !minecraftVersion) {
    return { status: 'none', entry: null, loaders: [], url: MODRINTH_VERSIONS_URL };
  }

  const compatible = listed(catalogue).filter((entry) => entry.minecraftVersions.includes(minecraftVersion));
  if (compatible.length === 0) return { status: 'none', entry: null, loaders: [], url: MODRINTH_VERSIONS_URL };

  if (loader) {
    const entry = latestEntry(compatible.filter((candidate) => candidate.loaders.includes(loader)));
    return entry
      ? { status: 'direct', entry, loaders: [loader], url: entry.url }
      : { status: 'none', entry: null, loaders: [loader], url: MODRINTH_VERSIONS_URL };
  }

  const loaders = unique(compatible.flatMap((entry) => entry.loaders)).sort();
  const latestByLoader = loaders
    .map((candidateLoader) => ({
      loader: candidateLoader,
      entry: latestEntry(compatible.filter((entry) => entry.loaders.includes(candidateLoader))),
    }))
    .filter(({ entry }) => entry);

  if (latestByLoader.length === 0) return { status: 'none', entry: null, loaders, url: MODRINTH_VERSIONS_URL };
  const versions = unique(latestByLoader.map(({ entry }) => entry.mcaVersion));
  if (versions.length !== 1) {
    return { status: 'loader-required', entry: null, loaders, url: MODRINTH_VERSIONS_URL };
  }

  const entry = latestByLoader
    .map(({ entry: candidate }) => candidate)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
  return { status: 'direct', entry, loaders, url: entry.url };
}

export function checkCompatibility(catalogue, { mcaVersion, minecraftVersion, loader = null } = {}) {
  if (!Array.isArray(catalogue) || catalogue.length === 0) {
    return { status: 'catalogue-unavailable', matches: [], recommendation: null };
  }

  const publicEntries = listed(catalogue);
  const knownEntries = publicEntries.filter((entry) => entry.mcaVersion === mcaVersion);
  if (knownEntries.length === 0) {
    return { status: 'unknown-build', matches: [], recommendation: null };
  }

  const matches = knownEntries.filter((entry) =>
    entry.minecraftVersions.includes(minecraftVersion) && (!loader || entry.loaders.includes(loader))
  );
  if (matches.length > 0) return { status: 'verified', matches, recommendation: null };

  return {
    status: 'known-incompatible',
    matches: [],
    knownEntries,
    recommendation: findLatestCompatible(catalogue, { minecraftVersion, loader }),
  };
}

export function catalogueStats(catalogue) {
  const entries = Array.isArray(catalogue) ? catalogue : [];
  const publicEntries = listed(entries);
  const loaders = unique(entries.flatMap((entry) => entry.loaders ?? [])).sort();
  return {
    recordCount: entries.length,
    listedRecordCount: publicEntries.length,
    uniqueMcaVersionCount: unique(entries.map((entry) => entry.mcaVersion)).length,
    minecraftVersionCount: unique(entries.flatMap((entry) => entry.minecraftVersions ?? [])).length,
    loaderCount: loaders.length,
    loaders,
  };
}

export { MODRINTH_VERSIONS_URL };
