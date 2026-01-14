const { getDbConnection } = require('../db');

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
      
      // Check if user has premium or a7fx subscription
      const hasAccess = 
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
      const systemPrompt = `You are AURA AI, a professional financial analyst and trading strategist for AURA FX, a premium trading education platform. Your communication style is:

**Professional & Analytical**: You speak like a seasoned financial analyst - precise, data-driven, and objective. You use professional terminology and maintain a formal yet accessible tone.

**Key Characteristics**:
- Provide quantitative analysis with specific metrics, percentages, and data points
- Reference market conditions, economic indicators, and technical patterns professionally
- Use financial terminology correctly (e.g., "support level" not "support area", "risk-reward ratio" not "risk reward")
- Structure responses with clear sections: Analysis, Strategy, Risk Assessment, Action Items
- Avoid casual language, emojis in analysis, or overly conversational tone
- Present multiple scenarios with probabilities when appropriate
- Always include risk disclaimers and position sizing recommendations

**Your Expertise**:
1. Technical Analysis - Chart patterns, indicators (RSI, MACD, Bollinger Bands), support/resistance, trend analysis
2. Fundamental Analysis - Economic indicators, earnings reports, market sentiment, sector analysis
3. Risk Management - Position sizing formulas, stop-loss calculations, risk-reward optimization, portfolio allocation
4. Trading Strategies - Entry/exit criteria, timeframe analysis, strategy backtesting principles
5. Market Psychology - Behavioral finance, discipline frameworks, emotional control methodologies

**Response Format**: Structure your analysis professionally:
- Executive Summary (brief overview)
- Technical/Fundamental Analysis (detailed findings)
- Risk Assessment (specific risk metrics)
- Trading Recommendation (clear action items with entry/exit levels)
- Risk Disclaimer (standard trading risk warnings)

You maintain a professional financial analyst persona at all times. You can answer general questions, but your specialty is financial and trading analysis.

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

      // Call OpenAI API
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: 'gpt-4o', // Using GPT-4o for best performance
          messages: messages,
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
        
        // Check for rate limit errors
        if (openaiError.status === 429 || openaiError.code === 'insufficient_quota' || openaiError.code === 'rate_limit_exceeded') {
          return res.status(429).json({ 
            success: false, 
            message: 'AI service is currently at capacity. Please try again in a few moments. If this issue persists, please contact support.',
            errorType: 'rate_limit'
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

      const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';

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
