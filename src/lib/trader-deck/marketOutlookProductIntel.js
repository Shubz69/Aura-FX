'use strict';

/**
 * Product-level outlook intel: trade expression + structure map.
 * Strings are assembled only from desk snapshot fields (no canned macro filler).
 */

import i18n from '../../i18n/config';

function sm(key, opts) {
  return i18n.t(`traderDeck.structureMap.${key}`, opts ?? {});
}

function normDirection(d) {
  const x = String(d || '').toLowerCase();
  if (['up', 'bull', 'bullish', 'risk-on', 'riskon'].some((w) => x.includes(w))) return 'up';
  if (['down', 'bear', 'bearish', 'risk-off', 'riskoff'].some((w) => x.includes(w))) return 'down';
  return 'neutral';
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSubset(a, b) {
  const A = norm(a);
  const B = norm(b);
  if (A.length < 12 || B.length < 12) return false;
  if (A.includes(B.slice(0, Math.min(48, B.length))) || B.includes(A.slice(0, Math.min(48, A.length)))) return true;
  return false;
}

/** Phrases already rendered elsewhere on the page (signals, regime labels, headlines). */
export function buildOutlookContentFingerprints(showing) {
  const blocked = new Set();
  const add = (x) => {
    const t = norm(x);
    if (t.length > 10) blocked.add(t);
  };

  const regime = showing.marketRegime || {};
  Object.values(regime).forEach((v) => {
    if (v != null && String(v).trim()) add(String(v));
  });

  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  signals.forEach((s) => {
    add(`${s.asset} ${s.signal} ${s.implication}`);
    add(s.implication);
  });

  const drivers = Array.isArray(showing.keyDrivers) ? showing.keyDrivers : [];
  drivers.forEach((d) => add(d.effect));

  (Array.isArray(showing.headlineInsights) ? showing.headlineInsights : []).forEach((h) => add(h.text));

  (Array.isArray(showing.headlineSample) ? showing.headlineSample : []).forEach((h) => add(h));

  return blocked;
}

function conflictsWithFingerprints(line, fingerprints) {
  const n = norm(line);
  if (n.length < 8) return true;
  for (const f of fingerprints) {
    if (f && (n.includes(f.slice(0, Math.min(40, f.length))) || f.includes(n.slice(0, Math.min(40, n.length))))) {
      return true;
    }
  }
  return false;
}

function biasLabel(dir, impact) {
  const d = normDirection(dir);
  const hi = String(impact || '').toLowerCase() === 'high';
  if (d === 'up') return hi ? 'Risk-on continuation' : 'Constructive tilt';
  if (d === 'down') return hi ? 'Risk-off pressure' : 'Soft defensive';
  return hi ? 'Two-way (high stakes)' : 'Range / balanced';
}

function clip(s, max) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function pairSignalForDriver(d, signals) {
  const dn = String(d.name || d.title || '').toLowerCase().trim();
  if (!dn) return null;
  return (
    signals.find((s) => {
      const a = String(s.asset || '').toLowerCase();
      return a && (a.includes(dn.slice(0, 4)) || dn.includes(a.slice(0, 4)));
    }) || null
  );
}

function buildInvalidation(showing, driver, signal) {
  const re = showing.riskEngine || null;
  const b = re?.breakdown && typeof re.breakdown === 'object' ? re.breakdown : null;
  const pulse = showing.marketPulse || {};
  const orc = showing.outlookRiskContext && typeof showing.outlookRiskContext === 'object' ? showing.outlookRiskContext : null;

  const parts = [];
  if (b && Number.isFinite(Number(b.volatility))) {
    const v = Number(b.volatility);
    parts.push(v >= 62 ? 'volatility reset lower' : v <= 38 ? 'volatility spike vs desk base case' : 'volatility regime flip');
  }
  if (b && Number.isFinite(Number(b.eventRisk)) && Number(b.eventRisk) >= 70) {
    parts.push('macro event shock through calendar');
  }
  if (orc?.nextRiskWindow) {
    parts.push(clip(`window: ${orc.nextRiskWindow}`, 72));
  } else if (Number.isFinite(re?.nextRiskEventInMins)) {
    parts.push(`event cluster inside ~${re.nextRiskEventInMins}m`);
  }
  if (signal && driver && normDirection(signal.direction) !== normDirection(driver?.direction)) {
    parts.push(`${String(signal.asset || '').trim() || 'Sleeve'} sleeve inverts vs driver`);
  }
  if (pulse.label) {
    parts.push(`${String(pulse.label).trim()} pulse loses control of tape`);
  }
  if (!parts.length && re?.level) {
    parts.push(`risk posture slips from ${String(re.level).trim()}`);
  }
  if (!parts.length && driver) {
    const nm = String(driver.name || driver.title || '').trim();
    if (nm) parts.push(`${nm} thesis breaks on cross-market reversal`);
  }
  if (!parts.length && signal && b && Number.isFinite(Number(b.volatility))) {
    parts.push('volatility path shifts vs sleeve entry');
  }
  if (!parts.length && signal) {
    const a = String(signal.asset || '').trim() || 'Sleeve';
    parts.push(`${a} read fails if broader macro linkage snaps`);
  }

  if (!parts.length) return '';
  return clip(`Invalidation: ${parts.slice(0, 2).join('; ')}`, 140);
}

/**
 * @returns {Array<{ headline: string, expression: string, why: string, invalidation: string }>}
 */
export function buildTradeExpressionMatrix(showing, { maxRows = 6 } = {}) {
  if (!showing || typeof showing !== 'object') return [];
  const fingerprints = buildOutlookContentFingerprints(showing);
  const drivers = Array.isArray(showing.keyDrivers) ? [...showing.keyDrivers] : [];
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const pulse = showing.marketPulse || {};

  const rank = { high: 0, medium: 1, low: 2 };
  drivers.sort(
    (a, b) =>
      (rank[String(a.impact || '').toLowerCase()] ?? 3) - (rank[String(b.impact || '').toLowerCase()] ?? 3)
  );

  const rows = [];
  const usedAssets = new Set();

  for (const d of drivers) {
    if (rows.length >= maxRows) break;
    const name = String(d.name || d.title || '').trim();
    if (!name) continue;
    const sig = pairSignalForDriver(d, signals);
    const assetLabel = sig?.asset?.trim() ? sig.asset.trim() : name;
    const key = norm(assetLabel);
    if (usedAssets.has(key)) continue;

    const bias = biasLabel(d.direction, d.impact);
    const headline = `${assetLabel} — ${bias}`;

    const eff = clip(String(d.effect || d.explanation || '').trim(), 96);
    const impl = sig ? clip(String(sig.implication || '').trim(), 96) : '';

    let expression = '';
    const dir = normDirection(d.direction);
    if (dir === 'up') {
      expression = eff ? clip(`Add / lean long ${assetLabel}; ${eff}`, 118) : clip(`Add exposure on ${assetLabel} strength`, 118);
    } else if (dir === 'down') {
      expression = eff ? clip(`Reduce / hedge ${assetLabel}; ${eff}`, 118) : clip(`Cut beta into ${assetLabel} weakness`, 118);
    } else {
      expression = eff ? clip(`Trade ${assetLabel} two-way; ${eff}`, 118) : clip(`Range-trade ${assetLabel} — wait for catalyst`, 118);
    }

    let why = '';
    if (impl && eff && !tokenSubset(impl, eff)) {
      why = clip(`${impl}`, 132);
    } else if (impl) {
      why = clip(`${impl}`, 132);
    } else if (eff) {
      why = clip(`${name} — ${eff}`, 132);
    } else if (sig?.signal) {
      why = clip(`Desk tag ${String(sig.signal).trim()} on ${assetLabel}`, 132);
    } else {
      continue;
    }

    const invalidation = buildInvalidation(showing, d, sig);
    if (!invalidation) continue;

    const whyNorm = norm(why);
    const implNorm = impl ? norm(impl) : '';
    if (implNorm && whyNorm === implNorm) {
      why = clip(`Driver-led: ${eff || name}`, 132);
    }

    if (conflictsWithFingerprints(why, fingerprints) && eff) {
      why = clip(`Relative edge: ${eff}`, 132);
    }
    if (conflictsWithFingerprints(why, fingerprints)) continue;

    if (conflictsWithFingerprints(headline, fingerprints)) continue;

    rows.push({
      headline,
      expression: expression.replace(/^Expression:\s*/i, ''),
      why,
      invalidation,
    });
    usedAssets.add(key);
  }

  if (!rows.length && signals.length) {
    for (const s of signals) {
      if (rows.length >= maxRows) break;
      const assetLabel = String(s.asset || '').trim() || 'Cross-asset';
      const key = norm(assetLabel);
      if (usedAssets.has(key)) continue;
      const impl = clip(String(s.implication || '').trim(), 110);
      if (!impl || conflictsWithFingerprints(impl, fingerprints)) continue;
      const bias = biasLabel(s.direction, s.strength === 'high' ? 'high' : 'medium');
      const headline = `${assetLabel} — ${bias}`;
      const dir = normDirection(s.direction);
      const expression =
        dir === 'up'
          ? clip(`Express via ${assetLabel} upside; ${impl}`, 118)
          : dir === 'down'
            ? clip(`Express via ${assetLabel} downside; ${impl}`, 118)
            : clip(`Fade extremes on ${assetLabel}; ${impl}`, 118);
      const why = clip(`Cross-asset read — ${String(s.signal || s.label || '').trim() || 'desk sleeve'}`, 132);
      const invalidation = buildInvalidation(showing, null, s);
      if (!invalidation) continue;
      if (conflictsWithFingerprints(headline, fingerprints)) continue;
      rows.push({
        headline,
        expression,
        why,
        invalidation,
      });
      usedAssets.add(key);
    }
  }

  return rows.slice(0, maxRows);
}

function volTag(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 62) return 'expanding';
  if (n <= 38) return 'contracting';
  return 'blended';
}

