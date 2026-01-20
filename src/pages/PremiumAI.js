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
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

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

I'm the ULTIMATE financial intelligence system - the most comprehensive trading AI in existence.

**I can analyze EVERY financial instrument:**
• **Stocks** - Every stock on every exchange (AAPL, TSLA, MSFT, and thousands more)
• **Forex** - All currency pairs (Major, Minor, Exotic - EURUSD, GBPUSD, USDJPY, USDZAR, etc.)
• **Crypto** - All cryptocurrencies (BTC, ETH, SOL, ADA, XRP, and hundreds more)
• **Commodities** - Precious metals, energy, agricultural, base metals (Gold, Oil, Wheat, Copper, etc.)
• **Indices** - All major indices (S&P 500, Dow, NASDAQ, FTSE, DAX, Nikkei, and more)
• **Futures** - All futures contracts (Commodity, Index, Currency futures)
• **Bonds** - Government and corporate bonds
• **ETFs** - All exchange-traded funds
• **Options** - Options chains for any underlying

**What makes me different:**
✓ Real-time data from multiple professional sources (Bloomberg-level intelligence)
✓ Actionable trading recommendations with entry/exit levels, stop losses, and profit targets
✓ Comprehensive analysis combining technical, fundamental, and sentiment data
✓ I provide TRADES, not just information - something other AIs cannot do

Just ask me about any instrument or ask for a trade setup. I'll analyze it and give you actionable recommendations!

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

  // Convert file to base64
  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // Handle image file selection
  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate files
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`);
        return false;
      }
      if (file.size > 20 * 1024 * 1024) { // 20MB limit
        toast.error(`${file.name} is too large (max 20MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Limit to 4 images max
    const remainingSlots = 4 - selectedImages.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);
    
    if (validFiles.length > remainingSlots) {
      toast.warning(`Only ${remainingSlots} image(s) can be added (max 4 total)`);
    }

    try {
      const base64Images = await Promise.all(filesToAdd.map(convertToBase64));
      setSelectedImages(prev => [...prev, ...base64Images]);
      setImagePreviews(prev => [...prev, ...filesToAdd.map(f => URL.createObjectURL(f))]);
    } catch (error) {
      console.error('Error converting images:', error);
      toast.error('Failed to process images');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove image
  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Handle paste event for images and text
  const handlePaste = async (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    if (!items || items.length === 0) return;

    // Check for images first (highest priority)
    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Handle image paste
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault(); // Prevent default paste behavior for images
        
        const blob = item.getAsFile();
        if (blob) {
          hasImage = true;
          
          // Validate image size
          if (blob.size > 20 * 1024 * 1024) {
            toast.error('Pasted image is too large (max 20MB)');
            return;
          }

          // Check if we can add more images
          if (selectedImages.length >= 4) {
            toast.warning('Maximum 4 images allowed. Please remove an image first.');
            return;
          }

          try {
            // Convert blob to File object for consistency
            const file = new File([blob], `pasted-image-${Date.now()}.png`, {
              type: blob.type || 'image/png'
            });

            // Convert to base64 and add to selected images
            const base64Image = await convertToBase64(file);
            setSelectedImages(prev => [...prev, base64Image]);
            setImagePreviews(prev => [...prev, URL.createObjectURL(file)]);
            
            toast.success('Image pasted! You can add text or send the image.');
          } catch (error) {
            console.error('Error processing pasted image:', error);
            toast.error('Failed to process pasted image');
          }
        }
        break; // Only process first image
      }
    }

    // If no image was found, allow normal text paste (default behavior)
    // Text pasting will work naturally without preventDefault
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    
    if ((!input.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input.trim() || '',
      images: selectedImages.length > 0 ? selectedImages : undefined
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setConversationHistory(prev => [...prev, userMessage]);
    
    const messageToSend = input.trim();
    const imagesToSend = selectedImages;
    
    setInput('');
    setSelectedImages([]);
    setImagePreviews(prev => {
      prev.forEach(url => URL.revokeObjectURL(url));
      return [];
    });
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
          message: messageToSend,
          images: imagesToSend,
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

  // Add paste handler to container for better coverage (when clicking on container)
  useEffect(() => {
    const handleContainerPaste = async (e) => {
      // Only handle if focus is not on textarea (textarea has its own handler)
      if (document.activeElement !== inputRef.current && document.activeElement !== fileInputRef.current) {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        const items = clipboardData.items;
        if (!items || items.length === 0) return;

        // Check for images
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const blob = item.getAsFile();
            if (blob) {
              if (blob.size > 20 * 1024 * 1024) {
                toast.error('Pasted image is too large (max 20MB)');
                return;
              }
              if (selectedImages.length >= 4) {
                toast.warning('Maximum 4 images allowed. Please remove an image first.');
                return;
              }
              try {
                const file = new File([blob], `pasted-image-${Date.now()}.png`, {
                  type: blob.type || 'image/png'
                });
                const base64Image = await convertToBase64(file);
                setSelectedImages(prev => [...prev, base64Image]);
                setImagePreviews(prev => [...prev, URL.createObjectURL(file)]);
                toast.success('Image pasted! You can add text or send the image.');
              } catch (error) {
                console.error('Error processing pasted image:', error);
                toast.error('Failed to process pasted image');
              }
            }
            break;
          }
        }
      }
    };

    const container = document.querySelector('.premium-ai-container');
    if (container) {
      container.addEventListener('paste', handleContainerPaste);
      return () => {
        container.removeEventListener('paste', handleContainerPaste);
      };
    }
  }, [selectedImages.length]);

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
                {msg.images && msg.images.length > 0 && (
                  <div className="message-images">
                    {msg.images.map((img, imgIndex) => (
                      <img 
                        key={imgIndex} 
                        src={img} 
                        alt={`Uploaded ${imgIndex + 1}`}
                        className="message-image"
                        onClick={() => window.open(img, '_blank')}
                      />
                    ))}
                  </div>
                )}
                {msg.content && (
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
                )}
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

        {imagePreviews.length > 0 && (
          <div className="image-previews">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="image-preview-item">
                <img src={preview} alt={`Preview ${index + 1}`} />
                <button 
                  type="button"
                  className="remove-image-btn"
                  onClick={() => removeImage(index)}
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <form className="input-container" onSubmit={sendMessage}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            style={{ display: 'none' }}
            disabled={isLoading}
          />
          <button
            type="button"
            className="image-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || selectedImages.length >= 4}
            title="Upload image (max 4)"
          >
            📷
          </button>
          <textarea
            ref={inputRef}
            className="message-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
            placeholder="Request market analysis, trading strategies, risk assessment, or technical analysis... (or paste/upload a chart/image)"
            rows="1"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={(!input.trim() && selectedImages.length === 0) || isLoading}
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
