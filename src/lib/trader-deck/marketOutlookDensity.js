'use strict';

/**
 * Derives additional compact rows from the same Trader Desk snapshot when primary lists are thin.
 * No decorative copy — only concatenations / counts / sorts of existing fields.
 */

function normDirection(d) {
  const x = String(d || '').toLowerCase();
  if (['up', 'bull', 'bullish', 'risk-on', 'riskon'].some((w) => x.includes(w))) return 'up';
  if (['down', 'bear', 'bearish', 'risk-off', 'riskoff'].some((w) => x.includes(w))) return 'down';
  return 'neutral';
}

/** e.g. "Net driver tilt: 2 risk-on · 2 neutral · 1 risk-off (from directions)" */
export function deriveNetDriverBiasLine(drivers) {
  const arr = Array.isArray(drivers) ? drivers : [];
  if (!arr.length) return '';
  let up = 0;
  let down = 0;
  let neu = 0;
  arr.forEach((d) => {
    const nd = normDirection(d.direction);
    if (nd === 'up') up += 1;
    else if (nd === 'down') down += 1;
    else neu += 1;
  });
  return `Net driver tilt: ${up} risk-on · ${neu} neutral · ${down} risk-off`;
}

export function deriveDominantFactorLine(drivers) {
  const arr = Array.isArray(drivers) ? drivers : [];
  if (!arr.length) return '';
  const rank = { high: 0, medium: 1, low: 2 };
  const sorted = [...arr].sort(
    (a, b) =>
      (rank[String(a.impact || '').toLowerCase()] ?? 3) -
      (rank[String(b.impact || '').toLowerCase()] ?? 3)
  );
  const top = sorted[0];
  const name = String(top.name || top.title || '').trim();
  if (!name) return '';
  return `Dominant desk factor: ${name} (${String(top.impact || 'medium').toLowerCase()} impact)`;
}

/** Pick lowest-strength signal label if present; else shortest implication */
export function deriveWeakestLinkLine(signals) {
  const arr = Array.isArray(signals) ? signals : [];
  if (!arr.length) return '';
  const scored = arr.map((s, i) => ({
    i,
    strength: String(s.strength || '').toLowerCase(),
    asset: String(s.asset || '').trim(),
    sig: String(s.signal || s.label || '').trim(),
    impl: String(s.implication || '').trim(),
  }));
  const weakFirst = [...scored].sort((a, b) => {
    const lw = /low|weak/.test(a.strength) ? 0 : 1;
    const rw = /low|weak/.test(b.strength) ? 0 : 1;
    if (lw !== rw) return lw - rw;
    return (a.impl.length || 999) - (b.impl.length || 999);
  });
  const w = weakFirst[0];
  const bit = w.impl || w.sig || w.asset;
  if (!bit) return '';
  return `Relative soft sleeve: ${w.asset || 'Market'} · ${bit.slice(0, 96)}`;
}

export function deriveRiskDimensionLines(riskEngine) {
  const lines = [];
  const re = riskEngine || null;
  if (!re) return lines;
  if (re.score != null || re.level != null) {
    lines.push(`Desk risk score: ${re.score ?? '—'}/100 · ${re.level || 'level n/a'}`);
  }
  const b = re.breakdown;
  if (b && typeof b === 'object') {
    const fmt = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '—';
      const tag = n >= 70 ? 'high' : n >= 45 ? 'mid' : 'low';
      return `${Math.round(n)} (${tag})`;
    };
    if (b.volatility != null) lines.push(`Volatility depth: ${fmt(b.volatility)}`);
    if (b.liquidity != null) lines.push(`Liquidity depth: ${fmt(b.liquidity)}`);
    if (b.clustering != null) lines.push(`Linkage / clustering: ${fmt(b.clustering)}`);
    if (b.geopoliticalRisk != null) lines.push(`Geo pressure: ${fmt(b.geopoliticalRisk)}`);
    if (b.eventRisk != null) lines.push(`Macro event pressure: ${fmt(b.eventRisk)}`);
  }
  if (Number.isFinite(re.nextRiskEventInMins)) {
    lines.push(`Next clustered window: ~${re.nextRiskEventInMins} min`);
  }
  return lines;
}

export function signalLine(s, idx) {
  const a = String(s.asset || '').trim();
  const sig = String(s.signal || s.label || '').trim();
  const dir = String(s.direction || '').trim();
  const impl = String(s.implication || '').trim();
  const parts = [a, sig, dir && dir !== 'neutral' ? dir : '', impl].filter(Boolean);
  const core = parts.join(' · ');
  return core.slice(0, 168);
}

