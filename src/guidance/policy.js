import {
  checkCompatibility,
  findLatestCompatible,
  hasMcaVersion,
  isModrinthCatalogueAvailable,
  supportsMinecraftVersion,
} from '../modrinth/catalogue.js';
import { findNewerCompatiblePrereleases } from '../modrinth/prereleases.js';
import { hasMinecraftVersion } from '../minecraft/catalogue.js';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normaliseField(field) {
  if (!field) return { status: 'missing', value: null, values: [] };
  const values = [...(field.values ?? [])];
  const status = field.status ?? (values.length === 0 ? 'missing' : values.length === 1 ? 'present' : 'ambiguous');
  return {
    status,
    value: field.value ?? (status === 'present' ? values[0] ?? null : null),
    values,
  };
}

function fieldDiagnosis(label, pluralLabel, field) {
  if (field.status === 'present') return { missing: [], reasons: [] };
  if (field.status === 'ambiguous') {
    return {
      missing: [`${label} (please confirm one exact version)`],
      reasons: [`Multiple ${pluralLabel} were found: ${field.values.map((value) => `\`${value}\``).join(', ')}.`],
    };
  }
  return { missing: [label], reasons: [`The ${label} is missing.`] };
}

function rejectedMca(result) {
  const raw = [...(result.mca?.rejected ?? [])];
  for (const source of result.sources ?? []) raw.push(...(source.rejectedMca ?? []));
  return raw;
}

function diagnosisFingerprint(diagnosis) {
  return JSON.stringify({
    minecraft: diagnosis.minecraftField,
    mca: diagnosis.mcaField,
    loader: diagnosis.loaderField,
    minecraftValidity: diagnosis.minecraftValidity,
    mcaValidity: diagnosis.mcaValidity,
    compatibility: diagnosis.compatibility,
    missing: diagnosis.missing,
    invalid: diagnosis.invalid,
    recommendation: diagnosis.recommendation?.status ?? null,
    recommendedVersion: diagnosis.recommendation?.entry?.mcaVersion ?? null,
    updateVersion: diagnosis.updateAvailable?.entry?.mcaVersion ?? null,
    betaVersion: diagnosis.prereleases?.beta?.mcaVersion ?? null,
    alphaVersion: diagnosis.prereleases?.alpha?.mcaVersion ?? null,
  });
}

function minecraftState({ minecraftField, catalogue, minecraftCatalogue, strongUnknownPair }) {
  if (minecraftField.status !== 'present') {
    return { eligible: false, validity: minecraftField.status, reason: null, missing: null };
  }

  const mojangAvailable = minecraftCatalogue instanceof Set
    ? minecraftCatalogue.size > 0
    : Array.isArray(minecraftCatalogue) && minecraftCatalogue.length > 0;
  const modrinthAvailable = isModrinthCatalogueAvailable(catalogue);
  const existsInMojang = mojangAvailable ? hasMinecraftVersion(minecraftCatalogue, minecraftField.value) : null;
  const supportedByMca = modrinthAvailable
    ? supportsMinecraftVersion(catalogue, minecraftField.value)
    : null;

  if (mojangAvailable && !existsInMojang) {
    return {
      eligible: false,
      validity: 'unknown-minecraft-version',
      missing: 'Recognised Minecraft Java version',
      reason: `Minecraft \`${minecraftField.value}\` is not present in the official Mojang Java release manifest.`,
    };
  }

  if (mojangAvailable && existsInMojang && modrinthAvailable && !supportedByMca) {
    return {
      eligible: false,
      validity: 'unsupported-by-mca',
      missing: 'Minecraft version supported by MCA Reborn',
      reason: `Minecraft \`${minecraftField.value}\` exists, but no listed MCA Reborn release on Modrinth supports it.`,
    };
  }

  if (!mojangAvailable && modrinthAvailable && !supportedByMca && !strongUnknownPair) {
    return {
      eligible: false,
      validity: 'unsupported-by-mca',
      missing: 'Minecraft version supported by MCA Reborn',
      reason: `Minecraft \`${minecraftField.value}\` is not supported by, and is not listed for, any MCA Reborn release on Modrinth.`,
    };
  }

  return {
    eligible: true,
    validity: mojangAvailable ? 'recognised' : supportedByMca ? 'supported-by-mca' : 'syntax-fallback',
    missing: null,
    reason: null,
  };
}

function mcaState({ mcaField, catalogue, strongEvidence }) {
  if (mcaField.status !== 'present') {
    return { eligible: false, validity: mcaField.status, reason: null, missing: null };
  }

  if (!isModrinthCatalogueAvailable(catalogue)) {
    return { eligible: true, validity: 'syntax-fallback', reason: null, missing: null };
  }

  const listed = hasMcaVersion(catalogue, mcaField.value);
  if (listed) return { eligible: true, validity: 'listed-public-release', reason: null, missing: null };
  if (strongEvidence) {
    return {
      eligible: true,
      validity: 'unknown-build-with-strong-evidence',
      reason: null,
      missing: null,
    };
  }

  return {
    eligible: false,
    validity: 'unverified-bare-build',
    missing: 'MCA Reborn version or complete MCA JAR filename',
    reason: `MCA Reborn \`${mcaField.value}\` is not a listed public release on Modrinth. If it is a development build, send the complete MCA JAR filename or a complete MCA+Minecraft version pair.`,
  };
}

