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

      // Build conversation context with system prompt - Human-like, concise, helpful
      const systemPrompt = `You are AURA AI, a helpful and knowledgeable trading assistant for AURA FX. You have access to REAL-TIME market data and can help with any trading-related questions.

**CORE PRINCIPLES**:
1. **Be Human-Like**: Talk naturally, like you're having a conversation with a friend who knows trading. Be friendly, approachable, and conversational.
2. **Be Concise**: Only answer what's asked. If someone asks "where is gold?", just tell them the price. Don't add extra analysis unless they ask for it.
3. **Provide Details When Asked**: If they ask for "details", "analysis", or "more info", THEN provide comprehensive information with technical analysis, charts, etc.
4. **Always Use Real-Time Data**: When asked about prices or market data, ALWAYS fetch the latest real-time data. Never guess or use outdated information.

**How to Respond**:
- Simple questions → Simple, direct answers
- "What's the price of X?" → Just give the current price and maybe a brief context if relevant
- "Tell me about X" → Provide a helpful overview, but keep it conversational
- "Give me details/analysis on X" → NOW provide comprehensive analysis with technical details, charts, risk assessment, etc.
- General questions → Answer helpfully and naturally, like a knowledgeable friend

**Real-Time Data Access**:
- You can fetch live prices from multiple sources (Bloomberg, Yahoo Finance, Alpha Vantage, Finnhub)
- Always use the most recent data available
- If prices differ between sources, use the most reliable one and mention if there's a slight delay

**Your Capabilities**:
- Real-time market prices and data
- Technical and fundamental analysis (when requested)
- Chart generation and analysis
- Trading strategy advice
- Risk management guidance
- General trading education
- Answer any question - trading or otherwise

**Tone**: Be natural, helpful, and conversational. Think of yourself as a knowledgeable trading friend, not a formal analyst. Only use formal analysis format when specifically requested.

**Example Responses**:
- User: "where is gold?" → "Gold (XAU/USD) is currently at $2,724.87, up about $15 from yesterday's close."
- User: "tell me about AAPL" → "Apple is trading around $185 right now. It's been pretty stable this week. Want me to pull up some charts or analysis?"
- User: "give me a detailed analysis of EURUSD" → [Now provide comprehensive analysis with technical indicators, support/resistance, risk assessment, etc.]

Remember: Answer the question asked, be helpful, be human. Only go into detail when they ask for it.

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
          description: 'Fetch real-time market data for any trading symbol (stocks, forex, crypto, commodities). Returns current price, volume, change, and other market metrics. Use this for live prices and chart data.',
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
        },
        {
          name: 'get_economic_calendar',
          description: 'Fetch economic calendar events from Forex Factory and other sources. Returns upcoming economic events, news releases, and their expected impact on markets.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date in YYYY-MM-DD format. If not provided, returns today\'s events.'
              },
              impact: {
                type: 'string',
                enum: ['High', 'Medium', 'Low'],
                description: 'Filter events by impact level (High, Medium, Low)'
              }
            },
            required: []
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
          temperature: 0.8, // Higher temperature for more natural, human-like, conversational responses
          max_tokens: 1000, // Reduced for more concise responses - only provide details when asked
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

      // Handle function calls for real-time market data and economic calendar
      if (functionCall) {
        const API_BASE_URL = process.env.API_URL || req.headers.origin || 'http://localhost:3000';
        
        if (functionCall.name === 'get_market_data') {
        const functionArgs = JSON.parse(functionCall.arguments);
        const symbol = functionArgs.symbol;
        const dataType = functionArgs.type || 'quote';

        // Fetch real-time market data
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

            // Get AI response with market data context - more conversational
            const secondCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              functions: functions,
              function_call: 'auto',
              temperature: 0.8, // Higher temperature for more natural, human-like responses
              max_tokens: 1000, // Reduced for more concise responses
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
        } else if (functionCall.name === 'get_economic_calendar') {
          // Handle economic calendar function call
          const functionArgs = JSON.parse(functionCall.arguments);
          
          try {
            const calendarResponse = await axios.post(`${API_BASE_URL}/api/ai/forex-factory`, {
              date: functionArgs.date,
              impact: functionArgs.impact
            }, {
              timeout: 10000
            });

            if (calendarResponse.data && calendarResponse.data.success) {
              const calendarData = calendarResponse.data.data;

              messages.push({
                role: 'assistant',
                content: null,
                function_call: functionCall
              });
              messages.push({
                role: 'function',
                name: 'get_economic_calendar',
                content: JSON.stringify(calendarData)
              });

              const calendarCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages,
                functions: functions,
                function_call: 'auto',
                temperature: 0.6,
                max_tokens: 2000,
              });

              aiResponse = calendarCompletion.choices[0]?.message?.content || aiResponse;
            }
          } catch (calendarError) {
            console.error('Error fetching economic calendar:', calendarError);
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_economic_calendar',
              content: JSON.stringify({ error: 'Economic calendar service temporarily unavailable' })
            });

            const errorCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              temperature: 0.6,
              max_tokens: 2000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || 'I apologize, but I encountered an error fetching economic calendar data. Please try again.';
          }
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
