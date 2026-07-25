const VERSION_CORE = String.raw`\d+(?:\.\d+){1,3}(?:\s*[-._ ]?\s*(?:alpha|beta|rc|pre(?:release)?)[-._ ]*\d+)?`;
const VERSION_TOKEN = new RegExp(`(?<!\\d)(${VERSION_CORE})(?!\\d)`, 'gi');
const BARE_VERSION = new RegExp(`^\\s*(${VERSION_CORE})\\s*$`, 'i');
const INFORMAL_PAIR = new RegExp(`(?<![\\d.])(?<mca>${VERSION_CORE})\\s*(?:\\+|/)\\s*(?<minecraft>\\d+(?:\\.\\d+){1,3})(?![\\d.])`, 'gi');
const MCA_FILE = new RegExp(`\\bmca-(?<loader>fabric|forge|neoforge|quilt)-(?<mca>${VERSION_CORE})(?:\\+(?<minecraft>\\d+(?:\\.\\d+){1,3}))?(?:\\.jar)?`, 'gi');
const LOADER = /\b(neo\s*forge|neoforge|fabric|quilt|forge)\b/gi;
const FORUM_MINECRAFT_TAG = new RegExp(`^\\s*MCA\\s+(${VERSION_CORE})\\s*$`, 'i');

export function normaliseVersion(value) {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+){1,3})(?:\s*[-._ ]?\s*(alpha|beta|rc|pre(?:release)?)[-._ ]*(\d+))?$/i);
  if (!match) return null;
  if (!match[2]) return match[1];
  const kind = match[2].toLowerCase().replace('release', '');
  return `${match[1]}-${kind}.${match[3]}`;
}

export function majorOf(version) {
  return Number.parseInt(String(version).split('.')[0], 10);
}

export function isMinecraftShape(version) {
  const major = majorOf(version);
  return major === 1 || (major >= 26 && major <= 39);
}

export function isMcaShape(version) {
  const major = majorOf(version);
  return major >= 5 && major <= 19;
}

