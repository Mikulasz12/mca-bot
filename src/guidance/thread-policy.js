export const EXCLUDED_GUIDANCE_TAG_NAMES = Object.freeze([
  'Server Help',
  'Non-MCA Help',
  'Translation Help',
]);

const EXCLUDED_GUIDANCE_TAG_KEYS = new Set(
  EXCLUDED_GUIDANCE_TAG_NAMES.map((name) => normaliseForumTagName(name)),
);

export function normaliseForumTagName(name) {
  return String(name ?? '').trim().toLowerCase();
}

export function appliedForumTags(thread) {
  const namesById = new Map(
    (thread?.parent?.availableTags ?? []).map((tag) => [String(tag.id), tag.name]),
  );
  return [...(thread?.appliedTags ?? [])].map((id) => ({
    id: String(id),
    name: namesById.get(String(id)) ?? null,
  }));
}

export function hasExcludedGuidanceTag(thread) {
  return appliedForumTags(thread).some(({ name }) =>
    EXCLUDED_GUIDANCE_TAG_KEYS.has(normaliseForumTagName(name)),
  );
}
