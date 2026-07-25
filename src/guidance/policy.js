import { checkCompatibility, findLatestCompatible } from '../modrinth/catalogue.js';

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

function fieldDiagnosis(label, detectedLabel, pluralLabel, field) {
  if (field.status === 'present') {
    return {
      missing: [],
      detected: [`${detectedLabel}: \`${field.value}\``],
      reasons: [],
    };
  }

  if (field.status === 'ambiguous') {
    return {
      missing: [`${label} (please confirm one exact version)`],
      detected: [],
      reasons: [`Multiple ${pluralLabel} were found: ${field.values.map((value) => `\`${value}\``).join(', ')}.`],
    };
  }

  return {
    missing: [label],
    detected: [],
    reasons: [`The ${label} is missing.`],
  };
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
    compatibility: diagnosis.compatibility,
    missing: diagnosis.missing,
    recommendation: diagnosis.recommendation?.status ?? null,
    recommendedVersion: diagnosis.recommendation?.entry?.mcaVersion ?? null,
  });
}

export function diagnoseVersions(result, catalogue = null) {
  const resolved = result.resolved ?? {
    minecraft: normaliseField(result.minecraft),
    mca: normaliseField(result.mca),
    loader: normaliseField(result.loader),
    pair: null,
  };
  const minecraftField = normaliseField(resolved.minecraft);
  const mcaField = normaliseField(resolved.mca);
  const loaderField = normaliseField(resolved.loader);
  const minecraft = fieldDiagnosis('Minecraft version', 'Minecraft', 'Minecraft versions', minecraftField);
  const mca = fieldDiagnosis('MCA Reborn version', 'MCA Reborn', 'MCA Reborn versions', mcaField);
  const reasons = [...minecraft.reasons, ...mca.reasons];

  for (const rejected of rejectedMca(result)) {
    if (rejected.reason === 'looks-like-minecraft-version') {
      reasons.push(`\`${rejected.value}\` looks like a Minecraft version, not an MCA Reborn version.`);
    }
  }

  if ((result.vague ?? []).length > 0) reasons.push('Words such as “latest” or “newest” are not an exact version.');

  const exactFields = minecraftField.status === 'present' && mcaField.status === 'present';
  let compatibility = exactFields ? 'catalogue-unavailable' : 'not-checked';
  let recommendation = null;
  let complete = false;
  const missing = unique([...minecraft.missing, ...mca.missing]);

  if (exactFields) {
    const compatibilityResult = checkCompatibility(catalogue, {
      mcaVersion: mcaField.value,
      minecraftVersion: minecraftField.value,
      loader: loaderField.status === 'present' ? loaderField.value : null,
    });
    compatibility = compatibilityResult.status;
    recommendation = compatibilityResult.recommendation ?? null;
    if (compatibility === 'known-incompatible') {
      complete = false;
      missing.push(`Compatible MCA Reborn version for Minecraft \`${minecraftField.value}\``);
      const loaderText = loaderField.status === 'present' ? ` with ${loaderField.value}` : '';
      reasons.push(`MCA Reborn \`${mcaField.value}\` does not match Minecraft \`${minecraftField.value}\`${loaderText} in the public Modrinth catalogue.`);
    } else {
      complete = true;
    }
  } else if (minecraftField.status === 'present') {
    recommendation = findLatestCompatible(catalogue, {
      minecraftVersion: minecraftField.value,
      loader: loaderField.status === 'present' ? loaderField.value : null,
    });
  }

  const detected = unique([
    ...minecraft.detected,
    ...mca.detected,
    ...(loaderField.status === 'present' ? [`Loader: \`${loaderField.value}\``] : []),
  ]);

  const diagnosis = {
    complete,
    missing: unique(missing),
    detected,
    reasons: unique(reasons),
    compatibility,
    recommendation,
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