export function normaliseLoader(value) {
  const compact = String(value ?? '').toLowerCase().replace(/\s+/g, '');
  if (compact === 'neoforge') return 'neoforge';
  if (compact === 'fabric' || compact === 'forge' || compact === 'quilt') return compact;
  return null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokens(text) {
  const found = [];
  for (const match of String(text ?? '').matchAll(VERSION_TOKEN)) {
    const value = normaliseVersion(match[1]);
    if (value) found.push({ value, match: match[0], index: match.index ?? 0 });
  }
  return found;
}

function addPair(pairs, pair) {
  if (!pairs.some((item) => item.mca === pair.mca && item.minecraft === pair.minecraft && item.loader === pair.loader)) {
    pairs.push(pair);
  }
}

function collectLabelled(text, pattern) {
  const values = [];
  for (const match of String(text ?? '').matchAll(pattern)) {
    const value = normaliseVersion(match.groups?.version ?? match[1]);
    if (value) values.push(value);
  }
  return unique(values);
}

export function extractVersionEvidence({
  text = '',
  source = 'message',
  owner = false,
  priority = 0,
  inferTitle = false,
  forumTag = false,
} = {}) {
  const value = String(text ?? '');
  const minecraft = [];
  const mca = [];
  const rejectedMca = [];
  const pairs = [];
  const loaders = [];
  const vague = [];

  for (const match of value.matchAll(LOADER)) {
    const loader = normaliseLoader(match[1]);
    if (loader) loaders.push(loader);
  }

  if (forumTag) {
    const tagMatch = value.match(FORUM_MINECRAFT_TAG);
    const version = tagMatch ? normaliseVersion(tagMatch[1]) : null;
    if (version && isMinecraftShape(version)) minecraft.push(version);
    return {
      source,
      owner,
      priority,
      minecraft: unique(minecraft),
      mca: [],
      rejectedMca: [],
      pairs: [],
      loaders: unique(loaders),
      vague: [],
    };
  }

  for (const match of value.matchAll(MCA_FILE)) {
    const mcaVersion = normaliseVersion(match.groups.mca);
    const minecraftVersion = match.groups.minecraft ? normaliseVersion(match.groups.minecraft) : null;
    const loader = normaliseLoader(match.groups.loader);
    if (mcaVersion && isMcaShape(mcaVersion)) mca.push(mcaVersion);
    if (minecraftVersion && isMinecraftShape(minecraftVersion)) minecraft.push(minecraftVersion);
    if (loader) loaders.push(loader);
    if (mcaVersion && minecraftVersion && isMcaShape(mcaVersion) && isMinecraftShape(minecraftVersion)) {
      addPair(pairs, { mca: mcaVersion, minecraft: minecraftVersion, loader, source, explicit: true });
    }
  }

  for (const match of value.matchAll(INFORMAL_PAIR)) {
    const mcaVersion = normaliseVersion(match.groups.mca);
    const minecraftVersion = normaliseVersion(match.groups.minecraft);
    if (!mcaVersion || !minecraftVersion || !isMcaShape(mcaVersion) || !isMinecraftShape(minecraftVersion)) continue;
    mca.push(mcaVersion);
    minecraft.push(minecraftVersion);
    addPair(pairs, { mca: mcaVersion, minecraft: minecraftVersion, loader: null, source, explicit: true });
  }

  const minecraftLabelled = collectLabelled(
    value,
    /(?:minecraft(?:\s+version)?|\bmc)\s*[:=-]?\s*(?<version>\d+(?:\.\d+){1,3}(?:\s*[-._ ]?\s*(?:alpha|beta|rc|pre(?:release)?)[-._ ]*\d+)?)/gi,
  );
  for (const version of minecraftLabelled) {
    if (isMinecraftShape(version)) minecraft.push(version);
  }

  const mcaLabelled = collectLabelled(
    value,
    /(?:\bmca(?:\s+reborn)?(?:\s+version)?|\bmod\s+version)\s*[:=-]?\s*(?<version>\d+(?:\.\d+){1,3}(?:\s*[-._ ]?\s*(?:alpha|beta|rc|pre(?:release)?)[-._ ]*\d+)?)/gi,
  );
  for (const version of mcaLabelled) {
    if (isMcaShape(version)) mca.push(version);
    else if (isMinecraftShape(version)) {
      minecraft.push(version);
      rejectedMca.push({ value: version, reason: 'looks-like-minecraft-version', source });
    }
  }

  if (minecraftLabelled.length === 1 && mcaLabelled.length === 1) {
    const minecraftVersion = minecraftLabelled[0];
    const mcaVersion = mcaLabelled[0];
    if (isMinecraftShape(minecraftVersion) && isMcaShape(mcaVersion)) {
      addPair(pairs, {
        mca: mcaVersion,
        minecraft: minecraftVersion,
        loader: unique(loaders).length === 1 ? unique(loaders)[0] : null,
        source,
        explicit: true,
      });
    }
  }

  const bare = value.match(BARE_VERSION);
  if (owner && bare) {
    const version = normaliseVersion(bare[1]);
    if (version && isMinecraftShape(version)) minecraft.push(version);
    if (version && isMcaShape(version)) mca.push(version);
  }

  if (inferTitle) {
    const bareTitle = value.match(BARE_VERSION);
    const bareTitleVersion = bareTitle ? normaliseVersion(bareTitle[1]) : null;
    if (bareTitleVersion && isMcaShape(bareTitleVersion)) mca.push(bareTitleVersion);

    for (const token of tokens(value)) {
      if (isMinecraftShape(token.value)) minecraft.push(token.value);
      if (/\bmca\b/i.test(value) && isMcaShape(token.value)) mca.push(token.value);
    }
  }

  for (const match of value.matchAll(/\b(?:latest|newest|current)\b/gi)) vague.push(match[0].toLowerCase());

  const uniqueLoaders = unique(loaders);
  for (const pair of pairs) {
    if (!pair.loader && uniqueLoaders.length === 1) pair.loader = uniqueLoaders[0];
  }

  return {
    source,
    owner,
    priority,
    minecraft: unique(minecraft),
    mca: unique(mca),
    rejectedMca,
    pairs,
    loaders: uniqueLoaders,
    vague: unique(vague),
  };
}

export function mergeSourceEvidence(base, extra) {
  const merged = {
    ...base,
    minecraft: unique([...(base.minecraft ?? []), ...(extra.minecraft ?? [])]),
    mca: unique([...(base.mca ?? []), ...(extra.mca ?? [])]),
    rejectedMca: [...(base.rejectedMca ?? []), ...(extra.rejectedMca ?? [])],
    pairs: [...(base.pairs ?? [])],
    loaders: unique([...(base.loaders ?? []), ...(extra.loaders ?? [])]),
    vague: unique([...(base.vague ?? []), ...(extra.vague ?? [])]),
  };
  for (const pair of extra.pairs ?? []) addPair(merged.pairs, pair);
  if (merged.loaders.length === 1) {
    for (const pair of merged.pairs) if (!pair.loader) pair.loader = merged.loaders[0];
  }
  return merged;
}
