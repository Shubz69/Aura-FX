/** @param {any[]} trades */
function netPnl(t) {
  if (t?.netPnl != null && Number.isFinite(Number(t.netPnl))) return Number(t.netPnl);
  return Number(t?.pnl) || 0;
}

/**
 * Expectancy by user- or playbook-attributed setup key (TradeZella-style "top setups").
 * @param {any[]} trades
 */
export function computeSetupAttribution(trades) {
  const map = new Map();
  for (const t of trades || []) {
    const status = String(t.tradeStatus || t.status || '').toLowerCase();
    if (status === 'open') continue;
    const rawKey =
      t.playbookSetupKey ||
      t.userSetupKey ||
      t.setupTag ||
      t.setupName ||
      '';
    const key = String(rawKey).trim() || 'Unassigned';
    if (!map.has(key)) map.set(key, { setupKey: key, pnl: 0, n: 0, wins: 0 });
    const o = map.get(key);
    const p = netPnl(t);
    o.pnl += p;
    o.n += 1;
    if (p > 0) o.wins += 1;
  }
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      winRate: row.n > 0 ? (row.wins / row.n) * 100 : 0,
      expectancy: row.n > 0 ? row.pnl / row.n : 0,
    }))
    .sort((a, b) => b.n - a.n);
}
