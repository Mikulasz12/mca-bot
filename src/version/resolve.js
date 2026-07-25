function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function field(values = []) {
  const deduped = unique(values);
  if (deduped.length === 0) return { status: 'missing', value: null, values: [] };
  if (deduped.length === 1) return { status: 'present', value: deduped[0], values: deduped };
  return { status: 'ambiguous', value: null, values: deduped };
}

export function resolveVersionEvidence(sources = []) {
  let minecraft = field();
  let mca = field();
  let loader = field();
  let pair = null;

  const ordered = [...sources].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (const source of ordered) {
    const pairs = source.pairs ?? [];
    if (pairs.length > 0) {
      const uniquePairs = [];
      for (const item of pairs) {
        if (!uniquePairs.some((candidate) => candidate.mca === item.mca && candidate.minecraft === item.minecraft && candidate.loader === item.loader)) {
          uniquePairs.push(item);
        }
      }
      minecraft = field(uniquePairs.map((item) => item.minecraft));
      mca = field(uniquePairs.map((item) => item.mca));
      if (uniquePairs.length === 1) {
        pair = { ...uniquePairs[0] };
        if (pair.loader) loader = field([pair.loader]);
      } else {
        pair = null;
        const pairLoaders = unique(uniquePairs.map((item) => item.loader));
        if (pairLoaders.length > 0) loader = field(pairLoaders);
      }
      continue;
    }

    if ((source.minecraft ?? []).length > 0) {
      minecraft = field(source.minecraft);
      pair = null;
    }
    if ((source.mca ?? []).length > 0) {
      mca = field(source.mca);
      pair = null;
    }
    if ((source.loaders ?? []).length > 0) loader = field(source.loaders);
  }

  return { minecraft, mca, loader, pair };
}
