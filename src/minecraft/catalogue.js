import { normaliseVersion } from '../version/extract.js';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function canonicalMinecraftVersionId(id) {
  const value = String(id ?? '').trim();
  if (!value) return null;
  return normaliseVersion(value) ?? value.toLowerCase();
}

function validEntry(entry) {
  return entry && typeof entry.id === 'string' && entry.id.trim() &&
    typeof entry.type === 'string' && typeof entry.url === 'string' &&
    typeof entry.time === 'string' && typeof entry.releaseTime === 'string';
}

export function normaliseMinecraftManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.versions)) {
    throw new TypeError('Mojang version manifest must contain a versions array');
  }

  return Object.freeze(
    manifest.versions
      .filter(validEntry)
      .map((entry) => Object.freeze({
        id: entry.id,
        canonicalId: canonicalMinecraftVersionId(entry.id),
        type: String(entry.type).toLowerCase(),
        url: entry.url,
        updatedAt: entry.time,
        releasedAt: entry.releaseTime,
        sha1: typeof entry.sha1 === 'string' ? entry.sha1 : null,
        complianceLevel: Number.isInteger(entry.complianceLevel) ? entry.complianceLevel : null,
      })),
  );
}

export function hasMinecraftVersion(versions, candidate) {
  const canonical = canonicalMinecraftVersionId(candidate);
  if (!canonical || !Array.isArray(versions)) return false;
  return versions.some((entry) => entry?.canonicalId === canonical);
}

export function minecraftManifestStats(versions, latest = {}) {
  const entries = Array.isArray(versions) ? versions : [];
  const count = (type) => entries.filter((entry) => entry.type === type).length;
  return {
    versionCount: entries.length,
    releaseCount: count('release'),
    snapshotCount: count('snapshot'),
    oldBetaCount: count('old_beta'),
    oldAlphaCount: count('old_alpha'),
    latestRelease: latest?.release ?? null,
    latestSnapshot: latest?.snapshot ?? null,
  };
}

export function minecraftVersionIds(versions) {
  return Object.freeze(unique((versions ?? []).map((entry) => entry.canonicalId)));
}
