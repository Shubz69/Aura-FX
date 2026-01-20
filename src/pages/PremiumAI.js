import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ReactMarkdown from 'react-markdown';
import MarketChart from '../components/MarketChart';
import '../styles/PremiumAI.css';

const PremiumAI = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Check if user has premium access
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const userRole = user?.role || 'free';
    const subscriptionStatus = user?.subscription_status || 'inactive';
    const subscriptionPlan = user?.subscription_plan;
    const userEmail = user?.email || '';
    
    // Check if user is super admin by email
    const SUPER_ADMIN_EMAIL = 'shubzfx@gmail.com';
    const isSuperAdminByEmail = userEmail.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    const hasAccess = 
      isSuperAdminByEmail ||
      userRole === 'premium' || 
      userRole === 'a7fx' || 
      userRole === 'elite' || 
      userRole === 'admin' || 
      userRole === 'super_admin' ||
      userRole === 'SUPER_ADMIN' ||
      (subscriptionStatus === 'active' && (subscriptionPlan === 'aura' || subscriptionPlan === 'a7fx'));

    if (!hasAccess) {
      toast.error('Premium subscription required to access AI Assistant', {
        position: 'top-center',
        autoClose: 3000,
      });
      navigate('/subscription');
      return;
    }

    // Initialize with welcome message
    const welcomeMessage = {
      role: 'assistant',
      content: `Welcome to AURA AI, ${user?.username || user?.name || 'Trader'}.

I'm your intelligent trading assistant with real-time access to ALL market instruments:

**I can analyze ANY trading instrument:**
• **Stocks** - AAPL, TSLA, MSFT, SPY, QQQ, and all major stocks
• **Forex** - EURUSD, GBPUSD, USDJPY, and all currency pairs
• **Crypto** - BTCUSD, ETHUSD, and all cryptocurrencies
• **Commodities** - Gold (XAUUSD), Silver, Oil, and all commodities
• **Indices** - SPX, NASDAQ, Dow Jones, FTSE, DAX, and all indices
• **Bonds** - Government and corporate bonds

I provide real-time prices, analyze market data from multiple sources, fetch breaking news, check economic calendars, and give you actionable trading insights. Just ask me about any instrument!

How can I help you trade today?`
    };

    setMessages([welcomeMessage]);
    setConversationHistory([welcomeMessage]);
  }, [isAuthenticated, user, navigate]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (e) => {
    e?.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input.trim()
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setConversationHistory(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;

      const response = await fetch(`${API_BASE_URL}/api/ai/premium-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: conversationHistory.slice(-10) // Last 10 messages for context
        })
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // If not JSON, read as text to get error message
        const text = await response.text();
        throw new Error(text || `Server error (${response.status})`);
      }

      if (!response.ok) {
        // Handle rate limit errors specifically
        if (response.status === 429 || (data && data.errorType === 'rate_limit')) {
          const rateLimitMessage = data?.message || 'AI service is currently at capacity. Please try again in a few moments.';
          throw new Error(rateLimitMessage);
        }
        throw new Error(data.message || data.error || `Server error (${response.status})`);
      }

      if (data.success) {
        const aiMessage = {
          role: 'assistant',
          content: data.response,
          chartData: data.chartData || null, // Chart data if provided
          symbol: data.symbol || null // Symbol for chart
        };

        setMessages(prev => [...prev, aiMessage]);
        setConversationHistory(prev => [...prev, aiMessage]);
      } else {
        throw new Error(data.message || 'AI service error');
      }

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Extract a clean error message
      let errorMessage = 'Failed to send message. Please try again.';
      let isRateLimit = false;
      
      if (error.message) {
        // Check if it's a quota error (more specific - requires admin action)
        if (error.message.toLowerCase().includes('quota') || 
            error.message.toLowerCase().includes('exceeded your current quota') ||
            error.message.toLowerCase().includes('insufficient_quota')) {
          isRateLimit = true;
          errorMessage = 'AI service quota has been exceeded. The administrator needs to add credits to the OpenAI account. Please contact support for assistance.';
        }
        // Check if it's a rate limit error (temporary)
        else if (error.message.toLowerCase().includes('capacity') || 
                 error.message.toLowerCase().includes('rate limit') ||
                 error.message.toLowerCase().includes('try again in a few moments')) {
          isRateLimit = true;
          errorMessage = 'AI service is currently at capacity. Please try again in a few moments. If this issue persists, please contact support.';
        } else if (error.message.length > 150 || error.message.includes('<')) {
          errorMessage = 'Server error. Please try again or contact support.';
        } else {
          errorMessage = error.message;
        }
      }
      
      // Also check error response data for quota errors
      if (error.response?.data?.errorType === 'quota_exceeded') {
        isRateLimit = true;
        errorMessage = 'AI service quota has been exceeded. The administrator needs to add credits to the OpenAI account. Please contact support for assistance.';
      }
      
      // Show toast notification (longer for quota errors)
      const isQuotaError = errorMessage.toLowerCase().includes('quota');
      toast.error(errorMessage, {
        position: 'bottom-right',
        autoClose: isQuotaError ? 8000 : (isRateLimit ? 5000 : 3000),
      });

      // Add user-friendly error message to chat
      const chatErrorMessage = {
        role: 'assistant',
        content: isQuotaError
          ? 'I apologize, but the AI service quota has been exceeded. The administrator needs to add credits to the OpenAI account. Please contact support for assistance.'
          : isRateLimit 
            ? 'I apologize, but the AI service is currently experiencing high demand. Please try again in a few moments. If this issue continues, please contact support for assistance.'
            : `I encountered an error processing your request: ${errorMessage}. Please try again or contact support if the issue persists.`
      };
      setMessages(prev => [...prev, chatErrorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const clearConversation = () => {
    if (window.confirm('Are you sure you want to clear this conversation?')) {
      const welcomeMessage = {
        role: 'assistant',
        content: `Conversation cleared. Ready for your next analysis request.`
      };
      setMessages([welcomeMessage]);
      setConversationHistory([welcomeMessage]);
    }
  };

  return (
    <div className="premium-ai-container">
      <div className="premium-ai-header">
        <div className="premium-ai-title">
          <h1>📊 AURA AI Financial Analyst</h1>
          <p>Professional Trading Intelligence & Market Analysis</p>
        </div>
        <button 
          className="clear-conversation-btn"
          onClick={clearConversation}
          title="Clear conversation"
        >
          🗑️ Clear
        </button>
      </div>

      <div className="premium-ai-chat">
        <div className="messages-container">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                <div className="message-text">
                  <ReactMarkdown
                    components={{
                      p: ({node, ...props}) => <p className="markdown-paragraph" {...props} />,
                      strong: ({node, ...props}) => <strong className="markdown-bold" {...props} />,
                      em: ({node, ...props}) => <em className="markdown-italic" {...props} />,
                      ul: ({node, ...props}) => <ul className="markdown-list" {...props} />,
                      ol: ({node, ...props}) => <ol className="markdown-list" {...props} />,
                      li: ({node, ...props}) => <li className="markdown-list-item" {...props} />,
                      h1: ({node, ...props}) => <h1 className="markdown-heading markdown-h1" {...props} />,
                      h2: ({node, ...props}) => <h2 className="markdown-heading markdown-h2" {...props} />,
                      h3: ({node, ...props}) => <h3 className="markdown-heading markdown-h3" {...props} />,
                      code: ({node, inline, ...props}) => 
                        inline ? <code className="markdown-inline-code" {...props} /> : <code className="markdown-code-block" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="markdown-blockquote" {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                {msg.chartData && msg.symbol && (
                  <MarketChart data={msg.chartData} symbol={msg.symbol} type="line" />
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message ai-message">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <form className="input-container" onSubmit={sendMessage}>
          <textarea
            ref={inputRef}
            className="message-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Request market analysis, trading strategies, risk assessment, or technical analysis..."
            rows="1"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? '⏳' : '📤'}
          </button>
        </form>
      </div>

      <div className="premium-ai-footer">
        <p>
          💡 <strong>Note:</strong> Request technical analysis, trading strategies, risk assessments, or market insights for professional trading decisions.
        </p>
        <p className="subscription-info">
          {user?.role === 'a7fx' || user?.role === 'elite' ? '✨ A7FX Elite Member' : '⭐ Premium Member'}
        </p>
      </div>
    </div>
  );
};

export default PremiumAI;
