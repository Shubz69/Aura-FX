// Trading Calculator API
// Handles all trading math: position sizing, risk calculations, pip values, etc.

const axios = require('axios');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { 
      operation,
      accountSize,
      riskPercent,
      instrument,
      entryPrice,
      stopLoss,
      takeProfit,
      leverage,
      contractSize,
      pipValue,
      tickSize,
      tickValue
    } = req.body;

    if (!operation) {
      return res.status(400).json({ success: false, message: 'Operation is required' });
    }

    let result = {};

    switch (operation) {
      case 'calculate_position_size':
        // Calculate position size based on risk
        if (!accountSize || !riskPercent || !entryPrice || !stopLoss) {
          return res.status(400).json({ success: false, message: 'Missing required parameters for position sizing' });
        }

        const riskAmount = accountSize * (riskPercent / 100);
        const priceRisk = Math.abs(entryPrice - stopLoss);
        
        // For forex: pip value calculation
        if (instrument && (instrument.length === 6 && /^[A-Z]{6}$/.test(instrument))) {
          // Forex pair (6 letters like EURUSD)
          const isJPY = instrument.includes('JPY');
          const pipSize = isJPY ? 0.01 : 0.0001;
          const pipValuePerLot = pipValue || (isJPY ? 8.33 : 10); // Default pip values
          const pips = priceRisk / pipSize;
          const standardContractSize = contractSize || 100000;
          const lots = riskAmount / (pips * pipValuePerLot);
          
          result = {
            positionSize: parseFloat(lots.toFixed(2)),
            riskAmount: parseFloat(riskAmount.toFixed(2)),
            riskPercent,
            pips: parseFloat(pips.toFixed(1)),
            pipValue: pipValuePerLot,
            units: parseFloat((lots * standardContractSize).toFixed(0)),
            calculation: `Risk: $${riskAmount.toFixed(2)} (${riskPercent}% of $${accountSize}) / ${pips.toFixed(1)} pips × $${pipValuePerLot} per pip = ${lots.toFixed(2)} lots`
          };
        } else {
          // Stocks, crypto, commodities
          const standardContractSize = contractSize || 1;
          const units = riskAmount / priceRisk;
          const totalValue = units * entryPrice;
          
          result = {
            positionSize: parseFloat(units.toFixed(4)),
            riskAmount: parseFloat(riskAmount.toFixed(2)),
            riskPercent,
            priceRisk: parseFloat(priceRisk.toFixed(4)),
            contractSize: standardContractSize,
            totalValue: parseFloat(totalValue.toFixed(2)),
            units: parseFloat((units * standardContractSize).toFixed(4)),
            calculation: `Risk: $${riskAmount.toFixed(2)} (${riskPercent}% of $${accountSize}) / $${priceRisk.toFixed(4)} price risk = ${units.toFixed(4)} units`
          };
        }
        break;

      case 'calculate_risk_reward':
        if (!entryPrice || !stopLoss || !takeProfit) {
          return res.status(400).json({ success: false, message: 'Missing price levels' });
        }

        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);
        const riskRewardRatio = reward / risk;
        const riskPercentCalc = (risk / entryPrice) * 100;
        const rewardPercentCalc = (reward / entryPrice) * 100;

        result = {
          risk: risk.toFixed(4),
          reward: reward.toFixed(4),
          riskRewardRatio: riskRewardRatio.toFixed(2),
          riskPercent: riskPercentCalc.toFixed(2) + '%',
          rewardPercent: rewardPercentCalc.toFixed(2) + '%',
          isProfitable: riskRewardRatio >= 1,
          recommendation: riskRewardRatio >= 2 ? 'Excellent R:R' : riskRewardRatio >= 1.5 ? 'Good R:R' : riskRewardRatio >= 1 ? 'Acceptable R:R' : 'Poor R:R - consider adjusting TP'
        };
        break;

      case 'calculate_pip_value':
        if (!instrument || !contractSize) {
          return res.status(400).json({ success: false, message: 'Missing instrument or contract size' });
        }

        // Forex pip value calculation
        const isJPY = instrument.includes('JPY');
        const pipSize = isJPY ? 0.01 : 0.0001;
        const basePipValue = contractSize * pipSize;
        
        result = {
          pipValue: basePipValue,
          pipSize,
          contractSize,
          isJPY
        };
        break;

      case 'calculate_margin':
        const { positionSize: posSize } = req.body;
        if (!accountSize || !leverage || !entryPrice || !posSize) {
          return res.status(400).json({ success: false, message: 'Missing margin calculation parameters' });
        }

        const standardContractSize = contractSize || 100000; // Default for forex
        const notionalValue = posSize * entryPrice * standardContractSize;
        const requiredMargin = notionalValue / leverage;
        const freeMargin = accountSize - requiredMargin;
        const marginLevel = (accountSize / requiredMargin) * 100;
        const isSafe = marginLevel > 200;
        const liquidationWarning = marginLevel < 150;

        result = {
          notionalValue: notionalValue.toFixed(2),
          requiredMargin: requiredMargin.toFixed(2),
          freeMargin: freeMargin.toFixed(2),
          marginLevel: marginLevel.toFixed(2) + '%',
          leverage,
          isSafe,
          liquidationWarning,
          liquidationLevel: entryPrice * (1 - (1 / leverage)),
          warning: liquidationWarning ? 'WARNING: Margin level below 150% - high liquidation risk!' : isSafe ? 'Margin level is safe' : 'Monitor margin level closely'
        };
        break;

      case 'calculate_atr_based_stop':
        // ATR-based stop loss calculation
        const { atr, atrMultiplier } = req.body;
        if (!atr || !atrMultiplier || !entryPrice) {
          return res.status(400).json({ success: false, message: 'Missing ATR parameters' });
        }

        const atrStop = atr * atrMultiplier;
        result = {
          atrStop,
          longStop: entryPrice - atrStop,
          shortStop: entryPrice + atrStop,
          atrMultiplier
        };
        break;

      default:
        return res.status(400).json({ success: false, message: 'Unknown operation' });
    }

    return res.status(200).json({
      success: true,
      operation,
      result
    });

  } catch (error) {
    console.error('Trading calculator error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Trading calculation failed'
    });
  }
};
