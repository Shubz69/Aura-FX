/**
 * Enhanced Chart Image Analyzer
 * Provides actionable technical analysis from chart screenshots
 * 
 * Features:
 * - Trend identification (HH/HL, LH/LL structure)
 * - Key level extraction (exact prices)
 * - Pattern recognition
 * - Liquidity zone detection
 * - Invalidation levels
 * - Trade setup identification
 * - Mistake detection (common errors)
 */

const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// CHART ANALYSIS PROMPTS
// ============================================================================

const CHART_ANALYSIS_PROMPT = `You are Aura, an expert technical analyst with 15+ years of trading experience. You specialize in:
- Smart Money Concepts (SMC)
- ICT methodology (liquidity, order blocks, fair value gaps)
- Price action and market structure
- Supply/demand zones

Analyze this chart and provide a STRUCTURED TRADER-GRADE ANALYSIS:

## 📊 CHART IDENTIFICATION
- **Instrument**: [Symbol, e.g., XAUUSD, EURUSD]
- **Timeframe**: [e.g., 1H, 4H, Daily]
- **Current Price**: [If visible]
- **Data Source**: Visual analysis from chart

## 📈 TREND & STRUCTURE
- **Primary Trend**: [Bullish/Bearish/Ranging] with clear reasoning
- **Market Structure**: 
  - Last significant swing high: [price]
  - Last significant swing low: [price]
  - Structure breaks: [BOS/CHoCH locations]

## 🎯 KEY LEVELS (Specific Prices)
| Level Type | Price | Significance |
|------------|-------|--------------|
| Major Resistance | [price] | [why it matters] |
| Minor Resistance | [price] | [context] |
| Current Price | [price] | |
| Minor Support | [price] | [context] |
| Major Support | [price] | [why it matters] |

## 💧 LIQUIDITY & ORDER FLOW
- **Buy-side Liquidity**: [locations where stops are resting above]
- **Sell-side Liquidity**: [locations where stops are resting below]
- **Order Blocks**: [identify OB zones if visible]
- **Fair Value Gaps**: [identify FVG/imbalances if visible]

## ❌ INVALIDATION
- **Bullish Invalidation**: Below [price] - would confirm bearish shift
- **Bearish Invalidation**: Above [price] - would confirm bullish shift

## 📋 TRADE SCENARIOS

### Scenario 1: [Direction]
- Entry Zone: [price range]
- Stop Loss: [price] (below/above [reference])
- Target 1: [price] (R:R = X)
- Target 2: [price] (R:R = X)
- Probability: [High/Medium/Low] - [reasoning]

### Scenario 2: [Opposite or Alternative]
- Entry Zone: [price range]
- Stop Loss: [price]
- Target: [price]

## ⚠️ MISTAKES & WARNINGS
Identify any visible issues in the chart or potential traps:
- [e.g., "Resistance being tested for 4th time - likely to break"]
- [e.g., "Extended move - waiting for pullback reduces risk"]
- [e.g., "Divergence on RSI suggests momentum weakening"]

## 🎯 ACTIONABLE BIAS
[One clear sentence: "Bias is BULLISH above X, looking for longs on pullback to Y" or similar]

Be precise with price levels. If you cannot read exact numbers, estimate based on visible scale.`;

