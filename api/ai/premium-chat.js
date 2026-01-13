const { getDbConnection } = require('../../db');

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
          await db.end();
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
          await db.end();
          return res.status(401).json({ success: false, message: 'Token expired' });
        }
      } catch (decodeError) {
        console.error('Token decode error:', decodeError);
        await db.end();
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
        await db.end();
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = userRows[0];
      
      // Check if user has premium or a7fx subscription
      const hasAccess = 
        user.role === 'premium' || 
        user.role === 'a7fx' || 
        user.role === 'admin' || 
        user.role === 'super_admin' ||
        (user.subscription_status === 'active' && (user.subscription_plan === 'aura' || user.subscription_plan === 'a7fx'));

      if (!hasAccess) {
        await db.end();
        return res.status(403).json({ 
          success: false, 
          message: 'Premium subscription required. Please upgrade to access the AI assistant.' 
        });
      }

      // Get message and conversation history
      const { message, conversationHistory = [] } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        await db.end();
        return res.status(400).json({ success: false, message: 'Message is required' });
      }

      // Initialize OpenAI
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });

      // Build conversation context with system prompt for trading expertise
      const systemPrompt = `You are an expert trading AI assistant for AURA FX, a premium trading education platform. You provide:

1. **Advanced Trading Knowledge**: Deep insights into forex, stocks, crypto, and other markets
2. **Technical Analysis**: Chart patterns, indicators, support/resistance levels
3. **Risk Management**: Position sizing, stop losses, risk-reward ratios
4. **Trading Strategies**: Scalping, swing trading, day trading, long-term investing
5. **Market Psychology**: Emotional control, discipline, trading mindset
6. **Platform Features**: Help users navigate AURA FX courses and community

You are conversational, helpful, and provide actionable trading advice. You can also answer general questions, but your specialty is trading knowledge. Always prioritize accuracy and risk awareness in your trading advice.

User's subscription tier: ${user.role === 'a7fx' ? 'A7FX Elite' : 'Premium'}`;

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
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // Using GPT-4o for best performance, fallback to gpt-4-turbo or gpt-3.5-turbo if needed
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const aiResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';

      await db.end();

      return res.status(200).json({
        success: true,
        response: aiResponse,
        model: completion.model,
        usage: completion.usage
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      if (db && !db.ended) await db.end();
      return res.status(500).json({ success: false, message: 'Database error' });
    }

  } catch (error) {
    console.error('Error in premium AI chat:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to process AI request' 
    });
  }
};
