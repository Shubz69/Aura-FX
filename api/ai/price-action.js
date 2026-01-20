// Price Action Analysis Module
// Dedicated functions for market structure, S/R, liquidity, supply/demand analysis

/**
 * Analyze market structure from OHLCV data
 * @param {Array} ohlcvData - Array of {timestamp, open, high, low, close, volume}
 * @returns {Object} Market structure analysis
 */
function analyzeMarketStructure(ohlcvData) {
  if (!ohlcvData || ohlcvData.length < 2) {
    return { error: 'Insufficient data for market structure analysis' };
  }

  const highs = ohlcvData.map(c => c.high);
  const lows = ohlcvData.map(c => c.low);
  
  // Find swing highs and lows
  const swingHighs = [];
  const swingLows = [];
  
  for (let i = 1; i < ohlcvData.length - 1; i++) {
    // Swing high: higher than previous and next
    if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) {
      swingHighs.push({ index: i, price: highs[i], timestamp: ohlcvData[i].timestamp });
    }
    // Swing low: lower than previous and next
    if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) {
      swingLows.push({ index: i, price: lows[i], timestamp: ohlcvData[i].timestamp });
    }
  }
  
  // Determine trend structure
  let structure = 'ranging';
  let trendDirection = 'neutral';
  
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const recentHighs = swingHighs.slice(-2);
    const recentLows = swingLows.slice(-2);
    
    // Higher Highs (HH) and Higher Lows (HL) = Uptrend
    if (recentHighs[1].price > recentHighs[0].price && recentLows[1].price > recentLows[0].price) {
      structure = 'uptrend';
      trendDirection = 'bullish';
    }
    // Lower Highs (LH) and Lower Lows (LL) = Downtrend
    else if (recentHighs[1].price < recentHighs[0].price && recentLows[1].price < recentLows[0].price) {
      structure = 'downtrend';
      trendDirection = 'bearish';
    }
  }
  
  // Detect Break of Structure (BOS)
  let bos = null;
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastHigh = swingHighs[swingHighs.length - 1];
    const lastLow = swingLows[swingLows.length - 1];
    const currentPrice = ohlcvData[ohlcvData.length - 1].close;
    
    // BOS to bearish: price breaks below previous HL
    if (structure === 'uptrend' && currentPrice < recentLows[0].price) {
      bos = { type: 'bearish', level: recentLows[0].price, timestamp: new Date().toISOString() };
    }
    // BOS to bullish: price breaks above previous LH
    else if (structure === 'downtrend' && currentPrice > recentHighs[0].price) {
      bos = { type: 'bullish', level: recentHighs[0].price, timestamp: new Date().toISOString() };
    }
  }
  
  return {
    structure,
    trendDirection,
    swingHighs: swingHighs.slice(-5), // Last 5 swing highs
    swingLows: swingLows.slice(-5), // Last 5 swing lows
    breakOfStructure: bos,
    currentPrice: ohlcvData[ohlcvData.length - 1].close
  };
}

/**
 * Identify support and resistance levels
 * @param {Array} ohlcvData - OHLCV data
 * @param {Number} lookback - Number of candles to analyze
 * @returns {Object} Support and resistance levels
 */
function identifySupportResistance(ohlcvData, lookback = 50) {
  if (!ohlcvData || ohlcvData.length < 10) {
    return { error: 'Insufficient data' };
  }
  
  const recent = ohlcvData.slice(-lookback);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  const closes = recent.map(c => c.close);
  
  // Find price levels where price reacted multiple times
  const levelMap = {};
  
  // Round to nearest significant level (for forex: 10 pips, for stocks: $0.50, etc.)
  const roundLevel = (price) => {
    if (price > 1000) return Math.round(price / 10) * 10; // For gold, etc.
    if (price > 100) return Math.round(price / 0.5) * 0.5; // For stocks
    if (price > 1) return Math.round(price / 0.01) * 0.01; // For forex
    return Math.round(price / 0.0001) * 0.0001;
  };
  
  // Count reactions at each level
  recent.forEach((candle, i) => {
    const highLevel = roundLevel(candle.high);
    const lowLevel = roundLevel(candle.low);
    
    levelMap[highLevel] = (levelMap[highLevel] || 0) + 1;
    levelMap[lowLevel] = (levelMap[lowLevel] || 0) + 1;
  });
  
  // Sort by frequency and price
  const sortedLevels = Object.entries(levelMap)
    .map(([price, count]) => ({ price: parseFloat(price), count, touches: count }))
    .sort((a, b) => b.count - a.count || b.price - a.price);
  
  const currentPrice = closes[closes.length - 1];
  
  // Separate support (below price) and resistance (above price)
  const support = sortedLevels.filter(l => l.price < currentPrice).slice(0, 5);
  const resistance = sortedLevels.filter(l => l.price > currentPrice).slice(0, 5);
  
  return {
    support: support.map(l => ({ level: l.price, strength: l.touches })),
    resistance: resistance.map(l => ({ level: l.price, strength: l.touches })),
    currentPrice
  };
}

