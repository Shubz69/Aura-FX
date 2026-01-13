import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
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

    const hasAccess = 
      userRole === 'premium' || 
      userRole === 'a7fx' || 
      userRole === 'admin' || 
      userRole === 'super_admin' ||
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
      content: `👋 Welcome to your Premium AI Trading Assistant, ${user?.username || user?.name || 'there'}!

I'm your advanced trading AI powered by GPT-4. I can help you with:

📈 **Trading Analysis** - Technical analysis, chart patterns, indicators
💡 **Trading Strategies** - Scalping, swing trading, day trading strategies  
🎯 **Risk Management** - Position sizing, stop losses, risk-reward ratios
📊 **Market Insights** - Market psychology, trading mindset, discipline
🔧 **Platform Help** - Navigate AURA FX courses and features

I can also answer general questions, but my specialty is trading knowledge. Ask me anything!`
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
        throw new Error(data.message || data.error || `Server error (${response.status})`);
      }

      if (data.success) {
        const aiMessage = {
          role: 'assistant',
          content: data.response
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
      if (error.message) {
        // If error message is too long or contains HTML, use a generic message
        if (error.message.length > 100 || error.message.includes('<')) {
          errorMessage = 'Server error. Please try again or contact support.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage, {
        position: 'bottom-right',
        autoClose: 3000,
      });

      // Add error message to chat
      const chatErrorMessage = {
        role: 'assistant',
        content: `⚠️ I encountered an error: ${errorMessage}. Please try again or contact support if the issue persists.`
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
        content: `👋 Conversation cleared! How can I help you with your trading today?`
      };
      setMessages([welcomeMessage]);
      setConversationHistory([welcomeMessage]);
    }
  };

  return (
    <div className="premium-ai-container">
      <div className="premium-ai-header">
        <div className="premium-ai-title">
          <h1>🤖 Premium AI Trading Assistant</h1>
          <p>Powered by GPT-4 • Advanced Trading Knowledge</p>
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
                  {msg.content.split('\n').map((line, i) => (
                    <React.Fragment key={i}>
                      {line}
                      {i < msg.content.split('\n').length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </div>
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
            placeholder="Ask me anything about trading, strategies, analysis, or AURA FX..."
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
          💡 <strong>Tip:</strong> Ask me about technical analysis, trading strategies, risk management, or any trading-related questions.
        </p>
        <p className="subscription-info">
          {user?.role === 'a7fx' ? '✨ A7FX Elite Member' : '⭐ Premium Member'}
        </p>
      </div>
    </div>
  );
};

export default PremiumAI;
