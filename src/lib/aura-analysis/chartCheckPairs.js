/**
 * Merge GET /api/market/watchlist symbols into chart-checker pair options.
 * Base: getInstrumentsByCategory() (trade calculator / risk engine universe).
 * Watchlist: same GROUPS as All Markets — adds any symbols not already listed.
 */

import { getInstrumentsByCategory } from './instruments';

/** Map defaultWatchlist group keys → assetClass keys from instruments.js */
const WATCHLIST_TO_INSTR_CATEGORY = {
  crypto: 'crypto',
  forex: 'forex',
  commodities: 'commodity',
  indices: 'index',
  stocks: 'stock',
  etfs: 'stock',
  macro: 'macro',
};

export function getBaseChartCheckPairGroups() {
  return getInstrumentsByCategory();
}

/**
 * @param {object} watchlistPayload - API `data.watchlist` (contains `groups`)
 * @param {ReturnType<typeof getInstrumentsByCategory>} baseGroups
 */
export function mergeWatchlistIntoInstrumentGroups(watchlistPayload, baseGroups) {
  if (!watchlistPayload?.groups) return baseGroups;

  const groups = baseGroups.map((g) => ({
    ...g,
    instruments: [...g.instruments],
  }));

  const findCategory = (cat) => groups.find((g) => g.category === cat);
  const ensureGroup = (category, labelFallback) => {
    let g = findCategory(category);
    if (!g) {
      g = {
        category,
        label: labelFallback || category,
        instruments: [],
      };
      groups.push(g);
    }
    return g;
  };

  const wlKeys = Object.keys(watchlistPayload.groups).sort(
    (a, b) => (watchlistPayload.groups[a].order || 0) - (watchlistPayload.groups[b].order || 0)
  );

  for (const wlKey of wlKeys) {
    const mappedCat = WATCHLIST_TO_INSTR_CATEGORY[wlKey];
    if (!mappedCat) continue;
    const block = watchlistPayload.groups[wlKey];
    const label = block.name || wlKey;
    const target = ensureGroup(mappedCat, label);
    if (!target.label || target.label === mappedCat) target.label = label;

    const seen = new Set(target.instruments.map((i) => String(i.symbol).toUpperCase()));
    for (const row of block.symbols || []) {
      const sym = String(row.symbol || '').trim();
      if (!sym) continue;
      const up = sym.toUpperCase();
      if (seen.has(up)) continue;
      seen.add(up);
      target.instruments.push({
        symbol: sym,
        displayName: row.displayName || sym,
      });
    }
  }

  for (const g of groups) {
    g.instruments.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
  }
  return groups;
}