/**
 * Detect liquidity sweeps (false breakouts)
 * @param {Array} ohlcvData - OHLCV data
 * @param {Number} lookback - Number of candles to analyze
 * @returns {Array} Detected liquidity sweeps
 */
function detectLiquiditySweeps(ohlcvData, lookback = 100) {
  if (!ohlcvData || ohlcvData.length < 20) {
    return [];
  }
  
  const recent = ohlcvData.slice(-lookback);
  const sweeps = [];
  
  // Find swing highs and lows
  for (let i = 5; i < recent.length - 5; i++) {
    const candle = recent[i];
    const before = recent.slice(i - 5, i);
    const after = recent.slice(i + 1, i + 6);
    
    // Bullish liquidity sweep: breaks above previous high then reverses down
    const prevHigh = Math.max(...before.map(c => c.high));
    if (candle.high > prevHigh && candle.close < prevHigh) {
      const nextLow = Math.min(...after.map(c => c.low));
      if (nextLow < prevHigh) {
        sweeps.push({
          type: 'bullish_sweep',
          level: prevHigh,
          timestamp: candle.timestamp,
          reversalPrice: nextLow
        });
      }
    }
    
    // Bearish liquidity sweep: breaks below previous low then reverses up
    const prevLow = Math.min(...before.map(c => c.low));
    if (candle.low < prevLow && candle.close > prevLow) {
      const nextHigh = Math.max(...after.map(c => c.high));
      if (nextHigh > prevLow) {
        sweeps.push({
          type: 'bearish_sweep',
          level: prevLow,
          timestamp: candle.timestamp,
          reversalPrice: nextHigh
        });
      }
    }
  }
  
  return sweeps.slice(-10); // Return last 10 sweeps
}

/**
 * Identify supply and demand zones
 * @param {Array} ohlcvData - OHLCV data
 * @returns {Object} Supply and demand zones
 */
function identifySupplyDemandZones(ohlcvData) {
  if (!ohlcvData || ohlcvData.length < 20) {
    return { error: 'Insufficient data' };
  }
  
  const zones = {
    demand: [],
    supply: []
  };
  
  // Look for strong moves away from zones
  for (let i = 10; i < ohlcvData.length - 5; i++) {
    const candle = ohlcvData[i];
    const after = ohlcvData.slice(i + 1, i + 6);
    
    // Demand zone: strong bullish move away
    const moveUp = after[after.length - 1].close - candle.close;
    const range = candle.high - candle.low;
    if (moveUp > range * 2 && moveUp > 0) {
      zones.demand.push({
        top: candle.high,
        bottom: candle.low,
        base: candle.close,
        timestamp: candle.timestamp,
        strength: moveUp / range
      });
    }
    
    // Supply zone: strong bearish move away
    const moveDown = candle.close - after[after.length - 1].close;
    if (moveDown > range * 2 && moveDown > 0) {
      zones.supply.push({
        top: candle.high,
        bottom: candle.low,
        base: candle.close,
        timestamp: candle.timestamp,
        strength: moveDown / range
      });
    }
  }
  
  // Sort by strength and return top 5
  zones.demand = zones.demand.sort((a, b) => b.strength - a.strength).slice(0, 5);
  zones.supply = zones.supply.sort((a, b) => b.strength - a.strength).slice(0, 5);
  
  return zones;
}

/**
 * Detect Fair Value Gaps (FVG)
 * @param {Array} ohlcvData - OHLCV data
 * @returns {Array} Detected FVGs
 */
function detectFairValueGaps(ohlcvData) {
  if (!ohlcvData || ohlcvData.length < 3) {
    return [];
  }
  
  const gaps = [];
  
  for (let i = 1; i < ohlcvData.length - 1; i++) {
    const prev = ohlcvData[i - 1];
    const curr = ohlcvData[i];
    const next = ohlcvData[i + 1];
    
    // Bullish FVG: current low > previous high AND next low > current high
    if (curr.low > prev.high && next.low > curr.high) {
      gaps.push({
        type: 'bullish_fvg',
        top: Math.min(curr.high, next.low),
        bottom: Math.max(prev.high, curr.low),
        timestamp: curr.timestamp,
        filled: false
      });
    }
    
    // Bearish FVG: current high < previous low AND next high < current low
    if (curr.high < prev.low && next.high < curr.low) {
      gaps.push({
        type: 'bearish_fvg',
        top: Math.max(prev.low, curr.high),
        bottom: Math.min(curr.low, next.high),
        timestamp: curr.timestamp,
        filled: false
      });
    }
  }
  
  return gaps.slice(-10); // Return last 10 FVGs
}

/**
 * Determine trend vs range condition
 * @param {Array} ohlcvData - OHLCV data
 * @returns {Object} Trend/range analysis
 */
