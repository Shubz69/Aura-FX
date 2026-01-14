// Chatbot API endpoint - Provides helpful responses about the website
// For financial/trading questions, redirects users to Aura AI (premium feature)

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
    const { message, authenticated, userId, userEmail } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Message is required' 
      });
    }

    const msg = message.toLowerCase().trim();

    // Detect financial/trading analysis questions that require Aura AI
    const financialKeywords = [
      'analyze', 'analysis', 'technical analysis', 'fundamental analysis',
      'market analysis', 'chart analysis', 'price prediction', 'forecast',
      'trading strategy', 'entry point', 'exit point', 'stop loss', 'take profit',
      'risk reward', 'position sizing', 'portfolio', 'investment advice',
      'buy signal', 'sell signal', 'indicator', 'rsi', 'macd', 'bollinger',
      'support level', 'resistance level', 'trend', 'candlestick', 'pattern',
      'what should i trade', 'should i buy', 'should i sell', 'when to enter',
      'when to exit', 'how much to risk', 'what is my risk', 'calculate',
      'trading plan', 'risk management', 'market outlook', 'price target'
    ];

    const isFinancialQuestion = financialKeywords.some(keyword => msg.includes(keyword));

    if (isFinancialQuestion) {
      // Check if user has premium access
      let hasPremiumAccess = false;
      
      if (authenticated && userId) {
        try {
          const { getDbConnection } = require('./db');
          const db = await getDbConnection();
          
          if (db) {
            const [users] = await db.execute(
              `SELECT role, subscription_status, subscription_plan 
               FROM users WHERE id = ?`,
              [userId]
            );
            
            if (users && users.length > 0) {
              const user = users[0];
              hasPremiumAccess = 
                user.role === 'premium' || 
                user.role === 'a7fx' || 
                user.role === 'elite' ||
                user.role === 'admin' ||
                user.role === 'super_admin' ||
                (user.subscription_status === 'active' && 
                 (user.subscription_plan === 'aura' || user.subscription_plan === 'a7fx'));
            }
            
            // Release database connection
            if (db && typeof db.release === 'function') {
              db.release();
            }
          }
        } catch (dbError) {
          console.error('Error checking user subscription:', dbError);
          // Continue with default response
        }
      }

      if (hasPremiumAccess) {
        return res.status(200).json({
          success: true,
          reply: `For detailed financial analysis and trading strategies, please use <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Aura AI</a>. Aura AI provides professional technical analysis, risk assessments, and trading recommendations tailored to your needs.`,
          redirectTo: '/premium-ai',
          requiresPremium: false
        });
      } else {
        return res.status(200).json({
          success: true,
          reply: `For detailed financial analysis and trading strategies, you'll need access to <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Aura AI</a>. Aura AI is available with a Premium subscription. <a href="/subscription" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Subscribe now</a> to unlock professional trading analysis and insights.`,
          redirectTo: '/subscription',
          requiresPremium: true
        });
      }
    }

    // Handle general website questions (offline-capable responses)
    let reply = '';

    // Greetings
    if (msg.includes('hello') || msg.includes('hi ') || msg.includes('hey') || msg.match(/^hi$/) || msg.match(/^hey$/)) {
      reply = authenticated 
        ? `Hello! 👋 I'm here to help with questions about AURA FX. What would you like to know?`
        : `Hello! Welcome to AURA FX! 👋 I can answer questions about our platform. <a href="/register" style="color: #1E90FF; text-decoration: underline;">Sign up</a> or <a href="/login" style="color: #1E90FF; text-decoration: underline;">log in</a> to access full features!`;
    }
    // Platform info
    else if (msg.includes('what') && (msg.includes('aura') || msg.includes('platform') || msg.includes('website'))) {
      reply = 'AURA FX is a professional trading education platform. We teach Forex, Stocks, Crypto, and Options trading with expert strategies and 1-to-1 mentorship.';
    }
    // Trading education (general)
    else if (msg.includes('trade') || msg.includes('trading') || msg.includes('forex') || msg.includes('crypto') || msg.includes('stock')) {
      reply = 'AURA FX specializes in trading education. We offer courses in Forex, Stocks, Crypto, and Options trading. Visit our <a href="/courses" style="color: #1E90FF; text-decoration: underline;">Courses page</a> to learn more.';
    }
    // Courses
    else if (msg.includes('course') || msg.includes('learn') || msg.includes('mentorship')) {
      reply = 'We offer 1-to-1 trading mentorship. Visit our <a href="/courses" style="color: #1E90FF; text-decoration: underline;">Courses page</a> to see details.';
    }
    // Pricing
    else if (msg.includes('price') || msg.includes('cost') || msg.includes('subscription')) {
      reply = 'We offer Aura FX subscription at £99/month and A7FX Elite at £250/month. Visit our <a href="/subscription" style="color: #1E90FF; text-decoration: underline;">Subscription page</a> for details.';
    }
    // Sign up/Login
    else if (msg.includes('sign up') || msg.includes('register') || msg.includes('create account') || msg.includes('join')) {
      reply = 'Great! You can <a href="/register" style="color: #1E90FF; text-decoration: underline;">sign up here</a> to access our trading courses and mentorship.';
    }
    // Contact
    else if (msg.includes('contact') || msg.includes('support') || msg.includes('help')) {
      reply = 'You can <a href="/contact" style="color: #1E90FF; text-decoration: underline;">contact our support team</a> for assistance.';
    }
    // Community
    else if (msg.includes('community') || msg.includes('forum') || msg.includes('chat')) {
      reply = 'Our trading community is where traders connect and share strategies. Access it through the Community section. Subscription required for full access.';
    }
    // Default response
    else {
      reply = authenticated
        ? 'I can help with questions about AURA FX, our courses, and the platform. For detailed trading analysis, use <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline;">Aura AI</a> (Premium feature). What would you like to know?'
        : 'I can help with questions about trading and the AURA FX platform. For personalized assistance, please <a href="/register" style="color: #1E90FF; text-decoration: underline;">sign up</a> or <a href="/login" style="color: #1E90FF; text-decoration: underline;">log in</a>!';
    }

    return res.status(200).json({
      success: true,
      reply: reply
    });

  } catch (error) {
    console.error('Chatbot API error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred processing your request. Please try again.'
    });
  }
};
