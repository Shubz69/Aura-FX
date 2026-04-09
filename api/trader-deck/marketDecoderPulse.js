/**
 * Market Decoder — weighted Market Pulse + cross-asset alignment (deterministic, data-backed).
 * Needle blends rule net with RSI, pivot location, event/vol compression, sparse history, and cross legs.
 */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Map net (-6…+6) to 0–100 baseline (same as legacy gauge). */
function gaugeBaseFromNet(net) {
  const t = (Number(net) + 6) / 12;
  return clamp(Math.round(t * 100), 0, 100);
}

function blendToward50(pos, t) {
  return Math.round(pos * (1 - t) + 50 * t);
}

/**
 * Compare daily % change of decoded symbol vs cross legs (when not the same symbol).
 * Aligned = same sign of session % change (risk proxies: SPY, BTC; EURUSD leg for non-EURUSD FX).
 */
function crossAssetAlignment(bundle, { marketType, displaySymbol, pctDay, bias }) {
  const u = String(displaySymbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  const daySign = pctDay != null && Number.isFinite(Number(pctDay)) ? Math.sign(Number(pctDay)) : 0;

  const legs = [];
  const tryLeg = (id, useFor) => {
    const row = bundle && bundle[id];
    if (!row || row.ok === false) return;
    const dp = row.dp != null ? Number(row.dp) : null;
    if (dp == null || !Number.isFinite(dp)) return;
    if (id === 'eurusd' && u === 'EURUSD') return;
    legs.push({ id, dp, sign: Math.sign(dp), useFor });
  };

  tryLeg('spy', 'macro');
  tryLeg('btc', 'risk');
  tryLeg('xau', 'macro');
  tryLeg('eurusd', 'fx');

  if (!legs.length) {
    return { aligned: 0, misaligned: 0, checked: 0, delta: 0, note: 'Cross quotes unavailable for alignment' };
  }

  let aligned = 0;
  let misaligned = 0;
  let checked = 0;

  for (const leg of legs) {
    let relevant = true;
    if (marketType === 'Crypto' && leg.id !== 'btc' && leg.id !== 'spy') relevant = false;
    if (marketType === 'Equity' || marketType === 'Index') {
      if (leg.id !== 'spy' && leg.id !== 'btc') relevant = false;
    }
    if (marketType === 'FX' && leg.id === 'btc' && !u.includes('JPY') && u.length === 6) {
      /* optional BTC leg for FX — keep for USD/JPY risk proxy */ relevant = true;
    }
    if (!relevant) continue;

    checked += 1;
    if (daySign === 0) continue;
    if (leg.sign === daySign) aligned += 1;
    else if (leg.sign !== 0) misaligned += 1;
  }

  if (checked === 0) {
    return { aligned: 0, misaligned: 0, checked: 0, delta: 0, note: 'No comparable cross legs for this asset class' };
  }

  const netAlign = aligned - misaligned;
  const delta = clamp(Math.round((netAlign / Math.max(1, checked)) * 10), -10, 10);

  const note =
    daySign === 0
      ? `${checked} cross legs loaded — flat day on primary, directional match n/a`
      : `${aligned} of ${checked} sampled legs match primary session direction`;

  return { aligned, misaligned, checked, delta, note };
}

/**
 * @param {object} p
 * @returns {object} gaugePosition, drivers, crossAlignment, signalBrief, compositeScore
 */
function computeWeightedMarketPulse(p) {
  const {
    net,
    bull,
    bear,
    bias,
    rsiVal,
    rsiTone,
    volLabel,
    pulseState,
    last,
    piv,
    eventSoon,
    isSparse,
    crossBundle,
    pctDay,
    marketType,
    displaySymbol,
    momentum,
  } = p;

  let pos = gaugeBaseFromNet(net);
  const drivers = [];

  drivers.push({
    key: 'rules',
    label: 'Rule stack',
    detail: `Bull ${bull} · Bear ${bear} → net ${net} (${bias})`,
  });

  if (rsiVal != null && Number.isFinite(Number(rsiVal))) {
    const r = Number(rsiVal);
    if (r >= 72) {
      pos -= 7;
      drivers.push({ key: 'rsi', label: 'RSI (14)', detail: `${r} stretched high — mean-reversion risk on longs` });
    } else if (r <= 28) {
      pos += 7;
      drivers.push({ key: 'rsi', label: 'RSI (14)', detail: `${r} stretched low — bounce / short-cover risk` });
    } else if (rsiTone === 'bull' || r >= 58) {
      pos += 4;
      drivers.push({ key: 'rsi', label: 'RSI (14)', detail: `${r} constructive for long-bias tape` });
    } else if (rsiTone === 'bear' || r <= 42) {
      pos -= 4;
      drivers.push({ key: 'rsi', label: 'RSI (14)', detail: `${r} soft — favours caution on longs` });
    } else {
      drivers.push({ key: 'rsi', label: 'RSI (14)', detail: `${r} neutral band` });
    }
  }

  if (piv != null && last != null && Number.isFinite(Number(last))) {
    const pv = Number(piv.pivot);
    if (Number.isFinite(pv) && pv !== 0) {
      const dist = (last - pv) / Math.abs(pv);
      if (dist > 0.0008 && (bias === 'Bullish' || net > 0)) {
        pos += 5;
        drivers.push({ key: 'pivot', label: 'vs pivot', detail: 'Price above daily pivot — aligns with bull lean' });
      } else if (dist < -0.0008 && (bias === 'Bearish' || net < 0)) {
        pos -= 5;
        drivers.push({ key: 'pivot', label: 'vs pivot', detail: 'Price below daily pivot — aligns with bear lean' });
      } else if (Math.abs(dist) <= 0.0008) {
        drivers.push({ key: 'pivot', label: 'vs pivot', detail: 'Around pivot — breakout/breakdown zone' });
      }
    }
  }

  if (eventSoon) {
    pos = blendToward50(pos, 0.24);
    drivers.push({
      key: 'event',
      label: 'Event risk',
      detail: 'High-impact calendar window — directional conviction compressed',
    });
  }

  if (volLabel === 'High') {
    pos = blendToward50(pos, 0.08);
    drivers.push({ key: 'vol', label: 'Volatility', detail: 'Wide last-session range — two-way / slippage risk' });
  } else if (volLabel === 'Low') {
    drivers.push({ key: 'vol', label: 'Volatility', detail: 'Compressed range — expansion risk into news' });
  }

  if (momentum === 'Rising' && net >= 0) {
    pos += 3;
    drivers.push({ key: 'mom', label: 'Momentum', detail: '5d slope rising with non-negative rule lean' });
  } else if (momentum === 'Weakening' && net <= 0) {
    pos -= 3;
    drivers.push({ key: 'mom', label: 'Momentum', detail: '5d slope weakening with non-positive lean' });
  }

  if (isSparse) {
    pos = blendToward50(pos, 0.14);
    drivers.push({
      key: 'sparse',
      label: 'Data quality',
      detail: 'Sparse daily history — MA/pivot context indicative only',
    });
  }

  const cross = crossAssetAlignment(crossBundle, { marketType, displaySymbol, pctDay, bias });
  pos += cross.delta;
  if (cross.checked > 0) {
    drivers.push({ key: 'cross', label: 'Cross-asset', detail: cross.note });
  }

  pos = clamp(Math.round(pos), 7, 93);

  const signalBrief = (() => {
    if (eventSoon) return `${pulseState} — event window; trade smaller until prints pass`;
    if (pulseState === 'Choppy') return `${pulseState} — mean-reversion or wait for level break`;
    if (pulseState === 'Trending Clean') return `${pulseState} — trend logic weighted vs structure`;
    if (pulseState === 'Unstable') return `${pulseState} — vol elevated vs conviction; reduce aggression`;
    return `${pulseState} — blended rule + technical + cross checks`;
  })();

  return {
    gaugePosition: pos,
    compositeScore: pos,
    drivers: drivers.slice(0, 7),
    crossAlignment: {
      aligned: cross.aligned,
      misaligned: cross.misaligned,
      checked: cross.checked,
      deltaApplied: cross.delta,
    },
    signalBrief,
    pulseState,
  };
}

module.exports = {
  computeWeightedMarketPulse,
  crossAssetAlignment,
  gaugeBaseFromNet,
};
