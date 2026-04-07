/**
 * Split an integer point budget across checklist rows (stable, integer weights).
 */
export function allocateEvenPointsById(items, budget) {
  const n = items.length;
  if (n === 0 || budget <= 0) return {};
  const base = Math.floor(budget / n);
  let rem = budget - base * n;
  const out = {};
  items.forEach((it, i) => {
    out[it.id] = base + (i < rem ? 1 : 0);
  });
  return out;
}

export function sumCheckedPoints(items, checkedSet, budget) {
  if (!items.length || budget <= 0) return 0;
  const pmap = allocateEvenPointsById(items, budget);
  return items.reduce((s, it) => s + (checkedSet.has(it.id) ? pmap[it.id] || 0 : 0), 0);
}
