import { normaliseVersion } from '../version/extract.js';

export function canonicalMinecraftVersionId(id) {
  const value = String(id ?? '').trim();
  if (!value) return null;
  return normaliseVersion(value) ?? value.toLowerCase();
}

export function normaliseMinecraftManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.versions)) {
    throw new TypeError('Mojang version manifest must contain a versions array');
  }

  const seen = new Set();
  const releases = [];
  for (const entry of manifest.versions) {
    if (entry?.type !== 'release' || typeof entry.id !== 'string') continue;
    const canonical = canonicalMinecraftVersionId(entry.id);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    releases.push(canonical);
  }
  return Object.freeze(releases);
}

export function createMinecraftVersionIndex(versions) {
  return new Set((versions ?? []).map(canonicalMinecraftVersionId).filter(Boolean));
}

export function hasMinecraftVersion(indexOrVersions, candidate) {
  const canonical = canonicalMinecraftVersionId(candidate);
  if (!canonical) return false;
  if (indexOrVersions instanceof Set) return indexOrVersions.has(canonical);
  return createMinecraftVersionIndex(indexOrVersions).has(canonical);
}

export function minecraftManifestStats(versions, latestRelease = null) {
  const releaseCount = Array.isArray(versions) ? versions.length : versions instanceof Set ? versions.size : 0;
  return {
    versionCount: releaseCount,
    releaseCount,
    latestRelease: latestRelease ?? null,
  };
}