function liqTag(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 58) return 'deep';
  if (n <= 40) return 'thin';
  return 'uneven';
}

/**
 * @returns {null | {
 *   trendState: string, volatilityRegime: string, liquidityCondition: string,
 *   correlationRegime: string, marketBreadth: string, positioningPressure: string,
 *   structureInsight: string, whatThisMeans: string, watchFor: string
 * }}
 */
export function buildMarketStructureMap(showing) {
  if (!showing || typeof showing !== 'object') return null;

  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const drivers = Array.isArray(showing.keyDrivers) ? showing.keyDrivers : [];
  const re = showing.riskEngine || null;
  const b = re?.breakdown && typeof re.breakdown === 'object' ? re.breakdown : null;
  const orc = showing.outlookRiskContext && typeof showing.outlookRiskContext === 'object' ? showing.outlookRiskContext : null;
  const regime = showing.marketRegime || {};
  const pulse = showing.marketPulse || {};

  const hasRiskShape = b && (Number.isFinite(Number(b.volatility)) || Number.isFinite(Number(b.liquidity)) || Number.isFinite(Number(b.clustering)));
  const hasMultiSleeve = signals.length >= 2 || drivers.length >= 2;

  if (!hasRiskShape && !hasMultiSleeve) return null;

  const dirs = signals.map((s) => normDirection(s.direction));
  const up = dirs.filter((d) => d === 'up').length;
  const down = dirs.filter((d) => d === 'down').length;
  const neu = dirs.filter((d) => d === 'neutral').length;

  let trendKey = 'transitioning';
  if (signals.length >= 2) {
    if (up === dirs.length && dirs.length) trendKey = 'trending';
    else if (down === dirs.length && dirs.length) trendKey = 'trending';
    else if (neu >= dirs.length * 0.6) trendKey = 'ranging';
    else if (Math.max(up, down) >= 1 && Math.min(up, down) >= 1) trendKey = 'transitioning';
    else trendKey = dirs.length ? 'trending' : 'ranging';
  } else if (drivers.length >= 2) {
    const dd = drivers.map((d) => normDirection(d.direction));
    const same = new Set(dd).size === 1;
    trendKey = same ? 'trending' : 'ranging';
  }

  let volatilityRegimeKey = '';
  let volatilityRegimeCustom = '';
  if (b && Number.isFinite(Number(b.volatility))) {
    volatilityRegimeKey = volTag(Number(b.volatility));
  } else if (orc?.volatilityState) {
    volatilityRegimeCustom = String(orc.volatilityState).slice(0, 28);
  }
  if (!volatilityRegimeKey && !volatilityRegimeCustom && signals.length >= 2 && neu < dirs.length) {
    volatilityRegimeKey = 'blended';
  }

  let liquidityKey = b && Number.isFinite(Number(b.liquidity)) ? liqTag(Number(b.liquidity)) : '';
  if (!liquidityKey && drivers.length >= 3) liquidityKey = 'uneven';
  else if (!liquidityKey && signals.length >= 3) liquidityKey = 'uneven_flow';
  if (!liquidityKey) liquidityKey = 'mixed_depth';
  if (!volatilityRegimeKey && !volatilityRegimeCustom) volatilityRegimeKey = 'blended';

  let correlationKey = 'rotational';
  if (b && Number.isFinite(Number(b.clustering))) {
    const c = Number(b.clustering);
    if (c >= 62) correlationKey = 'high';
    else if (c <= 40) correlationKey = 'breaking';
    else correlationKey = 'rotational';
  } else if (orc?.clusteringBehavior) {
    const t = String(orc.clusteringBehavior).toLowerCase();
    if (/tight|high|cluster/i.test(t)) correlationKey = 'high';
    else if (/break|decouple/i.test(t)) correlationKey = 'breaking';
  }

  let breadthKey = 'narrow';
  if (drivers.length >= 3) {
    const impacts = new Set(drivers.map((d) => String(d.impact || '').toLowerCase()));
    if (impacts.size >= 2 && signals.length >= 2) breadthKey = 'diverging';
    else if (drivers.length >= 4) breadthKey = 'diverging';
  }
  if (signals.length >= 3 && new Set(dirs).size === 1) breadthKey = 'strong';

  let positioningKey = 'unclear';
  const ps = Number(pulse.score);
  if (Number.isFinite(ps)) {
    if (ps >= 68 || ps <= 35) positioningKey = 'crowded';
    else positioningKey = 'clean';
  }
  const conv = String(regime.convictionClarity || '').toLowerCase();
  if (/low|weak/.test(conv)) positioningKey = 'unclear';

  const volLabel = volatilityRegimeCustom || sm(`vol_${volatilityRegimeKey || 'blended'}`);
  const liqLabel = sm(`liq_${liquidityKey}`);
  const trendLabel = sm(`trend_${trendKey}`);

  const structureInsight = clip(
    sm('insight_line', { trend: trendLabel, vol: volLabel, liq: liqLabel }),
    160,
  );

  const whatThisMeans = clip(
    correlationKey === 'breaking'
      ? sm('means_breaking')
      : correlationKey === 'high'
        ? sm('means_high')
        : sm('means_rotational'),
    160,
  );

  const tl0 = Array.isArray(showing.marketChangesTimeline) ? showing.marketChangesTimeline[0] : null;
  const tlHook =
    tl0 && (tl0.whatChanged || tl0.title) ? clip(String(tl0.whatChanged || tl0.title), 96) : '';

  const watchParts = [];
  if (orc?.nextRiskWindow) watchParts.push(clip(String(orc.nextRiskWindow), 90));
  else if (Number.isFinite(re?.nextRiskEventInMins)) {
    watchParts.push(sm('watch_event_cluster', { m: re.nextRiskEventInMins }));
  }
  if (b && Number.isFinite(Number(b.volatility)) && Number(b.volatility) >= 58) {
    watchParts.push(sm('watch_vol_exp'));
  }
  if (breadthKey === 'diverging') watchParts.push(sm('watch_factor'));
  if (!watchParts.length && tlHook) watchParts.push(sm('watch_tape_hook', { hook: tlHook }));
  if (!watchParts.length) {
    watchParts.push(
      clip(
        sm('watch_corr_breadth', {
          corr: sm(`corr_${correlationKey}`),
          breadth: sm(`breadth_${breadthKey}`),
        }),
        120,
      ),
    );
  }
  const watchFor = clip(watchParts.slice(0, 2).join(i18n.t('traderDeck.macroGen.sep')), 160);

  if (!structureInsight || !whatThisMeans || !watchFor) return null;

  return {
    trendState: trendLabel,
    volatilityRegime: volLabel,
    liquidityCondition: liqLabel,
    correlationRegime: sm(`corr_${correlationKey}`),
    marketBreadth: sm(`breadth_${breadthKey}`),
    positioningPressure: sm(`pos_${positioningKey}`),
    structureInsight,
    whatThisMeans,
    watchFor,
  };
}
