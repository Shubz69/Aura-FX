const { getDbConnection } = require('../db');
const axios = require('axios');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Check for OpenAI API key
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'AI service is not configured. Please contact support.' 
      });
    }

    // Get authentication token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Verify user and check subscription
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    try {
      // Decode token (custom format used by AURA FX - base64url encoded)
      // The system uses a custom token format: header.payload.signature
      let decoded;
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          if (db && typeof db.release === 'function') {
            db.release();
          }
          return res.status(401).json({ success: false, message: 'Invalid token format' });
        }
        
        // Decode payload (second part)
        const payloadBase64 = tokenParts[1]
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        const padding = payloadBase64.length % 4;
        const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
        
        const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
        decoded = JSON.parse(payloadJson);
        
        // Check if token is expired
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
          if (db && typeof db.release === 'function') {
            db.release();
          }
          return res.status(401).json({ success: false, message: 'Token expired' });
        }
      } catch (decodeError) {
        console.error('Token decode error:', decodeError);
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }

      const userId = decoded.id || decoded.userId;

      // Get user with subscription info
      const [userRows] = await db.execute(
        `SELECT id, email, role, subscription_status, subscription_plan 
         FROM users WHERE id = ?`,
        [userId]
      );

      if (userRows.length === 0) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = userRows[0];
      
      // Check if user is super admin by email (shubzfx@gmail.com)
      const SUPER_ADMIN_EMAIL = 'shubzfx@gmail.com';
      const isSuperAdmin = user.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      
      // Check if user has premium or a7fx subscription
      const hasAccess = 
        isSuperAdmin ||
        user.role === 'premium' || 
        user.role === 'a7fx' || 
        user.role === 'elite' || 
        user.role === 'admin' || 
        user.role === 'super_admin' ||
        (user.subscription_status === 'active' && (user.subscription_plan === 'aura' || user.subscription_plan === 'a7fx'));

      if (!hasAccess) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(403).json({ 
          success: false, 
          message: 'Premium subscription required. Please upgrade to access the AI assistant.' 
        });
      }

      // Get message and conversation history
      const { message, conversationHistory = [] } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(400).json({ success: false, message: 'Message is required' });
      }

      // Initialize OpenAI
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });

      // Build conversation context with system prompt for professional financial analyst
      const systemPrompt = `You are AURA AI, a professional financial analyst and trading strategist for AURA FX, a premium trading education platform with REAL-TIME market data access.

**REAL-TIME CAPABILITIES**:
- You have access to LIVE market data from Bloomberg, Forex Factory, Alpha Vantage, and Yahoo Finance
- You can fetch real-time prices, charts, and market analysis for ANY trading instrument
- You can analyze live charts and provide real-time trading signals
- You can access economic calendars and news events in real-time
- ALL data you provide is CURRENT and LIVE - never use outdated information

**Professional & Analytical**: You speak like a seasoned financial analyst - precise, data-driven, and objective. You use professional terminology and maintain a formal yet accessible tone.

**Key Characteristics**:
- ALWAYS fetch real-time data when users ask about prices, charts, or market analysis
- Provide quantitative analysis with specific metrics, percentages, and data points from LIVE data
- Reference CURRENT market conditions, economic indicators, and technical patterns professionally
- Use financial terminology correctly (e.g., "support level" not "support area", "risk-reward ratio" not "risk reward")
- Structure responses with clear sections: Executive Summary, Real-Time Data, Technical/Fundamental Analysis, Risk Assessment, Trading Recommendation
- When providing charts or analysis, ALWAYS use current market data - fetch it in real-time
- Avoid casual language, emojis in analysis, or overly conversational tone
- Present multiple scenarios with probabilities when appropriate
- Always include risk disclaimers and position sizing recommendations

**Your Expertise**:
1. Technical Analysis - REAL-TIME chart pattern recognition, indicator interpretation (RSI, MACD, Bollinger Bands), support/resistance analysis with live data
2. Fundamental Analysis - Economic indicators, earnings reports, CURRENT market sentiment evaluation, sector analysis
3. Risk Management - Position sizing formulas, stop-loss calculations, risk-reward optimization, portfolio allocation
4. Trading Strategies - Entry/exit criteria based on LIVE prices, timeframe analysis, strategy backtesting principles
5. Market Psychology - Behavioral finance, discipline frameworks, emotional control methodologies
6. Real-Time Market Data - Access to Bloomberg, Forex Factory, and other professional trading platforms for live prices and analysis

**IMPORTANT**: When users ask about:
- Current prices → Fetch real-time quote data
- Charts or technical analysis → Fetch intraday/historical data and analyze
- Market conditions → Get latest market data before responding
- Trading signals → Use real-time data to generate current signals
- Economic events → Reference Forex Factory calendar and current events

**Response Format**: Structure your analysis professionally:
- Executive Summary (brief overview with current market status)
- Real-Time Market Data (current prices, changes, volume from live sources)
- Technical/Fundamental Analysis (detailed findings using current data)
- Risk Assessment (specific risk metrics)
- Trading Recommendation (clear action items with entry/exit levels based on LIVE prices)
- Risk Disclaimer (standard trading risk warnings)

You maintain a professional financial analyst persona at all times. You can answer general questions, but your specialty is financial and trading analysis with REAL-TIME data.

User's subscription tier: ${user.role === 'a7fx' || user.role === 'elite' ? 'A7FX Elite' : 'Premium'}`;

      // Format conversation history for OpenAI
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        { role: 'user', content: message }
      ];

      // Define functions for real-time market data access
      const functions = [
        {
          name: 'get_market_data',
          description: 'Fetch real-time market data for any trading symbol (stocks, forex, crypto, commodities). Returns current price, volume, change, and other market metrics.',
          parameters: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'The trading symbol (e.g., AAPL, EURUSD, BTCUSD, XAUUSD, SPY, etc.)'
              },
              type: {
                type: 'string',
                enum: ['quote', 'intraday'],
                description: 'Type of data: "quote" for current price/quote, "intraday" for historical intraday data for charting'
              }
            },
            required: ['symbol']
          }
        }
      ];

      // Call OpenAI API with function calling
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: 'gpt-4o', // Using GPT-4o for best performance
          messages: messages,
          functions: functions,
          function_call: 'auto', // Let the model decide when to call functions
          temperature: 0.6, // Lower temperature for more professional, consistent responses
          max_tokens: 2000,
        });
      } catch (openaiError) {
        // Handle OpenAI-specific errors
        console.error('OpenAI API error:', openaiError);
        
        // Release database connection
        if (db && typeof db.release === 'function') {
          db.release();
        }
        
        // Check for quota/rate limit errors
        if (openaiError.status === 429 || openaiError.code === 'insufficient_quota' || openaiError.code === 'rate_limit_exceeded') {
          const isQuotaError = openaiError.code === 'insufficient_quota';
          console.error(`OpenAI ${isQuotaError ? 'quota' : 'rate limit'} error:`, {
            code: openaiError.code,
            message: openaiError.error?.message || openaiError.message,
            status: openaiError.status
          });
          
          return res.status(429).json({ 
            success: false, 
            message: isQuotaError 
              ? 'AI service quota has been exceeded. Please add credits to your OpenAI account or upgrade your plan. Contact support if you need assistance.'
              : 'AI service is currently at capacity. Please try again in a few moments. If this issue persists, please contact support.',
            errorType: isQuotaError ? 'quota_exceeded' : 'rate_limit',
            requiresAction: isQuotaError
          });
        }
        
        // Check for authentication errors
        if (openaiError.status === 401 || openaiError.status === 403) {
          return res.status(500).json({ 
            success: false, 
            message: 'AI service configuration error. Please contact support.',
            errorType: 'auth_error'
          });
        }
        
        // Generic OpenAI error
        return res.status(500).json({ 
          success: false, 
          message: 'AI service temporarily unavailable. Please try again in a few moments.',
          errorType: 'openai_error'
        });
      }

      let aiResponse = completion.choices[0]?.message?.content || '';
      let functionCall = completion.choices[0]?.message?.function_call;

      // Handle function calls for real-time market data
      if (functionCall && functionCall.name === 'get_market_data') {
        const functionArgs = JSON.parse(functionCall.arguments);
        const symbol = functionArgs.symbol;
        const dataType = functionArgs.type || 'quote';

        // Fetch real-time market data
        const API_BASE_URL = process.env.API_URL || req.headers.origin || 'http://localhost:3000';
        try {
          const marketDataResponse = await axios.post(`${API_BASE_URL}/api/ai/market-data`, {
            symbol: symbol,
            type: dataType
          }, {
            timeout: 10000
          });

          if (marketDataResponse.data && marketDataResponse.data.success) {
            const marketData = marketDataResponse.data.data;

            // Add function result to conversation and get AI response
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_market_data',
              content: JSON.stringify(marketData)
            });

            // Get AI response with market data context
            const secondCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              functions: functions,
              function_call: 'auto',
              temperature: 0.6,
              max_tokens: 2000,
            });

            aiResponse = secondCompletion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
            
            // Check if there's another function call needed
            if (secondCompletion.choices[0]?.message?.function_call) {
              // Handle additional function calls if needed (e.g., for intraday data after quote)
              const secondFunctionCall = secondCompletion.choices[0]?.message?.function_call;
              if (secondFunctionCall.name === 'get_market_data') {
                const secondArgs = JSON.parse(secondFunctionCall.arguments);
                const secondMarketDataResponse = await axios.post(`${API_BASE_URL}/api/ai/market-data`, {
                  symbol: secondArgs.symbol,
                  type: secondArgs.type || 'intraday'
                }, {
                  timeout: 10000
                });

                if (secondMarketDataResponse.data && secondMarketDataResponse.data.success) {
                  messages.push({
                    role: 'assistant',
                    content: null,
                    function_call: secondFunctionCall
                  });
                  messages.push({
                    role: 'function',
                    name: 'get_market_data',
                    content: JSON.stringify(secondMarketDataResponse.data.data)
                  });

                  const thirdCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: messages,
                    temperature: 0.6,
                    max_tokens: 2000,
                  });

                  aiResponse = thirdCompletion.choices[0]?.message?.content || aiResponse;
                }
              }
            }
          } else {
            // Market data fetch failed, but continue with AI response
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_market_data',
              content: JSON.stringify({ error: 'Market data not available for this symbol' })
            });

            const errorCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              temperature: 0.6,
              max_tokens: 2000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || 'I apologize, but I could not fetch market data for that symbol. Please check the symbol and try again.';
          }
        } catch (marketDataError) {
          console.error('Error fetching market data:', marketDataError);
          // Continue with AI response even if market data fails
          messages.push({
            role: 'assistant',
            content: null,
            function_call: functionCall
          });
          messages.push({
            role: 'function',
            name: 'get_market_data',
            content: JSON.stringify({ error: 'Market data service temporarily unavailable' })
          });

          const errorCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            temperature: 0.6,
            max_tokens: 2000,
          });

          aiResponse = errorCompletion.choices[0]?.message?.content || 'I apologize, but I encountered an error fetching market data. Please try again.';
        }
      }

      if (!aiResponse) {
        aiResponse = 'I apologize, but I could not generate a response. Please try again.';
      }

      // Release database connection back to pool
      if (db && typeof db.release === 'function') {
        db.release();
      }

      return res.status(200).json({
        success: true,
        response: aiResponse,
        model: completion.model,
        usage: completion.usage
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      // Release connection if it exists
      if (db && typeof db.release === 'function') {
        db.release();
      }
      return res.status(500).json({ success: false, message: 'Database error' });
    }

  } catch (error) {
    console.error('Error in premium AI chat:', error);
    
    // Check if it's an OpenAI error that wasn't caught
    if (error.status === 429 || error.code === 'insufficient_quota' || error.code === 'rate_limit_exceeded') {
      return res.status(429).json({ 
        success: false, 
        message: 'AI service is currently at capacity. Please try again in a few moments. If this issue persists, please contact support.',
        errorType: 'rate_limit'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to process AI request' 
    });
  }
};
