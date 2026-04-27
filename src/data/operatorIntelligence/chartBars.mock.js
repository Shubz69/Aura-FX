/**
 * Deterministic mock OHLCV for Operator Intelligence chart (adapter-friendly).
 * @param {{ symbol: string, timeframeId: string }} p
 */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function mul() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TF_SPEC = {
  '1m': { stepSec: 60, count: 320, base: 1.0855 },
  '5m': { stepSec: 300, count: 280, base: 1.0852 },
  '15m': { stepSec: 900, count: 220, base: 1.0848 },
  '1H': { stepSec: 3600, count: 180, base: 1.084 },
  '4H': { stepSec: 14400, count: 140, base: 1.083 },
  D: { stepSec: 86400, count: 120, base: 1.082 },
  W: { stepSec: 604800, count: 72, base: 1.08 },
};

export function generateOperatorMockBars(symbol, timeframeId) {
  const tf = TF_SPEC[timeframeId] || TF_SPEC['1H'];
  const seed = hashSeed(`${symbol}|${timeframeId}`);
  const rng = mulberry32(seed);
  const now = Math.floor(Date.now() / 1000);
  const start = now - tf.count * tf.stepSec;
  const out = [];
  let close = tf.base;
  for (let i = 0; i < tf.count; i += 1) {
    const t = start + i * tf.stepSec;
    const drift = (rng() - 0.5) * 0.00035;
    const open = close;
    close = open + drift + (rng() - 0.5) * 0.00055;
    const wick = rng() * 0.00045;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick * (0.6 + rng() * 0.5);
    const volume = Math.floor(4000 + rng() * 22000);
    out.push({
      time: t,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume,
    });
  }
  return out;
}

/** Session range + value area approximations from recent bars. */
export function computeSessionLevels(bars) {
  if (!bars || bars.length < 8) {
    return {
      rangeHigh: null,
      rangeLow: null,
      vah: null,
      val: null,
    };
  }
  const tail = bars.slice(-48);
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of tail) {
    hi = Math.max(hi, b.high);
    lo = Math.min(lo, b.low);
  }
  const mid = (hi + lo) / 2;
  const span = hi - lo || 0.0001;
  const vaHalf = span * 0.35;
  return {
    rangeHigh: Number(hi.toFixed(5)),
    rangeLow: Number(lo.toFixed(5)),
    vah: Number((mid + vaHalf * 0.5).toFixed(5)),
    val: Number((mid - vaHalf * 0.5).toFixed(5)),
  };
}
