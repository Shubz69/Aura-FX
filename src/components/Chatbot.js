import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { isPremium } from "../utils/roles";
import "../styles/Chatbot.css";

const Chatbot = () => {
    const { isAuthenticated, user } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [showOptions, setShowOptions] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [connectError, setConnectError] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            const welcomeMessage = isAuthenticated 
                ? `<p>Welcome back, ${user?.username || user?.name || 'there'}! I'm your AURA FX assistant. I can help with general questions about our platform, courses, and subscriptions.</p><p>💡 <strong>Upgrade to Premium</strong> to unlock <a href="/premium-ai" style="color: #ffffff; text-decoration: underline; font-weight: 500;">Aura AI</a> - our advanced AI assistant that provides professional trading analysis, market insights, and personalized trading strategies.</p><p>Choose a question below or ask me anything!</p>`
                : "<p>Welcome to <strong>AURA FX</strong>! I'm your free assistant. I can help with questions about our platform, courses, and subscriptions.</p><p>💡 <strong>Upgrade to Premium</strong> to unlock <a href=\"/premium-ai\" style=\"color: #ffffff; text-decoration: underline; font-weight: 500;\">Aura AI</a> - our advanced AI assistant for professional trading analysis and strategies.</p><p><a href='/register' style='color: #ffffff; text-decoration: underline;'>Sign up</a> or <a href='/login' style='color: #ffffff; text-decoration: underline;'>log in</a> to get started!</p><p>Choose a question below or ask me anything!</p>";
            
            setMessages([
                {
                    from: "bot",
                    text: welcomeMessage,
                },
            ]);
            setShowOptions(true);
        }
    }, [isOpen, isAuthenticated, user]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Hide chatbot for premium users - they should use Aura AI instead (after all hooks)
    if (isPremium(user)) {
        return null;
    }

    const toggleChat = () => {
        setIsOpen(!isOpen);
        
        // Reset connection error when reopening
        if (!isOpen) {
            setConnectError(false);
        }
    };

    const sendMessage = async (message) => {
        const updatedMessages = [...messages, { from: "user", text: message }];
        setMessages(updatedMessages);
        setInput("");
        setShowOptions(false);
        setIsLoading(true);

        try {
            // Try to use the live API first
            const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
                ? window.location.origin
                : (process.env.REACT_APP_API_URL || '');
            const token = localStorage.getItem('token');
            
            // Prepare headers - include auth token if user is logged in
            const headers = {
                "Content-Type": "application/json",
                "Accept": "application/json"
            };
            
            // Add auth token if user is logged in
            if (isAuthenticated && token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
            
            // Prepare request body with user context
            const requestBody = {
                message,
                authenticated: isAuthenticated,
                userId: user?.id || null,
                userEmail: user?.email || null
            };
            
            const res = await fetch(`${API_BASE_URL}/api/chatbot`, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(requestBody),
            });

            let replyText = "⚠️ The chatbot encountered an error. Please try again later.";
            let shouldRedirect = false;
            let redirectPath = null;
            
            if (res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    replyText = data.reply || data.message || data.response || "I received your message but couldn't generate a proper response.";
                    
                    // Check if response indicates a redirect is needed
                    if (data.redirectTo) {
                        shouldRedirect = true;
                        redirectPath = data.redirectTo;
                    }
                } else {
                    replyText = await res.text();
                }
                setConnectError(false);
            } else {
                if (res.status === 404) {
                    replyText = "⚠️ The chatbot service is currently unavailable. I'll use simulated responses instead.";
                    setConnectError(true);
                    // Provide a simulated response based on the message
                    setTimeout(() => {
                        const simulatedResponse = getSimulatedResponse(message);
                        setMessages(prev => [...prev, { from: "bot", text: simulatedResponse }]);
                    }, 1000);
                    setIsLoading(false);
                    return;
                }
            }

            setMessages((prev) => [...prev, { from: "bot", text: replyText }]);
            
            // Handle redirect if needed (after showing message)
            if (shouldRedirect && redirectPath) {
                setTimeout(() => {
                    navigate(redirectPath);
                }, 2000); // Give user time to read the message
            }
        } catch (err) {
            console.error("Chatbot API error:", err);
            setConnectError(true);
            const simulatedResponse = getSimulatedResponse(message);
            setMessages((prev) => [
                ...prev,
                { from: "bot", text: simulatedResponse }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    // Improved fallback function with authentication-aware responses
    const getSimulatedResponse = (message) => {
        const msg = message.toLowerCase();
        
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
            const userRole = user?.role || 'free';
            const subscriptionStatus = user?.subscription_status || 'inactive';
            const subscriptionPlan = user?.subscription_plan;
            
            const hasPremiumAccess = 
                userRole === 'premium' || 
                userRole === 'a7fx' || 
                userRole === 'elite' ||
                userRole === 'admin' ||
                userRole === 'super_admin' ||
                (subscriptionStatus === 'active' && 
                 (subscriptionPlan === 'aura' || subscriptionPlan === 'a7fx'));

            if (hasPremiumAccess) {
                // Redirect to Aura AI after showing message
                setTimeout(() => {
                    navigate('/premium-ai');
                }, 2000);
                return `For detailed financial analysis and trading strategies, please use <a href="/premium-ai" onclick="event.preventDefault(); window.location.href='/premium-ai';" style="color: #ffffff; text-decoration: underline; font-weight: 500;">Aura AI</a>. Aura AI provides professional technical analysis, risk assessments, and trading recommendations tailored to your needs. Redirecting you now...`;
            } else {
                // Redirect to subscription page after showing message
                setTimeout(() => {
                    navigate('/subscription');
                }, 2000);
                return `For detailed financial analysis and trading strategies, you'll need access to <a href="/premium-ai" style="color: #ffffff; text-decoration: underline; font-weight: 500;">Aura AI</a>. Aura AI is available with a Premium subscription. <a href="/subscription" onclick="event.preventDefault(); window.location.href='/subscription';" style="color: #ffffff; text-decoration: underline; font-weight: 500;">Subscribe now</a> to unlock professional trading analysis and insights. Redirecting you to subscription page...`;
            }
        }
        
        // If not logged in, only answer simple trading questions
        if (!isAuthenticated) {
            // Greetings
            if (msg.includes("hello") || msg.includes("hi ") || msg.includes("hey") || msg.match(/^hi$/) || msg.match(/^hey$/)) {
                return "Hello! Welcome to AURA FX! 👋 I can answer questions about trading and our platform. <a href='/register' style='color: #ffffff; text-decoration: underline;'>Sign up</a> or <a href='/login' style='color: #ffffff; text-decoration: underline;'>log in</a> to access full features!";
            }
            
            // Simple platform info
            if (msg.includes("what") && (msg.includes("aura") || msg.includes("platform") || msg.includes("website"))) {
                return "AURA FX is a professional trading education platform. We teach Forex, Stocks, Crypto, and Options trading with expert strategies and 1-to-1 mentorship. <a href='/register' style='color: #ffffff; text-decoration: underline;'>Sign up</a> to access our courses!";
            }
            
            // Trading questions
            if (msg.includes("trade") || msg.includes("trading") || msg.includes("forex") || msg.includes("crypto") || msg.includes("stock")) {
                return "AURA FX specializes in trading education. We offer courses in Forex, Stocks, Crypto, and Options trading. Visit our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>Courses page</a> to learn more. <a href='/register' style='color: #ffffff; text-decoration: underline;'>Sign up</a> to get started!";
            }
            
            // Courses info
            if (msg.includes("course") || msg.includes("learn")) {
                return "We offer 1-to-1 trading mentorship. Visit our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>Courses page</a> to see details. <a href='/register' style='color: #ffffff; text-decoration: underline;'>Sign up</a> to enroll!";
            }
            
            // Pricing
            if (msg.includes("price") || msg.includes("cost") || msg.includes("subscription")) {
                return "We offer Aura FX subscription at £99/month and A7FX Elite at £250/month. Visit our <a href='/subscription' style='color: #ffffff; text-decoration: underline;'>Subscription page</a> for details. <a href='/register' style='color: #ffffff; text-decoration: underline;'>Create an account</a> to get started!";
            }
            
            // Sign up/Login
            if (msg.includes("sign up") || msg.includes("register") || msg.includes("create account") || msg.includes("join")) {
                return "Great! You can <a href='/register' style='color: #ffffff; text-decoration: underline;'>sign up here</a> to access our trading courses and mentorship. It only takes a minute!";
            }
            
            // Contact
            if (msg.includes("contact") || msg.includes("support") || msg.includes("help")) {
                return "You can <a href='/contact' style='color: #ffffff; text-decoration: underline;'>contact our support team</a> or <a href='/register' style='color: #ffffff; text-decoration: underline;'>sign up</a> for full access!";
            }
            
            // Default for non-logged in users
            return "I can help with questions about trading and the AURA FX platform. For personalized assistance, please <a href='/register' style='color: #ffffff; text-decoration: underline;'>sign up</a> or <a href='/login' style='color: #ffffff; text-decoration: underline;'>log in</a>!";
        }
        
        // If logged in, provide trading-focused responses
        // Greetings
        if (msg.includes("hello") || msg.includes("hi ") || msg.includes("hey") || msg.match(/^hi$/) || msg.match(/^hey$/)) {
            return `Hello ${user?.username || user?.name || 'there'}! 👋 I'm the AURA FX trading assistant. I can help you with questions about trading, our courses, and the platform. What would you like to know?`;
        }
        
        // Trading questions - PRIMARY FOCUS
        if (msg.includes("trade") || msg.includes("trading") || msg.includes("forex") || msg.includes("crypto") || msg.includes("stock") || msg.includes("option") || msg.includes("market") || msg.includes("chart") || msg.includes("strategy") || msg.includes("signal")) {
            if (msg.includes("forex")) {
                return "Forex trading involves trading currency pairs. AURA FX teaches technical analysis, risk management, and proven strategies for Forex trading. Check our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>courses</a> for detailed lessons.";
            }
            if (msg.includes("crypto")) {
                return "Cryptocurrency trading requires understanding market volatility and technical indicators. Our 1-to-1 mentorship covers crypto trading strategies. Visit our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>courses</a> page.";
            }
            if (msg.includes("stock")) {
                return "Stock trading involves buying and selling shares. AURA FX provides education on fundamental and technical analysis for stocks. Check our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>courses</a>.";
            }
            if (msg.includes("beginner") || msg.includes("start") || msg.includes("learn")) {
                return "For beginners, we recommend starting with our 1-to-1 mentorship program. It provides personalized guidance tailored to your experience level. Visit our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>courses</a> page to learn more.";
            }
            return "AURA FX specializes in trading education covering Forex, Stocks, Crypto, and Options. Our 1-to-1 mentorship provides personalized trading guidance. Check our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>courses</a> for details.";
        }
        
        // Course related queries
        if (msg.includes("course") || msg.includes("learn") || msg.includes("study") || msg.includes("tutorial") || msg.includes("mentorship")) {
            return "AURA FX offers 1-to-1 trading mentorship. This personalized program provides expert guidance tailored to your trading goals. Visit our <a href='/courses' style='color: #ffffff; text-decoration: underline;'>Courses page</a> to learn more.";
        }
        
        // Pricing related queries
        if (msg.includes("price") || msg.includes("cost") || msg.includes("subscription") || msg.includes("pay") || msg.includes("fee")) {
            return "AURA FX offers two subscription plans: Aura FX at £99/month and A7FX Elite at £250/month. Visit our <a href='/subscription' style='color: #ffffff; text-decoration: underline;'>Subscription page</a> for full details.";
        }
        
        // Platform features
        if (msg.includes("feature") || msg.includes("tool") || msg.includes("function") || msg.includes("what") || msg.includes("about")) {
            return "AURA FX is a professional trading education platform. We offer 1-to-1 mentorship, trading courses, community access, and expert strategies for Forex, Stocks, Crypto, and Options trading.";
        }
        
        // Community related
        if (msg.includes("community") || msg.includes("forum") || msg.includes("chat") || msg.includes("discuss")) {
            return "Our trading community is where traders connect, share strategies, and discuss markets. Access it through the Community section. Subscription required for full access.";
        }
        
        // Technical support
        if (msg.includes("help") || msg.includes("support") || msg.includes("problem") || msg.includes("issue") || msg.includes("error")) {
            return "I'm here to help with trading questions! For technical issues, <a href='/contact' style='color: #ffffff; text-decoration: underline;'>contact our support team</a>. For trading questions, feel free to ask me!";
        }
        
        // Account and payment issues
        if (msg.includes("account") || msg.includes("password") || msg.includes("login") || msg.includes("payment") || msg.includes("billing") || msg.includes("refund")) {
            return "For account or payment questions, visit our <a href='/contact' style='color: #ffffff; text-decoration: underline;'>Contact page</a>. Our team will assist you within 24 hours.";
        }
        
        // Personal questions
        if (msg.includes("my") && (msg.includes("course") || msg.includes("progress") || msg.includes("level") || msg.includes("xp"))) {
            return `Check your <a href='/my-courses' style='color: #ffffff; text-decoration: underline;'>My Courses</a> page for your progress. Your profile shows your level and XP.`;
        }
        
        // Default response - recommend premium AI for advanced questions
        return "I can help with general questions about AURA FX, our courses, and subscriptions. For advanced trading analysis, market insights, and personalized strategies, <a href='/subscription' style='color: #ffffff; text-decoration: underline; font-weight: 500;'>upgrade to Premium</a> to access <a href='/premium-ai' style='color: #ffffff; text-decoration: underline; font-weight: 500;'>Aura AI</a> - our professional AI trading assistant. What would you like to know?";
    };

    const handleOption = (message) => {
        sendMessage(message);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim()) {
            sendMessage(input);
        }
    };

    const groupedOptions = {
        "Trading Education": [
            "What trading strategies do you teach?",
            "How do I get started with Forex trading?",
            "What's the difference between Forex and Crypto trading?",
            "Do you teach stock trading?",
            "What is options trading?",
        ],
        "Courses & Mentorship": [
            "What is the 1-to-1 mentorship program?",
            "How does the mentorship work?",
            "What will I learn in the mentorship?",
            "Is the mentorship personalized?",
            "How long is the mentorship program?",
        ],
        "Subscriptions": [
            "What's included in the Aura FX subscription?",
            "What's the difference between Aura FX and A7FX?",
            "How much does A7FX Elite cost?",
            "Can I cancel my subscription anytime?",
            "What payment methods are accepted?",
        ],
        "Platform & Support": [
            "What is AURA FX?",
            "How do I access the trading community?",
            "How do I contact support?",
            "What trading markets do you cover?",
            "How do I upgrade to Premium?",
        ]
    };

    return (
        <div className="chatbot-container">
            <button className="chatbot-toggle" onClick={toggleChat} aria-label="Open chat assistant">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z" fill="currentColor"/>
                    <path d="M7 9H17V11H7V9ZM7 12H15V14H7V12Z" fill="currentColor"/>
                </svg>
            </button>
            {isOpen && (
                <div className="chatbot-window">
                    <div className="chatbot-header">
                        <div className="chatbot-header-content">
                            <div className="chatbot-header-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
                                    <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z" fill="currentColor"/>
                                </svg>
                                <span>AURA FX Assistant</span>
                            </div>
                            {connectError && <span className="offline-indicator">Offline Mode</span>}
                        </div>
                        <button className="chatbot-close" onClick={toggleChat} aria-label="Close chat">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>
                    <div className="chatbot-messages">
                        {messages.map((msg, i) => (
                            <div 
                                key={i} 
                                className={`message ${msg.from}`}
                                dangerouslySetInnerHTML={{ __html: msg.text }}
                            />
                        ))}

                        {showOptions && (
                            <div className="message bot chatbot-options-container">
                                {Object.entries(groupedOptions).map(([group, questions]) => (
                                    <div key={group} className="chatbot-option-group">
                                        <strong className="chatbot-group-title">{group}</strong>
                                        <div className="chatbot-questions-list">
                                            {questions.map((q, i) => (
                                                <div
                                                    key={i}
                                                    className="chatbot-option"
                                                    onClick={() => handleOption(q)}
                                                >
                                                    {q}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {isLoading && (
                            <div className="message bot">
                                <div className="typing-indicator">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <form className="chatbot-input" onSubmit={handleSubmit}>
                        <input
                            type="text"
                            value={input}
                            placeholder="Ask about our platform, courses, or subscriptions..."
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <button type="submit" aria-label="Send message">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Chatbot;