/** Terminal-style lines when structured headline feed is empty (signals + drivers only). */
export function deriveHeadlineFallbackLines(signals, drivers) {
  const out = [];
  (signals || []).slice(0, 14).forEach((s) => {
    const line = signalLine(s);
    if (line) out.push(line);
  });
  if (out.length < 8 && Array.isArray(drivers)) {
    drivers.slice(0, 10).forEach((d) => {
      const name = String(d.name || d.title || '').trim();
      const eff = String(d.effect || d.explanation || '').trim();
      if (name || eff) out.push(`${name || 'Desk driver'}: ${eff || String(d.direction || '').trim()}`.slice(0, 168));
    });
  }
  const dedupe = [];
  const seen = new Set();
  out.forEach((x) => {
    const k = x.slice(0, 52);
    if (seen.has(k)) return;
    seen.add(k);
    dedupe.push(x);
  });
  return dedupe.slice(0, 12);
}

export function deriveInstrumentSnapshotsMerged(existing, signals, drivers) {
  const have = Array.isArray(existing) ? existing.filter(Boolean) : [];
  if (have.length) return have.slice(0, 8);
  const sigs = Array.isArray(signals) ? signals : [];
  if (sigs.length) {
    return sigs.slice(0, 8).map((s) => {
      const asset = String(s.asset || '').trim() || 'Cross-asset';
      const implication = String(s.implication || '').trim();
      const dn = asset.toLowerCase();
      const driverMatch = (drivers || []).find((d) => {
        const name = String(d.name || '').toLowerCase();
        return name && (dn.includes(name.slice(0, 4)) || name.includes(dn.slice(0, 4)));
      });
      return {
        symbol: asset.slice(0, 28),
        bias: String(s.signal || s.label || '—').slice(0, 44),
        structure: implication
          ? implication.slice(0, 140)
          : `${String(s.direction || 'neutral')} posture versus the prior session`,
        keyLevel: '—',
        note: driverMatch?.effect ? String(driverMatch.effect).slice(0, 170) : '',
      };
    });
  }
  const dr = Array.isArray(drivers) ? drivers : [];
  if (!dr.length) return [];
  return dr.slice(0, 8).map((d) => ({
    symbol: String(d.name || d.title || 'Driver').slice(0, 28),
    bias: String(d.direction || 'neutral'),
    structure: String(d.effect || d.explanation || '').slice(0, 140),
    keyLevel: String(d.impact || '—').slice(0, 24),
    note: String(d.explanation || '').slice(0, 120),
  }));
}

export function deriveTraderFocusMerged(traderFocus, drivers) {
  const tf = Array.isArray(traderFocus) ? traderFocus.filter(Boolean) : [];
  if (tf.length) return tf;
  return (drivers || []).slice(0, 8).map((d) => ({
    title: String(d.name || d.title || '').trim(),
    reason: String(d.effect || d.explanation || '').trim().slice(0, 140),
  })).filter((x) => x.title);
}

export function deriveTimelineMerged(timeline, signals, drivers, marketChangesToday, tfShort) {
  const tl = Array.isArray(timeline) ? timeline.filter(Boolean) : [];
  if (tl.length) return tl;
  const label = tfShort === 'weekly' ? 'Week' : 'Session';
  const rows = [];
  (signals || []).slice(0, 12).forEach((s, i) => {
    const line = signalLine(s, i);
    if (!line) return;
    rows.push({
      timeLabel: `${label} ${i + 1}`,
      whatChanged: line,
      assetsAffected: [String(s.asset || 'Cross-asset').slice(0, 24)],
      whyItMatters: String(s.implication || '').trim().slice(0, 200) || 'Cross-asset alignment from desk signals.',
      priority: 'medium',
    });
  });
  if (!rows.length) {
    (drivers || []).slice(0, 10).forEach((d, i) => {
      const name = String(d.name || d.title || '').trim();
      if (!name) return;
      rows.push({
        timeLabel: `${label} ${i + 1}`,
        whatChanged: `${name}: ${String(d.effect || '').trim()}`.slice(0, 220),
        assetsAffected: Array.isArray(d.affectedAssets) && d.affectedAssets.length ? d.affectedAssets.slice(0, 4) : [],
        whyItMatters: String(d.explanation || d.effect || '').trim().slice(0, 200),
        priority: String(d.impact || 'medium').toLowerCase(),
      });
    });
  }
  if (!rows.length && Array.isArray(marketChangesToday)) {
    return marketChangesToday
      .map((item, idx) => {
        const text = typeof item === 'string' ? item : item?.title || item?.description || '';
        const wc = String(text || '').trim();
        if (!wc) return null;
        const why =
          typeof item === 'object' && item?.whyItMatters
            ? String(item.whyItMatters).trim().slice(0, 200)
            : wc.slice(0, 200);
        return {
          timeLabel: `${label} ${idx + 1}`,
          whatChanged: wc,
          assetsAffected: [],
          whyItMatters: why || wc.slice(0, 200),
          priority: 'medium',
        };
      })
      .filter(Boolean);
  }
  return rows;
}

