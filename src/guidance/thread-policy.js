export const EXCLUDED_GUIDANCE_TAG_NAMES = Object.freeze([
  'Server Help',
  'Non-MCA Help',
  'Translation Help',
]);

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

export function hasExcludedGuidanceTag(thread, excludedTagNames = EXCLUDED_GUIDANCE_TAG_NAMES) {
  const excluded = new Set(excludedTagNames.map((name) => normaliseForumTagName(name)));
  return appliedForumTags(thread).some(({ name }) => excluded.has(normaliseForumTagName(name)));
}
