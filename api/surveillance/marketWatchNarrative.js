/**
 * Rules-first narrative lines for the market-watch strip (pure).
 * Pass 4: tie developing stories + region pressure into instrument narratives.
 */

const ENERGY_SYMS = new Set(['WTI', 'BRENT', 'SHIPPING']);
const RATES_SYMS = new Set(['US2Y', 'US10Y', 'DXY']);
const RISK_SYMS = new Set(['SPX', 'NASDAQ', 'BTC', 'ETH', 'RISK']);

function topSymbols(marketWatch, pred, limit = 3) {
  return (marketWatch || []).filter((x) => pred(x.symbol)).slice(0, limit).map((x) => x.symbol);
}

function storyDigestLines(digest) {
  const stories = digest?.developingStories || [];
  return stories.slice(0, 3).map((s) => {
    const leg = (s.instruments && s.instruments.length ? s.instruments.slice(0, 3).join('/') : 'multi-asset') + '';
    return `${s.headline?.slice(0, 72) || 'Story'} · ${leg} · src ${s.sources?.length || 0}`;
  });
}

function regionHotspots(digest) {
  const rp = digest?.regionPressure || [];
  return rp.slice(0, 3).map((r) => `${r.region} (${r.label})`);
}

function buildMarketWatchNarrative(events, aggregates, digest) {
  const mw = aggregates?.marketWatch || [];
  const n = events.length || 1;
  let riskOff = 0;
  let riskOn = 0;
  let neutral = 0;
  for (const e of events) {
    const b = e.risk_bias || 'neutral';
    if (b === 'risk_off') riskOff += 1;
    else if (b === 'risk_on') riskOn += 1;
    else neutral += 1;
  }
  const roPct = Math.round((riskOff / n) * 100);
  const rnPct = Math.round((riskOn / n) * 100);

  let cbCount = 0;
  let sanCount = 0;
  let conflictish = 0;
  for (const e of events) {
    if (e.event_type === 'central_bank') cbCount += 1;
    if (e.event_type === 'sanctions') sanCount += 1;
    if (e.event_type === 'conflict' || /sanction|military|strike|missile|border|ceasefire/i.test(`${e.title}`))
      conflictish += 1;
  }

  const storyLines = storyDigestLines(digest);
  const hotRegs = regionHotspots(digest);

  const groups = [];

  const fxSyms = topSymbols(mw, (s) => ['DXY', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF'].includes(s));
  let fxImpl = 'Mixed — headline FX two-way';
  if (riskOff > riskOn + n * 0.08) fxImpl = 'Skew defensive — USD / haven channels drawing flow';
  else if (riskOn > riskOff + n * 0.08) fxImpl = 'Skew constructive for risk — carry / growth beta favored vs USD';
  if (hotRegs.length) fxImpl += ` · Regions: ${hotRegs.join(', ')}`;
  const fxConf = Math.abs(riskOff - riskOn) > n * 0.22 ? 'medium' : 'low';
  groups.push({
    groupId: 'fx',
    label: 'FX',
    implication: fxImpl,
    reasons: [
      `Tape risk-off ~${roPct}% · risk-on ~${rnPct}%`,
      fxSyms.length ? `Flow focus: ${fxSyms.join(', ')}` : 'No dominant FX hit',
      ...storyLines.slice(0, 1),
    ].filter(Boolean),
    confidence: fxConf,
  });

  const rateSyms = topSymbols(mw, (s) => RATES_SYMS.has(s));
  let rateImpl = 'Curve neutral vs headlines';
  if (cbCount >= Math.max(3, n * 0.12)) rateImpl = 'Central-bank density elevated — front-end / curve repricing risk';
  else if (sanCount >= Math.max(2, n * 0.08)) rateImpl = 'Sanctions / policy headlines — duration and credit premia on watch';
  groups.push({
    groupId: 'rates',
    label: 'Rates / USD liquidity',
    implication: rateImpl,
    reasons: [
      `CB-tagged items: ${cbCount}`,
      rateSyms.length ? `Symbols: ${rateSyms.join(', ')}` : 'No strong rate-symbol cluster',
      ...storyLines.slice(1, 2),
    ].filter(Boolean),
    confidence: cbCount >= 3 || rateSyms.length ? 'medium' : 'low',
  });

  const enSyms = topSymbols(mw, (s) => ENERGY_SYMS.has(s));
  const enHits = (events || []).filter((e) => /energy|oil|opec|lng|gas|power|grid/i.test(`${e.title} ${e.event_type}`)).length;
  groups.push({
    groupId: 'energy',
    label: 'Energy / freight',
    implication:
      enHits >= Math.max(2, n * 0.06) || enSyms.length
        ? 'Supply / logistics headlines present — crude & freight skew matters'
        : 'Quiet energy channel on this slice',
    reasons: [
      enSyms.length ? `Flow: ${enSyms.join(', ')}` : 'Low energy-symbol weight',
      `Energy-tagged density: ${enHits}`,
      ...storyLines.slice(2, 3),
    ].filter(Boolean),
    confidence: enSyms.length || enHits >= 3 ? 'medium' : 'low',
  });

  const rkSyms = topSymbols(mw, (s) => RISK_SYMS.has(s));
  let riskImpl =
    riskOn > riskOff + n * 0.05
      ? 'Growth / beta tape — watch index & crypto proxies'
      : riskOff > riskOn + n * 0.05
        ? 'Defensive skew — high-beta legs vulnerable to headline shocks'
        : 'Balanced risk tone on this window';
  if (conflictish >= Math.max(2, n * 0.05)) riskImpl += ' · Geopolitical / security headlines clustering';
  groups.push({
    groupId: 'risk_assets',
    label: 'Equities / crypto',
    implication: riskImpl,
    reasons: [
      rkSyms.length ? `Leaders: ${rkSyms.join(', ')}` : 'No single risk proxy dominating',
      hotRegs.length ? `Pressure: ${hotRegs[0]}` : null,
    ].filter(Boolean),
    confidence: rkSyms.length >= 2 || conflictish >= 3 ? 'medium' : 'low',
  });

  return groups;
}

module.exports = { buildMarketWatchNarrative, storyDigestLines, regionHotspots };
