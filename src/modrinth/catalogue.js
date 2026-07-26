const MODRINTH_VERSIONS_URL = 'https://modrinth.com/mod/minecraft-comes-alive-reborn/versions';

const MCA_VERSION = 0;
const MINECRAFT_VERSIONS = 1;
const LOADERS = 2;
const VERSION_TYPE = 3;
const PUBLISHED_AT = 4;
const VERSION_ID = 5;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normaliseLoaders(loaders) {
  return unique((loaders ?? []).map((loader) => String(loader).toLowerCase().replace(/\s+/g, ''))).sort();
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

function typeCode(type) {
  if (type === 'beta') return 'b';
  if (type === 'alpha') return 'a';
  return 'r';
}

function typeRank(code) {
  if (code === 'r') return 0;
  if (code === 'b') return 1;
  if (code === 'a') return 2;
  return 3;
}

function validRecord(record) {
  return record && typeof record.id === 'string' && typeof record.version_number === 'string' &&
    Array.isArray(record.game_versions) && Array.isArray(record.loaders) &&
    typeof record.date_published === 'string' &&
    String(record.status ?? 'listed').toLowerCase() === 'listed';
}

function validTuple(tuple) {
  return Array.isArray(tuple) && tuple.length === 6 &&
    typeof tuple[MCA_VERSION] === 'string' &&
    Array.isArray(tuple[MINECRAFT_VERSIONS]) && tuple[MINECRAFT_VERSIONS].every((value) => typeof value === 'string') &&
    Array.isArray(tuple[LOADERS]) && tuple[LOADERS].every((value) => typeof value === 'string') &&
    ['r', 'b', 'a'].includes(tuple[VERSION_TYPE]) &&
    Number.isInteger(tuple[PUBLISHED_AT]) &&
    typeof tuple[VERSION_ID] === 'string';
}

export function normaliseModrinthVersions(records) {
  if (!Array.isArray(records)) throw new TypeError('Modrinth version response must be an array');
  return Object.freeze(records.filter(validRecord).flatMap((record) => {
    const minecraftVersions = unique(record.game_versions.map(String)).sort();
    const loaders = normaliseLoaders(record.loaders);
    const mcaVersion = stripVersionSuffix(record.version_number, minecraftVersions);
    const publishedAt = Math.floor(Date.parse(record.date_published) / 1000);
    if (!mcaVersion || minecraftVersions.length === 0 || loaders.length === 0 || !Number.isFinite(publishedAt)) return [];
    return [Object.freeze([
      mcaVersion,
      Object.freeze(minecraftVersions),
      Object.freeze(loaders),
      typeCode(String(record.version_type ?? 'release').toLowerCase()),
      publishedAt,
      record.id,
    ])];
  }));
}

function inflate(tuple) {
  return Object.freeze({
    mcaVersion: tuple[MCA_VERSION],
    minecraftVersions: tuple[MINECRAFT_VERSIONS],
    loaders: tuple[LOADERS],
    versionType: tuple[VERSION_TYPE],
    publishedAt: tuple[PUBLISHED_AT],
    id: tuple[VERSION_ID],
    url: `https://modrinth.com/mod/minecraft-comes-alive-reborn/version/${encodeURIComponent(tuple[VERSION_ID])}`,
  });
}

function push(map, key, value) {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function newer(a, b) {
  const rankDifference = typeRank(a.versionType) - typeRank(b.versionType);
  if (rankDifference !== 0) return rankDifference < 0 ? a : b;
  return a.publishedAt >= b.publishedAt ? a : b;
}

export function createModrinthIndex(tuples) {
  const entries = [];
  const byMcaVersion = new Map();
  const byMinecraftVersion = new Map();
  const latestByMinecraftLoader = new Map();
  const supportedMinecraftVersions = new Set();
  const mcaVersions = new Set();
  const loaderSet = new Set();

  for (const tuple of tuples ?? []) {
    if (!validTuple(tuple)) continue;
    const entry = inflate(tuple);
    entries.push(entry);
    mcaVersions.add(entry.mcaVersion);
    push(byMcaVersion, entry.mcaVersion, entry);

    for (const minecraftVersion of entry.minecraftVersions) {
      supportedMinecraftVersions.add(minecraftVersion);
      push(byMinecraftVersion, minecraftVersion, entry);
      for (const loader of entry.loaders) {
        loaderSet.add(loader);
        const key = `${minecraftVersion}\0${loader}`;
        const existing = latestByMinecraftLoader.get(key);
        latestByMinecraftLoader.set(key, existing ? newer(existing, entry) : entry);
      }
    }
  }

  const loaders = Object.freeze([...loaderSet].sort());
  return Object.freeze({
    entries: Object.freeze(entries),
    byMcaVersion,
    byMinecraftVersion,
    latestByMinecraftLoader,
    supportedMinecraftVersions,
    stats: Object.freeze({
      recordCount: entries.length,
      uniqueMcaVersionCount: mcaVersions.size,
      minecraftVersionCount: supportedMinecraftVersions.size,
      loaderCount: loaders.length,
      loaders,
    }),
  });
}

function ensureIndex(catalogue) {
  if (catalogue?.byMcaVersion instanceof Map) return catalogue;
  return createModrinthIndex(catalogue ?? []);
}

function latestEntry(entries) {
  let latest = null;
  for (const entry of entries ?? []) latest = latest ? newer(latest, entry) : entry;
  return latest;
}

export function hasMcaVersion(catalogue, mcaVersion) {
  return ensureIndex(catalogue).byMcaVersion.has(mcaVersion);
}

export function supportsMinecraftVersion(catalogue, minecraftVersion) {
  return ensureIndex(catalogue).supportedMinecraftVersions.has(minecraftVersion);
}

export function isModrinthCatalogueAvailable(catalogue) {
  return ensureIndex(catalogue).entries.length > 0;
}

export function findLatestCompatible(catalogue, { minecraftVersion, loader = null } = {}) {
  const index = ensureIndex(catalogue);
  if (index.entries.length === 0 || !minecraftVersion) {
    return { status: 'none', entry: null, loaders: [], url: MODRINTH_VERSIONS_URL };
  }

  const compatible = index.byMinecraftVersion.get(minecraftVersion) ?? [];
  if (compatible.length === 0) return { status: 'none', entry: null, loaders: [], url: MODRINTH_VERSIONS_URL };

  if (loader) {
    const entry = index.latestByMinecraftLoader.get(`${minecraftVersion}\0${loader}`) ?? null;
    return entry
      ? { status: 'direct', entry, loaders: [loader], url: entry.url }
      : { status: 'none', entry: null, loaders: [loader], url: MODRINTH_VERSIONS_URL };
  }

  const loaders = unique(compatible.flatMap((entry) => entry.loaders)).sort();
  const latestByLoader = loaders
    .map((candidateLoader) => ({
      loader: candidateLoader,
      entry: index.latestByMinecraftLoader.get(`${minecraftVersion}\0${candidateLoader}`) ?? null,
    }))
    .filter(({ entry }) => entry);

  if (latestByLoader.length === 0) return { status: 'none', entry: null, loaders, url: MODRINTH_VERSIONS_URL };
  const versions = unique(latestByLoader.map(({ entry }) => entry.mcaVersion));
  if (versions.length !== 1) {
    return { status: 'loader-required', entry: null, loaders, url: MODRINTH_VERSIONS_URL };
  }

  const entry = latestEntry(latestByLoader.map(({ entry: candidate }) => candidate));
  return { status: 'direct', entry, loaders, url: entry.url };
}

export function checkCompatibility(catalogue, { mcaVersion, minecraftVersion, loader = null } = {}) {
  const index = ensureIndex(catalogue);
  if (index.entries.length === 0) {
    return { status: 'catalogue-unavailable', matches: [], recommendation: null, updateAvailable: null };
  }

  const knownEntries = index.byMcaVersion.get(mcaVersion) ?? [];
  if (knownEntries.length === 0) {
    return { status: 'unknown-build', matches: [], recommendation: null, updateAvailable: null };
  }

  const matches = knownEntries.filter((entry) =>
    entry.minecraftVersions.includes(minecraftVersion) && (!loader || entry.loaders.includes(loader))
  );
  if (matches.length > 0) {
    const latest = findLatestCompatible(index, { minecraftVersion, loader });
    const current = latestEntry(matches);
    const updateAvailable = latest.status === 'direct' && latest.entry &&
      latest.entry.mcaVersion !== mcaVersion && latest.entry.publishedAt > current.publishedAt
      ? latest
      : null;
    return { status: 'verified', matches, recommendation: null, updateAvailable };
  }

  return {
    status: 'known-incompatible',
    matches: [],
    knownEntries,
    recommendation: findLatestCompatible(index, { minecraftVersion, loader }),
    updateAvailable: null,
  };
}

export function catalogueStats(catalogue) {
  return ensureIndex(catalogue).stats;
}

export { MODRINTH_VERSIONS_URL };
