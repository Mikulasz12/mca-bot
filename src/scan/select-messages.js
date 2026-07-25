function compareSnowflakes(left, right) {
  const leftId = BigInt(left.id);
  const rightId = BigInt(right.id);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export function selectStarterAndReplies(starter, messages, replyLimit = 5) {
  const replies = [...messages]
    .filter((message) => message.id !== starter.id)
    .sort(compareSnowflakes)
    .slice(0, replyLimit);

  return { starter, replies };
}
