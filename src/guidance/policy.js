function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function fieldDiagnosis(label, detectedLabel, pluralLabel, field) {
  if (field.status === 'present') {
    return {
      missing: [],
      detected: [`${detectedLabel}: \`${field.values[0]}\``],
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

export function diagnoseVersions(result) {
  const minecraft = fieldDiagnosis('Minecraft version', 'Minecraft', 'Minecraft versions', result.minecraft);
  const mca = fieldDiagnosis('MCA Reborn version', 'MCA Reborn', 'MCA Reborn versions', result.mca);
  const reasons = [...minecraft.reasons, ...mca.reasons];

  for (const rejected of result.mca.rejected ?? []) {
    if (rejected.reason === 'looks-like-minecraft-version') {
      reasons.push(`\`${rejected.value}\` looks like a Minecraft version, not an MCA Reborn version.`);
    }
  }

  if ((result.vague ?? []).length > 0) {
    reasons.push('Words such as “latest” or “newest” are not an exact version.');
  }

  return {
    complete: result.minecraft.status === 'present' && result.mca.status === 'present',
    missing: unique([...minecraft.missing, ...mca.missing]),
    detected: unique([...minecraft.detected, ...mca.detected]),
    reasons: unique(reasons),
  };
}
