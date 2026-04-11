const STOP = new Set(
  'the a an and or for to of in on at by with from as is was are were be been being it this that these those into over out up about not no all any their our your its his her they we you he she them than then so if but'.split(
    ' '
  )
);

/**
 * Stable key for corroboration clustering (not cryptographic).
 */
function normalizeTopic(title, countries = []) {
  if (!title) return '';
  const tokens = String(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const sorted = [...new Set(tokens)].sort().slice(0, 14);
  const geo = [...new Set((countries || []).map(String))].sort().join(',');
  const base = sorted.join('_');
  const full = geo ? `${base}|${geo}` : base;
  return full.slice(0, 256);
}

module.exports = { normalizeTopic, STOP };