function analyzeTrendVsRange(ohlcvData) {
  if (!ohlcvData || ohlcvData.length < 20) {
    return { error: 'Insufficient data' };
  }
  
  const recent = ohlcvData.slice(-20);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  const closes = recent.map(c => c.close);
  
  const highest = Math.max(...highs);
  const lowest = Math.min(...lows);
  const range = highest - lowest;
  const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
  
  // Calculate price movement consistency
  let upMoves = 0;
  let downMoves = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) upMoves++;
    else if (closes[i] < closes[i - 1]) downMoves++;
  }
  
  const trendStrength = Math.abs(upMoves - downMoves) / closes.length;
  const isTrending = trendStrength > 0.3;
  const isRanging = range / avgClose < 0.02; // Less than 2% range
  
  return {
    condition: isTrending ? 'trending' : isRanging ? 'ranging' : 'mixed',
    trendStrength: trendStrength.toFixed(2),
    range: range.toFixed(4),
    rangePercent: ((range / avgClose) * 100).toFixed(2) + '%',
    highest,
    lowest,
    currentPrice: closes[closes.length - 1]
  };
}

/**
 * Multi-timeframe confluence analysis
 * @param {Object} multiTimeframeData - {timeframe1: ohlcvData, timeframe2: ohlcvData, ...}
 * @returns {Object} Confluence analysis
 */
function analyzeMultiTimeframeConfluence(multiTimeframeData) {
  const timeframes = Object.keys(multiTimeframeData);
  const structures = {};
  const biases = {};
  
  // Analyze each timeframe
  for (const tf of timeframes) {
    const structure = analyzeMarketStructure(multiTimeframeData[tf]);
    structures[tf] = structure;
    biases[tf] = structure.trendDirection;
  }
  
  // Determine overall bias (higher timeframes have more weight)
  const tfWeights = { '1d': 3, '4h': 2, '1h': 1, '15m': 0.5, '5m': 0.25 };
  let bullishScore = 0;
  let bearishScore = 0;
  
  for (const tf of timeframes) {
    const weight = tfWeights[tf] || 1;
    if (biases[tf] === 'bullish') bullishScore += weight;
    else if (biases[tf] === 'bearish') bearishScore += weight;
  }
  
  const overallBias = bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral';
  const confluenceStrength = Math.abs(bullishScore - bearishScore) / (bullishScore + bearishScore || 1);
  
  return {
    structures,
    biases,
    overallBias,
    confluenceStrength: confluenceStrength.toFixed(2),
    recommendation: confluenceStrength > 0.6 ? 'Strong confluence - high probability setup' : 'Mixed signals - wait for clarity'
  };
}

/**
 * Generate trading scenarios based on price action
 * @param {Object} analysis - Combined price action analysis
 * @returns {Array} Trading scenarios with if/then logic
 */
function generateScenarios(analysis) {
  const scenarios = [];
  const { structure, support, resistance, currentPrice } = analysis;
  
  if (structure.trendDirection === 'bullish') {
    // Bullish scenarios
    if (resistance && resistance.length > 0) {
      scenarios.push({
        condition: `Price breaks above ${resistance[0].level}`,
        target: resistance.length > 1 ? resistance[1].level : resistance[0].level * 1.01,
        stopLoss: support && support.length > 0 ? support[0].level : currentPrice * 0.99,
        probability: 'high',
        reasoning: 'Breakout above key resistance in uptrend'
      });
    }
    
    scenarios.push({
      condition: `Price pulls back to ${support && support[0] ? support[0].level : 'support zone'}`,
      target: resistance && resistance[0] ? resistance[0].level : currentPrice * 1.01,
      stopLoss: support && support[0] ? support[0].level * 0.999 : currentPrice * 0.99,
      probability: 'medium',
      reasoning: 'Pullback to support in uptrend'
    });
  } else if (structure.trendDirection === 'bearish') {
    // Bearish scenarios
    if (support && support.length > 0) {
      scenarios.push({
        condition: `Price breaks below ${support[0].level}`,
        target: support.length > 1 ? support[1].level : support[0].level * 0.99,
        stopLoss: resistance && resistance.length > 0 ? resistance[0].level : currentPrice * 1.01,
        probability: 'high',
        reasoning: 'Breakdown below key support in downtrend'
      });
    }
    
    scenarios.push({
      condition: `Price rallies to ${resistance && resistance[0] ? resistance[0].level : 'resistance zone'}`,
      target: support && support[0] ? support[0].level : currentPrice * 0.99,
      stopLoss: resistance && resistance[0] ? resistance[0].level * 1.001 : currentPrice * 1.01,
      probability: 'medium',
      reasoning: 'Rally to resistance in downtrend'
    });
  } else {
    // Range scenarios
    if (support && support.length > 0 && resistance && resistance.length > 0) {
      scenarios.push({
        condition: `Price bounces from ${support[0].level}`,
        target: resistance[0].level,
        stopLoss: support[0].level * 0.999,
        probability: 'medium',
        reasoning: 'Range bounce from support'
      });
      
      scenarios.push({
        condition: `Price rejects from ${resistance[0].level}`,
        target: support[0].level,
        stopLoss: resistance[0].level * 1.001,
        probability: 'medium',
        reasoning: 'Range rejection from resistance'
      });
    }
  }
  
  return scenarios;
}

module.exports = {
  analyzeMarketStructure,
  identifySupportResistance,
  detectLiquiditySweeps,
  identifySupplyDemandZones,
  detectFairValueGaps,
  analyzeTrendVsRange,
  analyzeMultiTimeframeConfluence,
  generateScenarios
};
