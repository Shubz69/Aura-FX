// Enhanced Image Analysis
// Analyzes chart screenshots, broker screenshots, and documents

const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Analyze image with GPT-4 Vision
async function analyzeImage(imageBase64, purpose = 'chart') {
  try {
    const systemPrompt = purpose === 'chart' 
      ? `You are an expert technical analyst. Analyze this trading chart screenshot and provide:
- Instrument/Symbol (e.g., XAUUSD, EURUSD, AAPL)
- Timeframe (1m, 5m, 15m, 1H, 4H, Daily, Weekly)
- Current trend direction (Bullish, Bearish, Neutral)
- Key support and resistance levels (exact price values)
- Market structure (HH/HL for uptrend, LH/LL for downtrend, or ranging)
- Visible patterns (head & shoulders, triangles, flags, etc.)
- Indicators visible (RSI, MACD, moving averages, etc.)
- Bias (Bullish, Bearish, or Neutral) with reasoning
- Potential scenarios (what could happen next)

Be specific with price levels and provide actionable analysis.`
      : purpose === 'broker'
      ? `You are a risk management expert. Analyze this broker screenshot and extract:
- Entry price
- Stop Loss (SL) price
- Take Profit (TP) price
- Lot size or position size
- Current Profit/Loss (P/L)
- Instrument/Symbol
- Account balance (if visible)
- Leverage (if visible)

Then calculate:
- Risk percentage (if account balance visible)
- Pips risked (for forex)
- Risk/Reward ratio
- Flag any issues: Over-risk (>3%), Missing SL, Bad position sizing, etc.

Provide feedback on the trade setup.`
      : `You are a trading education expert. Analyze this document (trading book, notes, PDF) and extract:
- Trading rules
- Strategies
- Checklists
- Key concepts
- Risk management principles

Convert into actionable format: rules, checklists, strategy templates.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: purpose === 'chart' 
                ? 'Analyze this trading chart and provide detailed technical analysis with specific price levels, trend, support/resistance, and bias.'
                : purpose === 'broker'
                ? 'Extract trade details from this broker screenshot and calculate risk metrics. Flag any issues.'
                : 'Extract trading rules, strategies, and concepts from this document.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.3 // Lower temperature for more accurate analysis
    });

    return {
      success: true,
      analysis: response.choices[0]?.message?.content || '',
      purpose
    };

  } catch (error) {
    console.error('Error analyzing image:', error);
    return {
      success: false,
      error: error.message,
      purpose
    };
  }
}

module.exports = {
  analyzeImage
};
