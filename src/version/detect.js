const VERSION_TOKEN = /(?<!\d)(\d+(?:\.\d+){1,3})(?:\s*[-._ ]?\s*(alpha|beta|rc|pre(?:release)?)[-._ ]*(\d+))?(?!\d)/gi;
const BARE_VERSION = /^\s*(\d+(?:\.\d+){1,3})(?:\s*[-._ ]?\s*(alpha|beta|rc|pre(?:release)?)[-._ ]*(\d+))?\s*$/i;
const MCA_FILE = /\bmca-(?:fabric|forge|neoforge|quilt)-(?<mca>\d+(?:\.\d+){1,3}(?:[-._ ]?(?:alpha|beta|rc|pre(?:release)?)[-._ ]?\d+)?)(?:\+(?<minecraft>\d+(?:\.\d+){1,3}))?/gi;

function normalizeVersion(base, prerelease, prereleaseNumber) {
  if (!prerelease) return base;
  const kind = prerelease.toLowerCase().replace('release', '');
  return `${base}-${kind}.${prereleaseNumber}`;
}

function tokens(text) {
  const found = [];
  for (const match of String(text ?? '').matchAll(VERSION_TOKEN)) {
    found.push({
      value: normalizeVersion(match[1], match[2], match[3]),
      match: match[0],
      index: match.index ?? 0,
    });
  }
  return found;
}

function majorOf(version) {
  return Number.parseInt(version.split('.')[0], 10);
}

function isMinecraftShape(version) {
  const major = majorOf(version);
  return major === 1 || (major >= 26 && major <= 39);
}

function isMcaShape(version) {
  const major = majorOf(version);
  return major >= 5 && major <= 19;
}

function makeField() {
  return { status: 'missing', values: [], evidence: [], rejected: [] };
}

function add(field, value, source, match, confidence = 'high') {
  if (!field.values.includes(value)) field.values.push(value);
  if (!field.evidence.some((item) => item.value === value && item.source === source && item.match === match)) {
    field.evidence.push({ value, source, match, confidence });
  }
}

function reject(field, value, source, match, reason) {
  if (!field.rejected.some((item) => item.value === value && item.source === source && item.reason === reason)) {
    field.rejected.push({ value, source, match, reason });
  }
}

function finalize(field) {
  field.status = field.values.length === 0 ? 'missing' : field.values.length === 1 ? 'present' : 'ambiguous';
  return field;
}

function scanCompoundFiles(text, source, minecraft, mca) {
  for (const match of String(text ?? '').matchAll(MCA_FILE)) {
    const mcaToken = tokens(match.groups.mca)[0];
    if (mcaToken && isMcaShape(mcaToken.value)) add(mca, mcaToken.value, source, match[0]);

    if (match.groups.minecraft) {
      const minecraftToken = tokens(match.groups.minecraft)[0];
      if (minecraftToken && isMinecraftShape(minecraftToken.value)) {
        add(minecraft, minecraftToken.value, source, match[0]);
      }
    }
  }
}

function segmentAfter(line, startIndex) {
  const tail = line.slice(startIndex, startIndex + 160);
  const boundary = tail.search(/(?<![a-z])(?:minecraft|mca|problem|issue|loader|java)\b/i);
  return boundary > 0 ? tail.slice(0, boundary) : tail;
}

function scanLabelSegments(line, pattern, callback) {
  for (const match of line.matchAll(pattern)) {
    const segment = segmentAfter(line, (match.index ?? 0) + match[0].length);
    callback(tokens(segment));
  }
}

function scanLine(line, source, minecraft, mca) {
  scanLabelSegments(
    line,
    /(?:minecraft\s+version\s*[:=-]?\s*|minecraft\s*[:=-]\s*|\bmc\s*[:=-]\s*|for\s+minecraft(?:\s+version)?\s+|for\s+version\s+|(?:version\s+)?(?:fabric|forge|neoforge|quilt)\s+)/gi,
    (lineTokens) => {
      for (const token of lineTokens) {
        if (isMinecraftShape(token.value)) add(minecraft, token.value, source, token.match);
      }
    },
  );

  scanLabelSegments(
    line,
    /(?:(?<![a-z])mca(?:\s+reborn)?\s+version\s*[:=-]?\s*|(?<![a-z])mca\s*[:=-]\s*|(?<![a-z])mca(?:\s+reborn)?\s+(?=\d)|\bmod\s+version\s*[:=-]?\s*)/gi,
    (lineTokens) => {
      for (const token of lineTokens) {
        if (isMcaShape(token.value)) {
          add(mca, token.value, source, token.match);
        } else if (isMinecraftShape(token.value)) {
          add(minecraft, token.value, source, token.match, 'medium');
          reject(mca, token.value, source, token.match, 'looks-like-minecraft-version');
        }
      }
    },
  );
}

function scanText(text, source, minecraft, mca, { allowBare = false } = {}) {
  const value = String(text ?? '');
  scanCompoundFiles(value, source, minecraft, mca);

  for (const line of value.split(/\r?\n/)) scanLine(line, source, minecraft, mca);

  if (allowBare) {
    const match = value.match(BARE_VERSION);
    if (match) {
      const normalized = normalizeVersion(match[1], match[2], match[3]);
      if (isMinecraftShape(normalized)) add(minecraft, normalized, source, match[0], 'medium');
      if (isMcaShape(normalized)) add(mca, normalized, source, match[0], 'medium');
    }
  }
}

export function detectThreadVersions({ tags = [], title = '', messages = [] } = {}) {
  const minecraft = makeField();
  const mca = makeField();
  const vague = new Set();

  for (const tag of tags) {
    const match = String(tag.name ?? '').match(/^\s*MCA\s+(\d+(?:\.\d+){1,3})\s*$/i);
    if (match && isMinecraftShape(match[1])) add(minecraft, match[1], 'tag', tag.name);
  }

  scanText(title, 'title', minecraft, mca);
  for (const token of tokens(title)) {
    if (isMinecraftShape(token.value)) add(minecraft, token.value, 'title', token.match);
    if (/(?<![a-z])mca/i.test(title) && isMcaShape(token.value)) add(mca, token.value, 'title', token.match);
  }

  for (const message of messages) {
    const source = message.position ?? 'message';
    const content = String(message.content ?? '');
    if (/\b(?:latest|newest|current)\b/i.test(content)) {
      for (const match of content.matchAll(/\b(?:latest|newest|current)\b/gi)) vague.add(match[0].toLowerCase());
    }

    scanText(content, source, minecraft, mca, {
      allowBare: message.authorKind === 'thread-owner',
    });

    for (const attachment of message.attachments ?? []) {
      scanCompoundFiles(attachment.name, `${source}-attachment`, minecraft, mca);
    }
  }

  return {
    minecraft: finalize(minecraft),
    mca: finalize(mca),
    vague: [...vague],
  };
}
