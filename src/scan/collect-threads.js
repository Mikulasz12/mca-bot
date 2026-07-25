function compareThreadAge(left, right) {
  const leftTime = left.archivedAtTimestamp;
  const rightTime = right.archivedAtTimestamp;

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const leftId = BigInt(left.id);
  const rightId = BigInt(right.id);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function addUnique(target, seen, threads) {
  for (const thread of threads) {
    if (seen.has(thread.id)) continue;
    seen.add(thread.id);
    target.push(thread);
  }
}

export async function collectThreads({ fetchActive, fetchArchived }) {
  const collected = [];
  const seen = new Set();

  addUnique(collected, seen, await fetchActive());

  let before;
  let previousCursorId;

  while (true) {
    const page = await fetchArchived({ before });
    const threads = page?.threads ?? [];

    if (threads.length === 0) break;

    addUnique(collected, seen, threads);

    if (page.hasMore === false) break;

    const oldest = [...threads].sort(compareThreadAge)[0];
    if (!oldest || oldest.id === previousCursorId) break;

    previousCursorId = oldest.id;
    before = oldest;
  }

  return collected;
}
