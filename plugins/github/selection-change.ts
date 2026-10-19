export function selectionChange(
  next: readonly string[],
  previous: readonly string[],
) {
  return {
    add: next.filter((value) => !previous.includes(value)),
    remove: previous.filter((value) => !next.includes(value)),
  };
}

export function applySelectionChange(
  current: readonly string[],
  next: readonly string[],
  previous: readonly string[] | undefined,
) {
  if (previous === undefined) return [...new Set(next)];
  const { add, remove } = selectionChange(next, previous);
  return [
    ...new Set([...current.filter((value) => !remove.includes(value)), ...add]),
  ];
}