const BROKER_SCREENSHOT_PROMPT = `You are a risk management expert. Analyze this broker/MT4/MT5 screenshot and extract ALL visible information:

## 📊 TRADE DETAILS
- **Instrument**: [Symbol]
- **Direction**: [BUY/SELL]
- **Entry Price**: [exact price]
- **Current Price**: [if visible]
- **Stop Loss**: [price or "NOT SET" if missing]
- **Take Profit**: [price or "NOT SET" if missing]
- **Lot Size**: [position size]
- **Current P/L**: [profit/loss amount]

## 📈 ACCOUNT INFO (if visible)
- **Balance**: [amount]
- **Equity**: [amount]
- **Margin Used**: [amount]
- **Free Margin**: [amount]
- **Leverage**: [ratio]

## ⚙️ CALCULATED METRICS
- **Risk Amount**: [$ at risk if SL is hit]
- **Risk Percentage**: [% of account]
- **Pips to SL**: [for forex]
- **Pips to TP**: [for forex]
- **Risk/Reward Ratio**: [X:1]

## ⚠️ ISSUES DETECTED
Rate each issue as 🔴 CRITICAL, 🟡 WARNING, or 🟢 OK

| Check | Status | Details |
|-------|--------|---------|
| Stop Loss Set | [🔴/🟢] | [comment] |
| Risk < 2% | [🔴/🟡/🟢] | [actual %] |
| Valid R:R (>1:1.5) | [🔴/🟡/🟢] | [actual ratio] |
| Position Sizing | [🔴/🟡/🟢] | [comment] |

## 📋 RECOMMENDATIONS
[List specific actions to improve this trade or future trades]`;

const TRADE_REVIEW_PROMPT = `You are a trading coach reviewing a completed trade. Analyze this chart showing a trade (entry, exit, or both) and provide:

## 📊 TRADE IDENTIFICATION
- **Instrument**: [Symbol]
- **Direction**: [Long/Short]
- **Entry**: [price/zone if visible]
- **Exit**: [price if visible]
- **Outcome**: [Win/Loss/Breakeven]

## ✅ WHAT WAS DONE RIGHT
[List 2-3 things that were good about this trade execution]

## ❌ MISTAKES IDENTIFIED
[List specific errors with exact references to the chart]
- Entry timing issue: [description]
- Exit issue: [description]
- Risk management: [description]

## 📚 LESSONS
[2-3 specific, actionable lessons from this trade]

## 🎯 IMPROVEMENT ACTIONS
[Specific things to do differently next time]`;

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

async function analyzeChart(imageBase64, context = {}) {
  const requestId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();
  
  console.log(`[${requestId}] Starting chart analysis`);
  
  try {
    // Build context-aware prompt
    let enhancedPrompt = CHART_ANALYSIS_PROMPT;
    
    if (context.instrument) {
      enhancedPrompt += `\n\nNOTE: User mentioned this is ${context.instrument}. Confirm or correct.`;
    }
    if (context.question) {
      enhancedPrompt += `\n\nUser's specific question: "${context.question}"`;
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: enhancedPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this trading chart. Provide specific price levels and actionable analysis.'
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64 }
            }
          ]
        }
      ],
      max_tokens: 3000,
      temperature: 0.2 // Low temperature for consistent analysis
    });
    
    const analysis = response.choices[0]?.message?.content || '';
    const duration = Date.now() - startTime;
    
    console.log(`[${requestId}] Chart analysis completed in ${duration}ms`);
    
    // Parse structured data from response
    const parsed = parseChartAnalysis(analysis);
    
    return {
      success: true,
      requestId,
      purpose: 'chart',
      analysis,
      parsed,
      processingTime: duration,
      model: 'gpt-4o',
      dataLabel: 'Visual analysis from uploaded chart'
    };
    
  } catch (error) {
    console.error(`[${requestId}] Chart analysis error:`, error);
    
    return {
      success: false,
      requestId,
      purpose: 'chart',
      error: error.message,
      processingTime: Date.now() - startTime,
      fallback: 'Unable to analyze chart image. Please ensure the image is clear and try again.'
    };
  }
}

async function analyzeBrokerScreenshot(imageBase64) {
  const requestId = `broker_${Date.now()}`;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: BROKER_SCREENSHOT_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this broker screenshot and extract trade details. Calculate risk metrics and flag any issues.' },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.2
    });
    
    return {
      success: true,
      requestId,
      purpose: 'broker',
      analysis: response.choices[0]?.message?.content || '',
      dataLabel: 'Extracted from broker screenshot'
    };
    
  } catch (error) {
    return {
      success: false,
      requestId,
      purpose: 'broker',
      error: error.message
    };
  }
}

