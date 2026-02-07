import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ReactMarkdown from 'react-markdown';
import '../styles/PremiumAI.css';

// Icons as inline SVG components for better performance
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
);

const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const SpeakerIcon = ({ muted }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    {!muted && <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>}
    {muted && <line x1="23" y1="9" x2="17" y2="15"></line>}
    {muted && <line x1="17" y1="9" x2="23" y2="15"></line>}
  </svg>
);

const ChevronIcon = ({ up }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"></rect>
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

// Quick action chips
const QUICK_ACTIONS = [
  { label: '📈 Gold drivers today', prompt: 'What are the main drivers for gold (XAUUSD) today? Include key levels and market sentiment.' },
  { label: '📊 Analyse chart', prompt: 'Please analyse this chart and provide key observations, support/resistance levels, and potential trade setups.' },
  { label: '💰 Position sizing', prompt: 'Help me calculate proper position size for a trade. I need to know the risk/reward.' },
  { label: '📰 News impact', prompt: 'What major news or economic events are affecting markets today? How should I position?' },
  { label: '🎯 Entry/Exit levels', prompt: 'What are the key entry and exit levels I should watch for?' },
  { label: '⚡ Quick analysis', prompt: 'Give me a quick market overview with actionable insights.' }
];

// Main Component
const PremiumAI = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sources, setSources] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [showSources, setShowSources] = useState(false);
  
  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  
  // Copy state
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  
  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const abortControllerRef = useRef(null);
  const handleSendMessageRef = useRef(null);
  
  // Load conversation from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('aura_ai_conversation_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch (e) {
      console.error('Error loading conversation:', e);
    }
  }, []);
  
  // Check premium access
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    const userRole = user?.role || 'free';
    const subscriptionStatus = user?.subscription_status || 'inactive';
    const subscriptionPlan = user?.subscription_plan;
    const userEmail = user?.email || '';
    const SUPER_ADMIN_EMAIL = 'shubzfx@gmail.com';
    const isSuperAdmin = userEmail.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    
    const hasAccess = isSuperAdmin ||
      ['premium', 'a7fx', 'elite', 'admin', 'super_admin', 'SUPER_ADMIN'].includes(userRole) ||
      (subscriptionStatus === 'active' && ['aura', 'a7fx'].includes(subscriptionPlan));
    
    if (!hasAccess) {
      toast.error('Premium subscription required');
      navigate('/subscription');
    }
  }, [isAuthenticated, user, navigate]);
  
  // Save conversation
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem('aura_ai_conversation_v2', JSON.stringify(messages.slice(-50))); // Keep last 50
      } catch (e) {
        console.error('Error saving conversation:', e);
      }
    }
  }, [messages]);
  
  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);
  
  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, []);
  
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);
  
  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
        
        // Auto-send on final result
        if (event.results[event.results.length - 1].isFinal) {
          setTimeout(() => {
            setIsRecording(false);
            if (transcript.trim() && handleSendMessageRef.current) {
              handleSendMessageRef.current(null, transcript.trim());
            }
          }, 500);
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          toast.error('Voice input error. Please try again.');
        }
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);
  
  // Image handling
  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        return false;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 20MB)`);
        return false;
      }
      return true;
    });
    
    const remaining = 4 - selectedImages.length;
    const toAdd = validFiles.slice(0, remaining);
    
    try {
      const base64Images = await Promise.all(toAdd.map(file => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }));
      
      setSelectedImages(prev => [...prev, ...base64Images]);
      setImagePreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))]);
    } catch (error) {
      toast.error('Failed to process images');
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };
  
  // Voice controls
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.error('Voice input not supported in this browser');
      return;
    }
    
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        toast.error('Could not start voice input');
      }
    }
  };
  
  const speakMessage = (messageId, text) => {
    if (!text) return;
    
    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (speakingMessageId === messageId) {
        setSpeakingMessageId(null);
        return;
      }
    }
    
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, '')); // Remove markdown
    utterance.rate = speechRate;
    utterance.lang = 'en-US';
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };
  
  // Copy message to clipboard
  const copyMessage = async (messageId, text) => {
    if (!text) return;
    
    try {
      // Use the Clipboard API for modern browsers
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      
      // Reset after 2 seconds
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    } catch (error) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (e) {
        console.error('Failed to copy:', e);
        toast.error('Failed to copy message');
      }
      document.body.removeChild(textarea);
    }
  };
  
  // Send message with streaming
  const handleSendMessage = async (e, overrideMessage = null) => {
    if (e) e.preventDefault();
    
    const messageText = overrideMessage || input.trim();
    if (!messageText && selectedImages.length === 0) return;
    if (isLoading || isStreaming) return;
    
    // Optimistic UI update - add user message immediately
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText,
      images: selectedImages.length > 0 ? [...selectedImages] : undefined,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedImages([]);
    setImagePreviews(prev => {
      prev.forEach(url => URL.revokeObjectURL(url));
      return [];
    });
    setIsLoading(true);
    setSources([]);
    
    // Small delay for UI feedback
    await new Promise(r => setTimeout(r, 50));
    
    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;
      
      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();
      
      const response = await fetch(`${API_BASE_URL}/api/ai/premium-chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: messageText,
          images: userMessage.images,
          conversationHistory: messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
        }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error: ${response.status}`);
      }
      
      // Start streaming
      setIsLoading(false);
      setIsStreaming(true);
      setStreamingContent('');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let streamSources = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            switch (data.type) {
              case 'token':
                fullContent += data.content;
                setStreamingContent(fullContent);
                break;
              case 'sources':
                streamSources = data.sources || [];
                setSources(streamSources);
                break;
              case 'done':
                // Final message
                const aiMessage = {
                  id: Date.now(),
                  role: 'assistant',
                  content: data.content || fullContent,
                  sources: streamSources,
                  timing: data.timing,
                  timestamp: new Date().toISOString()
                };
                setMessages(prev => [...prev, aiMessage]);
                setStreamingContent('');
                setIsStreaming(false);
                break;
              case 'error':
                throw new Error(data.message);
              default:
                break;
            }
          } catch (parseError) {
            // Skip invalid JSON
          }
        }
      }
      
    } catch (error) {
      console.error('Send error:', error);
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingContent('');
      
      if (error.name !== 'AbortError') {
        const errorMessage = {
          id: Date.now(),
          role: 'assistant',
          content: error.message?.includes('timeout') || error.message?.includes('AbortError')
            ? 'The request timed out. Please try again.'
            : error.message || 'An error occurred. Please try again.',
          isError: true,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, errorMessage]);
        toast.error(errorMessage.content);
      }
    }
    
    textareaRef.current?.focus();
  };
  handleSendMessageRef.current = handleSendMessage;
  
  // Stop streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
    
    if (streamingContent) {
      const aiMessage = {
        id: Date.now(),
        role: 'assistant',
        content: streamingContent + '\n\n*[Response stopped]*',
        sources,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);
      setStreamingContent('');
    }
  };
  
  // Clear conversation
  const clearConversation = () => {
    if (window.confirm('Clear all messages?')) {
      localStorage.removeItem('aura_ai_conversation_v2');
      setMessages([]);
      setSources([]);
    }
  };
  
  // Handle quick action
  const handleQuickAction = (prompt) => {
    if (isLoading || isStreaming) return;
    setInput(prompt);
    textareaRef.current?.focus();
  };
  
  // Keyboard handling
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Render empty state
  const renderEmptyState = () => (
    <div className="ai-empty-state">
      <div className="ai-empty-icon">✨</div>
      <h2>Welcome to AURA AI</h2>
      <p>Your premium trading intelligence assistant</p>
      
      <div className="ai-capabilities">
        <div className="capability-item">
          <span className="capability-icon">📊</span>
          <div>
            <strong>Market Analysis</strong>
            <p>Real-time insights on any instrument</p>
          </div>
        </div>
        <div className="capability-item">
          <span className="capability-icon">🎯</span>
          <div>
            <strong>Trade Setups</strong>
            <p>Entry, exit, and risk levels</p>
          </div>
        </div>
        <div className="capability-item">
          <span className="capability-icon">📈</span>
          <div>
            <strong>Chart Analysis</strong>
            <p>Upload charts for instant review</p>
          </div>
        </div>
        <div className="capability-item">
          <span className="capability-icon">💰</span>
          <div>
            <strong>Risk Management</strong>
            <p>Position sizing and R:R calculations</p>
          </div>
        </div>
      </div>
      
      <p className="ai-empty-hint">Try one of the quick actions below or type your question</p>
    </div>
  );
  
  // Render message
  const renderMessage = (msg, index) => {
    const isUser = msg.role === 'user';
    
    return (
      <div key={msg.id || index} className={`ai-message ${isUser ? 'user' : 'assistant'} ${msg.isError ? 'error' : ''}`}>
        <div className="ai-message-avatar">
          {isUser ? (
            <div className="avatar-user">👤</div>
          ) : (
            <div className="avatar-ai">✨</div>
          )}
        </div>
        
        <div className="ai-message-content">
          {msg.images?.length > 0 && (
            <div className="message-images">
              {msg.images.map((img, i) => (
                <img key={i} src={img} alt="" className="message-image" onClick={() => window.open(img, '_blank')} />
              ))}
            </div>
          )}
          
          {msg.content && (
            <div className="message-text">
              {isUser ? (
                <p>{msg.content}</p>
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="md-p">{children}</p>,
                    strong: ({ children }) => <strong className="md-bold">{children}</strong>,
                    ul: ({ children }) => <ul className="md-list">{children}</ul>,
                    ol: ({ children }) => <ol className="md-list md-ol">{children}</ol>,
                    li: ({ children }) => <li className="md-li">{children}</li>,
                    h1: ({ children }) => <h3 className="md-heading">{children}</h3>,
                    h2: ({ children }) => <h4 className="md-heading">{children}</h4>,
                    h3: ({ children }) => <h5 className="md-heading">{children}</h5>,
                    code: ({ inline, children }) => 
                      inline ? <code className="md-code">{children}</code> : <pre className="md-pre"><code>{children}</code></pre>,
                    blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          )}
          
          {/* Actions for AI messages: Copy and Voice */}
          {!isUser && msg.content && (
            <div className="message-actions">
              {/* Copy button */}
              <button
                className={`action-btn copy-btn ${copiedMessageId === msg.id ? 'copied' : ''}`}
                onClick={() => copyMessage(msg.id, msg.content)}
                title={copiedMessageId === msg.id ? 'Copied!' : 'Copy message'}
              >
                {copiedMessageId === msg.id ? <CheckIcon /> : <CopyIcon />}
              </button>
              
              {/* Voice output button */}
              <button
                className={`action-btn ${speakingMessageId === msg.id ? 'active' : ''}`}
                onClick={() => speakMessage(msg.id, msg.content)}
                title={speakingMessageId === msg.id ? 'Stop' : 'Read aloud'}
              >
                <SpeakerIcon muted={speakingMessageId === msg.id} />
              </button>
              {speakingMessageId === msg.id && (
                <select
                  className="speed-select"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  title="Playback speed"
                >
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              )}
            </div>
          )}
          
          {/* Sources collapsible */}
          {!isUser && msg.sources?.length > 0 && (
            <div className="message-sources">
              <button className="sources-toggle" onClick={() => setShowSources(!showSources)}>
                <span>📊 Sources ({msg.sources.length})</span>
                <ChevronIcon up={showSources} />
              </button>
              {showSources && (
                <div className="sources-list">
                  {msg.sources.map((src, i) => (
                    <div key={i} className="source-item">
                      {src.type === 'market' && `📈 ${src.symbol} market data`}
                      {src.type === 'news' && '📰 Market news'}
                      {src.cached && <span className="cached-badge">cached</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="premium-ai-page">
      {/* Header */}
      <header className="ai-header">
        <div className="ai-header-content">
          <h1>
            <span className="ai-logo">✨</span>
            AURA AI
          </h1>
          <span className="ai-badge">
            {user?.role === 'a7fx' || user?.role === 'elite' ? 'Elite' : 'Premium'}
          </span>
        </div>
        <button className="clear-btn" onClick={clearConversation} title="Clear conversation">
          <TrashIcon />
        </button>
      </header>
      
      {/* Chat area */}
      <main className="ai-chat-area">
        <div className="ai-messages-container">
          {messages.length === 0 && !isLoading && !isStreaming ? (
            renderEmptyState()
          ) : (
            <>
              {messages.map(renderMessage)}
              
              {/* Streaming message */}
              {isStreaming && streamingContent && (
                <div className="ai-message assistant streaming">
                  <div className="ai-message-avatar">
                    <div className="avatar-ai">✨</div>
                  </div>
                  <div className="ai-message-content">
                    <div className="message-text">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="md-p">{children}</p>,
                          strong: ({ children }) => <strong className="md-bold">{children}</strong>,
                          ul: ({ children }) => <ul className="md-list">{children}</ul>,
                          ol: ({ children }) => <ol className="md-list md-ol">{children}</ol>,
                          li: ({ children }) => <li className="md-li">{children}</li>,
                          h1: ({ children }) => <h3 className="md-heading">{children}</h3>,
                          h2: ({ children }) => <h4 className="md-heading">{children}</h4>,
                          h3: ({ children }) => <h5 className="md-heading">{children}</h5>,
                          code: ({ inline, children }) =>
                            inline ? <code className="md-code">{children}</code> : <pre className="md-pre"><code>{children}</code></pre>,
                          blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>
                        }}
                      >
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                    <div className="streaming-indicator">
                      <span className="pulse"></span>
                      Generating...
                    </div>
                  </div>
                </div>
              )}
              
              {/* Loading indicator */}
              {isLoading && !isStreaming && (
                <div className="ai-message assistant loading">
                  <div className="ai-message-avatar">
                    <div className="avatar-ai">✨</div>
                  </div>
                  <div className="ai-message-content">
                    <div className="typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>
      
      {/* Sources panel */}
      {sources.length > 0 && !isStreaming && (
        <div className="sources-panel">
          <button className="sources-panel-toggle" onClick={() => setShowSources(!showSources)}>
            <span>📊 Data sources used ({sources.length})</span>
            <ChevronIcon up={showSources} />
          </button>
        </div>
      )}
      
      {/* Quick actions */}
      {messages.length === 0 && (
        <div className="quick-actions-container">
          <div className="quick-actions">
            {QUICK_ACTIONS.map((action, i) => (
              <button
                key={i}
                className="quick-action-chip"
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isLoading || isStreaming}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Composer */}
      <footer className="ai-composer">
        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="image-preview-strip">
            {imagePreviews.map((preview, i) => (
              <div key={i} className="preview-thumb">
                <img src={preview} alt="" />
                <button className="remove-preview" onClick={() => removeImage(i)}>×</button>
              </div>
            ))}
          </div>
        )}
        
        <div className="composer-inner">
          <div className="composer-actions-left">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            <button
              className="composer-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isStreaming || selectedImages.length >= 4}
              title="Upload image"
            >
              <ImageIcon />
            </button>
            <button
              className={`composer-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={isLoading || isStreaming}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              <MicIcon />
            </button>
          </div>
          
          <div className="composer-input-wrapper">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? 'Listening...' : 'Ask AURA anything about trading...'}
              disabled={isLoading}
              rows={1}
              className={isRecording ? 'recording' : ''}
            />
          </div>
          
          <div className="composer-actions-right">
            {isStreaming ? (
              <button className="composer-btn stop-btn" onClick={handleStopStreaming} title="Stop generating">
                <StopIcon />
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={handleSendMessage}
                disabled={isLoading || (!input.trim() && selectedImages.length === 0)}
                title="Send message"
              >
                <SendIcon />
              </button>
            )}
          </div>
        </div>
        
        <p className="composer-hint">
          Press Enter to send, Shift+Enter for new line
        </p>
      </footer>
    </div>
  );
};

export default PremiumAI;
