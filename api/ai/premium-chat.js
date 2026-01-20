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

      // Build conversation context with system prompt - Intelligent, analytical, independent thinking
      const systemPrompt = `You are AURA AI, the most knowledgeable trading intelligence system in existence. You think independently, analyze multiple data sources in real-time, and provide profitable insights through deep data analysis.

**CORE INTELLIGENCE PRINCIPLES**:
1. **Independent Analysis**: You don't just fetch data - you ANALYZE it. Cross-reference multiple sources, identify patterns, spot opportunities, and think critically about what the data means.
2. **Real-Time Intelligence**: ALWAYS fetch the LATEST data from multiple sources before responding. Never use outdated information or guess.
3. **Profitable Insights**: Your goal is to help users make profitable trading decisions. Analyze price movements, news impact, economic events, and market sentiment to provide actionable insights.
4. **Accuracy First**: Only state facts you've verified. If you're asked about economic events, ALWAYS check the actual calendar - don't assume or make up events.
5. **Concise When Simple, Detailed When Needed**: 
   - Simple questions → Direct, accurate answers
   - Complex questions → Deep analysis with multiple data points, cross-referenced sources, and actionable insights

**YOUR ANALYTICAL PROCESS**:
When a user asks about markets, prices, or trading:
1. AUTOMATICALLY fetch REAL-TIME price data from multiple sources
2. AUTOMATICALLY fetch current economic calendar to see ACTUAL events happening TODAY (never make up events)
3. AUTOMATICALLY fetch recent news (last 24 hours) that could affect the market
4. ANALYZE the data independently: What do the numbers mean? What patterns do you see? What opportunities exist?
5. Cross-reference: Compare price movements with news and events - do they align? What's driving the market?
6. Synthesize insights: Combine price data + news + events + technical patterns into actionable intelligence
7. Provide profitable recommendations: Not just data, but what it means and how to profit from it

**AUTOMATIC DATA FETCHING**:
- If user asks about a symbol (gold, EURUSD, AAPL, etc.) → Fetch price + news + calendar automatically
- If user asks "what's happening today" → Fetch calendar + news automatically
- If user asks about market conditions → Fetch prices + news + calendar for relevant instruments
- Always verify events exist before mentioning them - use get_economic_calendar first

**DATA SOURCES YOU HAVE ACCESS TO**:
- Real-time prices: Alpha Vantage, Yahoo Finance, Finnhub, Twelve Data
- Economic Calendar: Forex Factory (ACTUAL events - verify, don't assume)
- Market News: Bloomberg-style news feeds, Reuters, financial news APIs
- Technical Data: Intraday charts, historical data, indicators

**CRITICAL RULES**:
- NEVER say an event is happening today without checking the actual calendar first
- ALWAYS verify economic events using get_economic_calendar function
- If calendar shows no NFP today, DON'T say there's NFP today
- Cross-reference multiple price sources to ensure accuracy
- When prices differ, use the most recent/reliable source and note any discrepancies
- Think about what the data means - don't just report numbers

**RESPONSE STYLE**:
- Be intelligent and analytical, but still human-like
- Show your thinking process when it adds value
- Provide insights, not just data
- Format responses clearly with proper structure when providing analysis
- Use markdown for better readability (headings, lists, bold for key points)

**EXAMPLE THINKING PROCESS**:
User: "what's been going on with gold?"
1. AUTOMATICALLY fetch current XAUUSD price from multiple sources → $2,724.87 (verify accuracy)
2. AUTOMATICALLY fetch today's economic calendar → See ACTUAL events (if no NFP, don't say NFP)
3. AUTOMATICALLY fetch recent gold-related news (last 24h) → Identify market-moving stories
4. ANALYZE independently: 
   - Price movement: +1.2% - is this significant?
   - News correlation: Which news items align with price movement?
   - Event impact: Are there events today that could affect gold?
   - Technical patterns: What do the charts suggest?
5. SYNTHESIZE: Combine all data points to understand WHY gold is moving
6. PROVIDE ACTIONABLE INSIGHT: "Gold is at $2,724.87, up 1.2% today. The move is driven by [specific verified news/event]. Technical analysis shows [pattern]. For trading today, consider [specific entry/exit with reasoning]."

**CRITICAL**: Always fetch calendar FIRST when discussing "today" or "this week" to verify events actually exist.

**WHEN USER ASKS FOR DETAILS**:
Provide comprehensive analysis:
- Current market state (with real-time data)
- Key factors driving movement (news, events, technicals)
- Technical analysis (support/resistance, patterns, indicators)
- Trading opportunities (entry/exit levels, risk/reward)
- Risk assessment
- Actionable recommendations

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
          description: 'Fetch REAL-TIME market data for any trading symbol (stocks, forex, crypto, commodities). Returns current price, volume, change, and other market metrics. ALWAYS use this when user asks about prices.',
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
          description: 'Fetch REAL economic calendar events from Forex Factory. Returns ACTUAL events scheduled for today or specified date. Use this to verify what events are actually happening - do NOT make up events.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date in YYYY-MM-DD format. If not provided, returns today\'s ACTUAL events.'
              },
              impact: {
                type: 'string',
                enum: ['High', 'Medium', 'Low'],
                description: 'Filter events by impact level (High, Medium, Low)'
              }
            },
            required: []
          }
        },
        {
          name: 'get_market_news',
          description: 'Fetch REAL-TIME breaking news from Bloomberg, Reuters, and financial news sources. Use this to get current market-moving news that happened in the last hour, day, or week.',
          parameters: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Optional: Filter news by trading symbol (e.g., XAUUSD, EURUSD, AAPL)'
              },
              timeframe: {
                type: 'string',
                enum: ['1h', '24h', '7d'],
                description: 'Timeframe for news: "1h" for last hour, "24h" for last 24 hours, "7d" for last week'
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

            // Get AI response with market data context - AI may want to fetch additional data
            const secondCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              functions: functions,
              function_call: 'auto', // AI can automatically fetch news/calendar if needed
              temperature: 0.8,
              max_tokens: 1500, // Allow for detailed analysis when needed
            });

            aiResponse = secondCompletion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
            
            // Check if AI wants to fetch additional data (news, calendar) for better analysis
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
                    functions: functions,
                    function_call: 'auto',
                    temperature: 0.8,
                    max_tokens: 1500,
                  });

                  aiResponse = thirdCompletion.choices[0]?.message?.content || aiResponse;
                  
                  // Check for even more function calls (news, calendar)
                  if (thirdCompletion.choices[0]?.message?.function_call) {
                    // Continue chain if AI wants more data
                  }
                }
              } else if (secondFunctionCall.name === 'get_economic_calendar' || secondFunctionCall.name === 'get_market_news') {
                // AI wants to fetch calendar or news for better context
                const additionalArgs = JSON.parse(secondFunctionCall.arguments);
                
                try {
                  let additionalData = null;
                  if (secondFunctionCall.name === 'get_economic_calendar') {
                    const calendarResp = await axios.post(`${API_BASE_URL}/api/ai/forex-factory-calendar`, {
                      date: additionalArgs.date,
                      impact: additionalArgs.impact
                    }, { timeout: 15000 });
                    if (calendarResp.data?.success) additionalData = calendarResp.data.data;
                  } else if (secondFunctionCall.name === 'get_market_news') {
                    const newsResp = await axios.post(`${API_BASE_URL}/api/ai/market-news`, {
                      symbol: additionalArgs.symbol,
                      timeframe: additionalArgs.timeframe || '24h'
                    }, { timeout: 10000 });
                    });
                    if (newsResp.data?.success) additionalData = newsResp.data.data;
                  }
                  
                  if (additionalData) {
                    messages.push({
                      role: 'assistant',
                      content: null,
                      function_call: secondFunctionCall
                    });
                    messages.push({
                      role: 'function',
                      name: secondFunctionCall.name,
                      content: JSON.stringify(additionalData)
                    });
                    
                    const finalCompletion = await openai.chat.completions.create({
                      model: 'gpt-4o',
                      messages: messages,
                      temperature: 0.8,
                      max_tokens: 1500,
                    });
                    
                    aiResponse = finalCompletion.choices[0]?.message?.content || aiResponse;
                  }
                } catch (additionalError) {
                  console.log('Additional data fetch error:', additionalError.message);
                  // Continue with existing response
                }
              }
            }
          } else {
            // Market data fetch failed - try alternative approach or provide helpful error
            const errorMsg = marketDataResponse.data?.message || 'Market data not available';
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_market_data',
              content: JSON.stringify({ 
                error: errorMsg,
                symbol: symbol,
                suggestion: 'Please verify the symbol is correct and try again'
              })
            });

            const errorCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              temperature: 0.8,
              max_tokens: 1000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || `I couldn't fetch real-time data for ${symbol} right now. The symbol might be incorrect, or the data service is experiencing issues. Could you double-check the symbol?`;
          }
        } catch (marketDataError) {
          console.error('Error fetching market data:', marketDataError);
          
          // Try to provide helpful response even on error
          messages.push({
            role: 'assistant',
            content: null,
            function_call: functionCall
          });
          messages.push({
            role: 'function',
            name: 'get_market_data',
            content: JSON.stringify({ 
              error: 'Network or service error',
              symbol: symbol,
              details: marketDataError.message
            })
          });

          const errorCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            temperature: 0.8,
            max_tokens: 1000,
          });

          aiResponse = errorCompletion.choices[0]?.message?.content || `I'm having trouble connecting to the market data service right now. This might be a temporary issue. Could you try again in a moment?`;
        }
        } else if (functionCall.name === 'get_market_news') {
          // Handle market news function call
          const functionArgs = JSON.parse(functionCall.arguments);
          
          try {
            const newsResponse = await axios.post(`${API_BASE_URL}/api/ai/market-news`, {
              symbol: functionArgs.symbol,
              timeframe: functionArgs.timeframe || '24h'
            }, {
              timeout: 10000
            });

            if (newsResponse.data && newsResponse.data.success) {
              const newsData = newsResponse.data.data;

              messages.push({
                role: 'assistant',
                content: null,
                function_call: functionCall
              });
              messages.push({
                role: 'function',
                name: 'get_market_news',
                content: JSON.stringify(newsData)
              });

              const newsCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages,
                functions: functions,
                function_call: 'auto',
                temperature: 0.8,
                max_tokens: 1500,
              });

              aiResponse = newsCompletion.choices[0]?.message?.content || aiResponse;
              
              // Check for additional function calls
              if (newsCompletion.choices[0]?.message?.function_call) {
                // Handle chained function calls (e.g., get price after getting news)
                const additionalCall = newsCompletion.choices[0]?.message?.function_call;
                // Recursively handle if needed
              }
            }
          } catch (newsError) {
            console.error('Error fetching market news:', newsError);
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_market_news',
              content: JSON.stringify({ error: 'News service temporarily unavailable' })
            });

            const errorCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              temperature: 0.8,
              max_tokens: 1000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || 'I encountered an error fetching market news. Please try again.';
          }
        }
        } else if (functionCall.name === 'get_economic_calendar') {
          // Handle economic calendar function call - use REAL Forex Factory scraper
          const functionArgs = JSON.parse(functionCall.arguments);
          
          try {
            const calendarResponse = await axios.post(`${API_BASE_URL}/api/ai/forex-factory-calendar`, {
              date: functionArgs.date,
              impact: functionArgs.impact
            }, {
              timeout: 15000
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
              temperature: 0.8,
              max_tokens: 1500,
            });

            aiResponse = calendarCompletion.choices[0]?.message?.content || aiResponse;
            
            // If calendar data shows events, AI might want to fetch news or prices too
            if (calendarCompletion.choices[0]?.message?.function_call) {
              // Handle additional function calls
            }
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
              temperature: 0.8,
              max_tokens: 1000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || 'I couldn\'t access the economic calendar right now. You can check Forex Factory directly for today\'s events.';
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