export function diagnoseVersions(result, catalogue = null, minecraftCatalogue = null) {
  const resolved = result.resolved ?? {
    minecraft: normaliseField(result.minecraft),
    mca: normaliseField(result.mca),
    loader: normaliseField(result.loader),
    pair: null,
  };
  const minecraftField = normaliseField(resolved.minecraft);
  const mcaField = normaliseField(resolved.mca);
  const loaderField = normaliseField(resolved.loader);
  const minecraftBase = fieldDiagnosis('Minecraft version', 'Minecraft versions', minecraftField);
  const mcaBase = fieldDiagnosis('MCA Reborn version', 'MCA Reborn versions', mcaField);
  const reasons = [...minecraftBase.reasons, ...mcaBase.reasons];
  const invalid = [];
  const missing = [...minecraftBase.missing, ...mcaBase.missing];

  for (const rejected of rejectedMca(result)) {
    if (rejected.reason === 'looks-like-minecraft-version') {
      reasons.push(`\`${rejected.value}\` looks like a Minecraft version, not an MCA Reborn version.`);
    }
  }
  if ((result.vague ?? []).length > 0) reasons.push('Words such as “latest” or “newest” are not an exact version.');

  const strongEvidence = Boolean(resolved.pair?.explicit);
  const publicMcaKnown = mcaField.status === 'present' && hasMcaVersion(catalogue, mcaField.value);
  const strongUnknownPair = strongEvidence && !publicMcaKnown;

  const minecraft = minecraftState({
    minecraftField,
    catalogue,
    minecraftCatalogue,
    strongUnknownPair,
  });
  const mca = mcaState({ mcaField, catalogue, strongEvidence });

  if (minecraft.reason) {
    reasons.push(minecraft.reason);
    invalid.push(minecraft.reason);
  }
  if (minecraft.missing) missing.push(minecraft.missing);
  if (mca.reason) {
    reasons.push(mca.reason);
    invalid.push(mca.reason);
  }
  if (mca.missing) missing.push(mca.missing);

  const exactEligible = minecraftField.status === 'present' && mcaField.status === 'present' &&
    minecraft.eligible && mca.eligible;
  let compatibility = exactEligible ? 'catalogue-unavailable' : 'not-checked';
  let recommendation = null;
  let updateAvailable = null;
  let complete = false;

  if (exactEligible) {
    const compatibilityResult = checkCompatibility(catalogue, {
      mcaVersion: mcaField.value,
      minecraftVersion: minecraftField.value,
      loader: loaderField.status === 'present' ? loaderField.value : null,
    });
    compatibility = compatibilityResult.status;
    recommendation = compatibilityResult.recommendation ?? null;
    updateAvailable = compatibilityResult.updateAvailable ?? null;
    if (compatibility === 'known-incompatible') {
      missing.push(`Compatible MCA Reborn version for Minecraft \`${minecraftField.value}\``);
      const loaderText = loaderField.status === 'present' ? ` with ${loaderField.value}` : '';
      const reason = `MCA Reborn \`${mcaField.value}\` does not match Minecraft \`${minecraftField.value}\`${loaderText} in the public Modrinth catalogue.`;
      reasons.push(reason);
      invalid.push(reason);
    } else {
      complete = true;
    }
  } else if (minecraft.eligible && minecraftField.status === 'present') {
    recommendation = findLatestCompatible(catalogue, {
      minecraftVersion: minecraftField.value,
      loader: loaderField.status === 'present' ? loaderField.value : null,
    });
  }

  const prereleases = minecraft.eligible && minecraftField.status === 'present'
    ? findNewerCompatiblePrereleases(catalogue, {
      minecraftVersion: minecraftField.value,
      loader: loaderField.status === 'present' ? loaderField.value : null,
    })
    : { beta: null, alpha: null };

  const detected = unique([
    ...(minecraft.eligible && minecraftField.status === 'present' ? [`Minecraft: \`${minecraftField.value}\``] : []),
    ...(mca.eligible && mcaField.status === 'present' ? [`MCA Reborn: \`${mcaField.value}\``] : []),
    ...(loaderField.status === 'present' ? [`Loader: \`${loaderField.value}\``] : []),
  ]);

  const diagnosis = {
    complete,
    missing: unique(missing),
    detected,
    reasons: unique(reasons),
    invalid: unique(invalid),
    compatibility,
    recommendation,
    updateAvailable,
    prereleases,
    minecraftEligible: minecraft.eligible,
    mcaEligible: mca.eligible,
    minecraftValidity: minecraft.validity,
    mcaValidity: mca.validity,
    minecraftVersion: minecraftField.value,
    mcaVersion: mcaField.value,
    loader: loaderField.value,
    minecraftField,
    mcaField,
    loaderField,
    pair: resolved.pair ?? null,
  };
  diagnosis.fingerprint = diagnosisFingerprint(diagnosis);
  return diagnosis;
}
