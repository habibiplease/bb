export function applyLabelChange(
  current: readonly string[],
  next: readonly string[],
  previous: readonly string[] | undefined,
) {
  if (previous === undefined) return [...next];
  const removed = previous.filter((id) => !next.includes(id));
  const added = next.filter((id) => !previous.includes(id));
  return [
    ...new Set([...current.filter((id) => !removed.includes(id)), ...added]),
  ];
}
