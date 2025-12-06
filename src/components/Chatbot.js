import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/Chatbot.css";

const Chatbot = () => {
    const { isAuthenticated, user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [showOptions, setShowOptions] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [connectError, setConnectError] = useState(false);
    const messagesEndRef = useRef(null);

    const toggleChat = () => {
        setIsOpen(!isOpen);
        
        // Reset connection error when reopening
        if (!isOpen) {
            setConnectError(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            const welcomeMessage = isAuthenticated 
                ? `👋 Welcome back, ${user?.username || user?.name || 'there'}! I'm THE GLITCH AI assistant. I can answer any questions you have about trading, courses, your account, or anything else. Choose a question below or type your own!`
                : "👋 Welcome to <span className='glitch-brand' data-text='THE GLITCH'>THE GLITCH</span>! I can answer questions about our website. <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>Sign up</a> or <a href='/login' style='color: #8B5CF6; text-decoration: underline;'>log in</a> to unlock full chatbot capabilities and ask me anything!\nChoose a question or type your own.";
            
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
                : (process.env.REACT_APP_API_URL || 'https://theglitch.world');
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
            if (res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    replyText = data.reply || data.message || data.response || "I received your message but couldn't generate a proper response.";
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
        
        // If not logged in, only answer simple website questions
        if (!isAuthenticated) {
            // Greetings
            if (msg.includes("hello") || msg.includes("hi ") || msg.includes("hey") || msg.match(/^hi$/) || msg.match(/^hey$/)) {
                return "Hello! Welcome to THE GLITCH! 👋 I can answer questions about our website. <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>Sign up</a> or <a href='/login' style='color: #8B5CF6; text-decoration: underline;'>log in</a> to unlock full chatbot capabilities and ask me anything!";
            }
            
            // Simple website info
            if (msg.includes("what") && (msg.includes("glitch") || msg.includes("platform") || msg.includes("website"))) {
                return "THE GLITCH is a trading education platform focused on building generational wealth through 8 wealth domains: Health & Fitness, E-Commerce, Forex, Crypto, Algorithmic FX, Intelligent Systems, Social Media, and Real Estate. <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>Sign up</a> to access our courses and community!";
            }
            
            // Courses info
            if (msg.includes("course") || msg.includes("learn")) {
                return "We offer courses in 8 wealth-building domains. Visit our <a href='/courses' style='color: #8B5CF6; text-decoration: underline;'>Courses page</a> to see all available courses. <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>Sign up</a> to enroll!";
            }
            
            // Pricing
            if (msg.includes("price") || msg.includes("cost")) {
                return "Our courses range from free to premium. Visit our <a href='/courses' style='color: #8B5CF6; text-decoration: underline;'>Courses page</a> to see pricing. <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>Create an account</a> to get started!";
            }
            
            // Sign up/Login
            if (msg.includes("sign up") || msg.includes("register") || msg.includes("create account") || msg.includes("join")) {
                return "Great! You can <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>sign up here</a> to access all our courses and features. It only takes a minute!";
            }
            
            // Contact
            if (msg.includes("contact") || msg.includes("support") || msg.includes("help")) {
                return "You can <a href='/contact-us' style='color: #8B5CF6; text-decoration: underline;'>contact our support team</a> or <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>sign up</a> to access the full chatbot that can answer any question!";
            }
            
            // Default for non-logged in users
            return "I can help with basic questions about THE GLITCH website. For advanced questions and personalized assistance, please <a href='/register' style='color: #8B5CF6; text-decoration: underline;'>sign up</a> or <a href='/login' style='color: #8B5CF6; text-decoration: underline;'>log in</a> to unlock full chatbot capabilities!";
        }
        
        // If logged in, provide full responses - answer ANY question
        // Greetings
        if (msg.includes("hello") || msg.includes("hi ") || msg.includes("hey") || msg.match(/^hi$/) || msg.match(/^hey$/)) {
            return `Hello ${user?.username || user?.name || 'there'}! 👋 I'm THE GLITCH AI assistant. I can help you with any questions about trading, courses, your account, or anything else. What would you like to know?`;
        }
        
        // Course related queries
        if (msg.includes("course") || msg.includes("learn") || msg.includes("study") || msg.includes("tutorial")) {
            if (msg.includes("beginner") || msg.includes("start")) {
                return "We offer several beginner-friendly courses including 'Introduction to Trading' which is completely free! Visit our Courses page to get started.";
            }
            if (msg.includes("video")) {
                return "Yes, our courses include video tutorials, interactive lessons, quizzes, and downloadable resources.";
            }
            if (msg.includes("track") || msg.includes("progress")) {
                return "You can track your course progress in the 'My Courses' section. It shows completion percentage and which modules you've finished.";
            }
            return "We offer various trading courses from beginner to advanced levels across 8 wealth domains. Popular options include Introduction to Trading (free), Technical Analysis ($49.99), and Advanced Options Trading ($79.99).";
        }
        
        // Pricing related queries
        if (msg.includes("price") || msg.includes("cost") || msg.includes("subscription") || msg.includes("pay") || msg.includes("fee")) {
            if (msg.includes("free")) {
                return "Yes, we offer free courses including 'Introduction to Trading' and limited access to the community.";
            }
            if (msg.includes("premium")) {
                return "Premium membership costs $19.99/month and includes access to all courses, advanced features, and priority support.";
            }
            return "We have a freemium model. Basic access is free, premium features start at $19.99/month, and individual courses range from free to $79.99.";
        }
        
        // Platform features
        if (msg.includes("feature") || msg.includes("tool") || msg.includes("function")) {
            return "THE GLITCH provides educational resources across 8 wealth domains: Health & Fitness, E-Commerce, Forex, Crypto, Algorithmic FX, Intelligent Systems, Social Media, and Real Estate. Our platform focuses on helping you build generational wealth through multiple income streams.";
        }
        
        // Community related
        if (msg.includes("community") || msg.includes("forum") || msg.includes("chat") || msg.includes("discuss")) {
            return "Our community is a great place to connect with other traders, share strategies, and get help. You can access it in the Community section, and it's free for all logged-in users!";
        }
        
        // Technical support
        if (msg.includes("help") || msg.includes("support") || msg.includes("problem") || msg.includes("issue") || msg.includes("error")) {
            return "I'm here to help! For technical issues, you can <a href='/contact-us' style='color: #8B5CF6; text-decoration: underline;'>contact our support team</a>. For general questions about trading or our platform, feel free to ask me anything!";
        }
        
        // Account and payment issues
        if (msg.includes("account") || msg.includes("password") || msg.includes("login") || msg.includes("payment") || msg.includes("billing") || msg.includes("refund")) {
            return "For account, payment, or billing-related questions, please visit our <a href='/contact-us' style='color: #8B5CF6; text-decoration: underline;'>Contact Us page</a> to submit a support request. Our team will assist you within 24 hours.";
        }
        
        // About the platform
        if (msg.includes("about") || msg.includes("what") || msg.includes("how") || msg.includes("platform")) {
            return "THE GLITCH is your pathway to building generational wealth through multiple streams of knowledge. We teach you to make money work for you, break bad financial habits, and create lasting prosperity across 8 powerful domains.";
        }
        
        // Generational wealth questions
        if (msg.includes("wealth") || msg.includes("income") || msg.includes("passive") || msg.includes("financial freedom")) {
            return "We focus on teaching you how to build generational wealth through multiple income streams. Our courses cover trading, investing, e-commerce, and more—all designed to help you achieve true financial freedom!";
        }
        
        // Trading questions (logged in users only)
        if (msg.includes("trade") || msg.includes("trading") || msg.includes("forex") || msg.includes("crypto") || msg.includes("stock") || msg.includes("investment")) {
            return "I can help with trading questions! We cover Forex, Crypto, Algorithmic FX, and more. Which area would you like to learn about? You can also check our <a href='/courses' style='color: #8B5CF6; text-decoration: underline;'>courses</a> for in-depth lessons.";
        }
        
        // Personal questions (logged in users only)
        if (msg.includes("my") && (msg.includes("course") || msg.includes("progress") || msg.includes("level") || msg.includes("xp"))) {
            return `Check your <a href='/my-courses' style='color: #8B5CF6; text-decoration: underline;'>My Courses</a> page to see your enrolled courses and progress. Your level and XP are visible in your <a href='/profile' style='color: #8B5CF6; text-decoration: underline;'>Profile</a>.`;
        }
        
        // Default response for logged in users - try to answer anything
        return "I'm here to help with any questions you have! Try asking about our courses, trading strategies, community features, your account, or anything else. For complex questions, visit our <a href='/contact-us' style='color: #8B5CF6; text-decoration: underline;'>Contact Us page</a>. What else can I help you with?";
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
        "📚 Courses": [
            "What trading courses do you offer for beginners?",
            "Are there any video tutorials or just text?",
            "How do I track my course progress?",
            "Do the courses include quizzes or checkpoints?",
            "Can I access advanced courses without a subscription?",
        ],
        "💸 Pricing & Subscriptions": [
            "What's the difference between the Free and Premium plans?",
            "How much does the Premium plan cost?",
            "Can I cancel my subscription anytime?",
            "Is there a refund if I'm not happy?",
            "What payment methods are accepted?",
        ],
        "💬 Community": [
            "What's the THE GLITCH community?",
            "How do I unlock new chat channels?",
            "Is the community moderated?",
            "Can free users access the chatroom?",
            "How do XP and leveling up work?",
        ],
        "🛠️ Tech Help & Chatbot": [
            "Where can I use the chatbot?",
            "What can the chatbot help me with?",
            "Does the bot give live market data?",
            "Why can't I send messages in some channels?",
            "I purchased a course — why can't I access the community?",
        ]
    };

    return (
        <div className="chatbot-container">
            <button className="chatbot-toggle" onClick={toggleChat}>💬</button>
            {isOpen && (
                <div className="chatbot-window">
                    <div className="chatbot-header">
                        THE GLITCH Chat
                        {connectError && <span className="offline-indicator">⚠️ Offline Mode</span>}
                        <button className="chatbot-close" onClick={toggleChat}>✕</button>
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
                            <div className="message bot">
                                {Object.entries(groupedOptions).map(([group, questions]) => (
                                    <div key={group} style={{ marginBottom: "10px" }}>
                                        <strong>{group}</strong>
                                        <ul style={{ paddingLeft: "20px" }}>
                                            {questions.map((q, i) => (
                                                <li
                                                    key={i}
                                                    className="chatbot-option"
                                                    onClick={() => handleOption(q)}
                                                >
                                                    {q}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}

                        {isLoading && (
                            <div className="message bot">🧠 Thinking...</div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <form className="chatbot-input" onSubmit={handleSubmit}>
                        <input
                            type="text"
                            value={input}
                            placeholder="Ask me anything..."
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <button type="submit">➤</button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Chatbot;