export function buildDerivedRiskFallbackLines(pulse, drivers, outlookRisk) {
  const lines = [];
  const p = pulse || {};
  if (p.label != null || p.score != null) {
    lines.push(`Pulse read: ${p.label || '—'} · gauge ${p.score ?? '—'}/100`);
  }
  const rec = Array.isArray(p.recommendedAction) ? p.recommendedAction : [];
  rec.slice(0, 2).forEach((r) => {
    const t = typeof r === 'string' ? r : r?.text || r?.title || '';
    if (t) lines.push(`Tape note: ${String(t).slice(0, 140)}`);
  });
  (drivers || [])
    .filter((d) => String(d.impact || '').toLowerCase() === 'high')
    .slice(0, 3)
    .forEach((d) => {
      lines.push(`High-impact driver in scope: ${String(d.name || d.title || '').trim()} (${String(d.direction || '').trim()})`);
    });
  if (outlookRisk && typeof outlookRisk === 'object') {
    if (outlookRisk.currentRiskLevel) lines.push(`Outlook risk level: ${outlookRisk.currentRiskLevel}`);
    if (outlookRisk.volatilityState) lines.push(`Volatility state: ${outlookRisk.volatilityState}`);
    if (outlookRisk.nextRiskWindow) lines.push(`Risk window: ${String(outlookRisk.nextRiskWindow).slice(0, 120)}`);
  }
  if (!lines.length && Array.isArray(drivers) && drivers.length) {
    const nb = deriveNetDriverBiasLine(drivers);
    if (nb) lines.push(nb);
    const dom = deriveDominantFactorLine(drivers);
    if (dom) lines.push(dom);
    drivers.slice(0, 4).forEach((d) => {
      const name = String(d.name || d.title || '').trim();
      const dir = String(d.direction || '').trim();
      if (name) lines.push(`Desk driver in scope: ${name}${dir ? ` (${dir})` : ''}`);
    });
  }
  return lines.slice(0, 8);
}

export function regimeSessionFallbackPairs(regime) {
  const r = regime && typeof regime === 'object' ? regime : {};
  const pairs = [
    ['Regime', r.currentRegime],
    ['Bias', r.bias],
    ['Sentiment', r.marketSentiment],
    ['Trade env', r.tradeEnvironment],
    ['Bias strength', r.biasStrength],
    ['Conviction', r.convictionClarity],
    ['Primary', r.primaryDriver],
    ['Secondary', r.secondaryDriver],
  ];
  return pairs.filter(([, v]) => v != null && String(v).trim() !== '');
}

/**
 * Fills the right-rail “More desk lines” list up to `maxRows` using only desk fields.
 */
export function buildOutlookSecondaryMicroRowsDense(showing, { maxRows = 22 } = {}) {
  const rows = [];
  const push = (s) => {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (t.length < 6) return;
    if (rows.includes(t)) return;
    rows.push(t.slice(0, 168));
  };

  const pulse = showing.marketPulse || {};
  const drivers = showing.keyDrivers || [];
  const signals = showing.crossAssetSignals || [];
  const headlines = showing.headlineInsights || [];
  const samples = showing.headlineSample || [];
  const riskEngine = showing.riskEngine || null;
  const outlookRisk = showing.outlookRiskContext || null;
  const riskRadar = showing.riskRadar || [];

  regimeSessionFallbackPairs(showing.marketRegime || {}).forEach(([k, v]) => {
    push(`${k}: ${String(v).trim()}`);
  });

  push(deriveNetDriverBiasLine(drivers));
  push(deriveDominantFactorLine(drivers));
  push(deriveWeakestLinkLine(signals));

  deriveRiskDimensionLines(riskEngine).forEach(push);

  if (pulse.label != null || pulse.score != null) {
    push(`Pulse: ${pulse.label || '—'} · ${pulse.score ?? pulse.value ?? '—'}`);
  }

  (Array.isArray(pulse.recommendedAction) ? pulse.recommendedAction : []).slice(0, 4).forEach((r) => {
    push(typeof r === 'string' ? r : r?.text || r?.title || '');
  });

  signals.forEach((s) => push(signalLine(s)));

  headlines.forEach((h) => push(String(h.text || '').trim()));

  samples.forEach((h) => push(String(h || '').trim()));

  (drivers || []).forEach((d) => {
    const name = String(d.name || d.title || '').trim();
    if (!name) return;
    push(`${name} · ${String(d.direction || '').trim()} · ${String(d.impact || '').trim()} impact · ${String(d.effect || '').trim()}`.trim());
  });

  riskRadar.slice(0, 8).forEach((ev) => {
    const title = typeof ev === 'string' ? ev : ev?.title || ev?.event || '';
    const t = String(title || '').trim();
    if (t) push(`Calendar: ${t}${ev?.currency ? ` (${ev.currency})` : ''}${ev?.impact ? ` · ${ev.impact}` : ''}`);
  });

  if (outlookRisk && typeof outlookRisk === 'object') {
    if (outlookRisk.clusteringBehavior) push(`Clustering: ${outlookRisk.clusteringBehavior}`);
    if (outlookRisk.nextRiskWindow) push(`Next risk window: ${String(outlookRisk.nextRiskWindow).slice(0, 130)}`);
  }

  buildDerivedRiskFallbackLines(pulse, drivers, outlookRisk).forEach(push);

  return rows.slice(0, maxRows);
}