async function reviewTrade(imageBase64, notes = '') {
  const requestId = `review_${Date.now()}`;
  
  try {
    let prompt = TRADE_REVIEW_PROMPT;
    if (notes) {
      prompt += `\n\nTrader's notes: "${notes}"`;
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Review this trade. Identify what was done well and what mistakes were made.' },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });
    
    return {
      success: true,
      requestId,
      purpose: 'trade_review',
      analysis: response.choices[0]?.message?.content || '',
      dataLabel: 'Trade review analysis'
    };
    
  } catch (error) {
    return {
      success: false,
      requestId,
      purpose: 'trade_review',
      error: error.message
    };
  }
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

function parseChartAnalysis(analysis) {
  const parsed = {
    instrument: null,
    timeframe: null,
    trend: null,
    bias: null,
    keyLevels: {
      resistance: [],
      support: [],
      current: null
    },
    invalidation: {
      bullish: null,
      bearish: null
    },
    scenarios: [],
    warnings: []
  };
  
  try {
    // Extract instrument
    const instrumentMatch = analysis.match(/\*\*Instrument\*\*:\s*([A-Z]{3,6}(?:USD)?)/i);
    if (instrumentMatch) parsed.instrument = instrumentMatch[1].toUpperCase();
    
    // Extract timeframe
    const tfMatch = analysis.match(/\*\*Timeframe\*\*:\s*(\d+[mMhHdDwW]|Daily|Weekly|Monthly)/i);
    if (tfMatch) parsed.timeframe = tfMatch[1];
    
    // Extract trend
    const trendMatch = analysis.match(/\*\*Primary Trend\*\*:\s*(Bullish|Bearish|Ranging|Neutral)/i);
    if (trendMatch) parsed.trend = trendMatch[1].toLowerCase();
    
    // Extract bias
    const biasMatch = analysis.match(/Bias is (BULLISH|BEARISH|NEUTRAL)/i);
    if (biasMatch) parsed.bias = biasMatch[1].toLowerCase();
    
    // Extract price levels (look for numbers that look like prices)
    const pricePattern = /(\d{1,5}(?:\.\d{1,5})?)/g;
    const prices = analysis.match(pricePattern) || [];
    
    // Simple heuristic: first few unique prices are likely key levels
    const uniquePrices = [...new Set(prices.map(p => parseFloat(p)))].filter(p => p > 0);
    if (uniquePrices.length > 0) {
      parsed.keyLevels.current = uniquePrices[Math.floor(uniquePrices.length / 2)];
      parsed.keyLevels.resistance = uniquePrices.filter(p => p > parsed.keyLevels.current).slice(0, 3);
      parsed.keyLevels.support = uniquePrices.filter(p => p < parsed.keyLevels.current).slice(-3);
    }
    
    // Extract warnings
    const warningsSection = analysis.match(/MISTAKES & WARNINGS[\s\S]*?(?=##|$)/);
    if (warningsSection) {
      const warningLines = warningsSection[0].match(/- .+/g) || [];
      parsed.warnings = warningLines.map(w => w.replace(/^- /, '').trim());
    }
    
  } catch (e) {
    console.warn('Error parsing chart analysis:', e.message);
  }
  
  return parsed;
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

async function analyzeImage(imageBase64, purpose = 'chart') {
  switch (purpose) {
    case 'chart':
      return analyzeChart(imageBase64);
    case 'broker':
      return analyzeBrokerScreenshot(imageBase64);
    case 'review':
      return reviewTrade(imageBase64);
    default:
      return analyzeChart(imageBase64);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  analyzeImage,
  analyzeChart,
  analyzeBrokerScreenshot,
  reviewTrade,
  parseChartAnalysis
};
