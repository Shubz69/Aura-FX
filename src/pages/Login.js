import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import "../styles/Login.css";
import { useAuth } from "../context/AuthContext";
import { RiTerminalBoxFill } from 'react-icons/ri';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showMfaVerification, setShowMfaVerification] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [countdown, setCountdown] = useState(30);
    const [canResendCode, setCanResendCode] = useState(false);
    const { login: loginWithAuth, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const errorRef = useRef('');
    
    useEffect(() => {
        // Reset countdown timer if MFA verification is shown
        if (showMfaVerification) {
            let timer = countdown;
            const interval = setInterval(() => {
                if (timer > 0) {
                    timer -= 1;
                    setCountdown(timer);
                } else {
                    setCanResendCode(true);
                    clearInterval(interval);
                }
            }, 1000);
            
            return () => clearInterval(interval);
        }
    }, [showMfaVerification, countdown]);
    
    useEffect(() => {
        // Check if account was deleted
        const params = new URLSearchParams(window.location.search);
        if (params.get('deleted') === 'true') {
            setError('Your account has been deleted by an administrator. You have been logged out.');
            // Clear the URL parameter
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // Redirect if already authenticated
        if (isAuthenticated) {
            navigate('/community');
        }
    }, [isAuthenticated, navigate]);
    
    // Prevent form from submitting and refreshing page
    useEffect(() => {
        const handleFormSubmit = (e) => {
            const form = document.querySelector('form');
            if (form && form.contains(e.target)) {
                e.preventDefault();
            }
        };
        
        document.addEventListener('submit', handleFormSubmit, true);
        return () => {
            document.removeEventListener('submit', handleFormSubmit, true);
        };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Clear previous error
        errorRef.current = '';
        setError('');
        setIsLoading(true);
        
        try {
            // Use AuthContext login which handles MFA properly
            const result = await loginWithAuth(email, password);
            
            // If MFA is required, the login function will redirect to verify-mfa
            // Don't navigate here - AuthContext handles it
            if (result && result.status === "MFA_REQUIRED") {
                setIsLoading(false);
                return;
            }
            
            // If login succeeds, AuthContext will handle navigation
            // Only navigate here if AuthContext didn't (shouldn't happen)
            if (result && result.token) {
                setIsLoading(false);
                // AuthContext already navigated, so we don't need to do anything
                return;
            }
            
            // If we get here without a token, something went wrong
            setIsLoading(false);
            setError('Login failed. Please try again.');
        } catch (err) {
            console.error('Login error details:', err);

            let errorMessage = '';

            // Check if error has a response from the server
            if (err.response) {
                const status = err.response.status;
                const serverMessage = err.response.data?.message || err.response.data?.error;

                // Handle specific HTTP status codes with very specific messages
                if (status === 404) {
                    // 404 could mean API endpoint not found OR user not found
                    if (serverMessage && serverMessage.toLowerCase().includes('account') || serverMessage.toLowerCase().includes('email')) {
                        errorMessage = serverMessage;
                    } else {
                        errorMessage = '❌ LOGIN API ENDPOINT NOT FOUND: The login service is currently unavailable. This is a server configuration issue. Please contact support or try again in a few minutes.';
                    }
                } else if (status === 401) {
                    errorMessage = serverMessage || '❌ INCORRECT PASSWORD: The password you entered is incorrect. Please check your password and try again, or click "Forgot Password?" to reset it.';
                } else if (status === 400) {
                    errorMessage = serverMessage || '❌ INVALID REQUEST: Email and password are required. Please fill in both fields.';
                } else if (status === 500) {
                    errorMessage = serverMessage || '❌ SERVER ERROR: The server encountered an error processing your login. This could be a database connection issue. Please try again in a few moments or contact support.';
                } else if (status === 503) {
                    errorMessage = '❌ SERVICE UNAVAILABLE: The login service is temporarily down for maintenance. Please try again later.';
                } else if (status === 429) {
                    errorMessage = '❌ TOO MANY ATTEMPTS: You have made too many login attempts. Please wait a few minutes before trying again.';
                } else if (serverMessage) {
                    errorMessage = `❌ LOGIN FAILED: ${serverMessage}`;
                } else {
                    errorMessage = `❌ LOGIN FAILED: Server returned error code ${status}. Please try again or contact support if the problem persists.`;
                }
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
                errorMessage = '❌ NETWORK ERROR: Cannot connect to the server. Please check your internet connection and try again.';
            } else if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
                errorMessage = '❌ CONNECTION TIMEOUT: The server took too long to respond. Please check your internet connection and try again.';
            } else if (err.message) {
                // Use the error message from AuthContext or API
                if (err.message.toLowerCase().includes('email') || err.message.toLowerCase().includes('account')) {
                    errorMessage = `❌ ${err.message}`;
                } else if (err.message.toLowerCase().includes('password')) {
                    errorMessage = `❌ ${err.message}`;
                } else if (err.message.toLowerCase().includes('database')) {
                    errorMessage = '❌ DATABASE CONNECTION ERROR: The database is currently unavailable. Please try again in a few moments or contact support.';
                } else if (err.message.toLowerCase().includes('token') || err.message.toLowerCase().includes('authentication')) {
                    errorMessage = '❌ AUTHENTICATION ERROR: There was a problem with authentication. Please try logging in again.';
                } else {
                    errorMessage = `❌ LOGIN ERROR: ${err.message}`;
                }
            } else {
                errorMessage = '❌ UNKNOWN ERROR: An unexpected error occurred during login. Please try again or contact support if the problem persists.';
            }

            console.log('Setting error message:', errorMessage);
            // Store error in ref for persistence
            errorRef.current = errorMessage;
            // Ensure error is set and persists
            setError(errorMessage);
            setIsLoading(false);
            
            // Force error to persist - double-check after render
            setTimeout(() => {
                // Force re-render with error message if it was cleared
                if (errorRef.current && !error) {
                    console.warn('Error message was cleared, re-setting...');
                    setError(errorRef.current);
                }
            }, 100);
            
            // Prevent any navigation or page refresh
            if (e && e.preventDefault) {
                e.preventDefault();
            }
        }
    };

    const handleVerifyMfa = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        
        if (!mfaCode || mfaCode.length !== 6) {
            setError('Please enter a valid 6-digit code');
            setIsLoading(false);
            return;
        }
        
        try {
            // Use real API for MFA verification
            const response = await Api.verifyMfa(email, mfaCode);
            
            if (response && response.token) {
                localStorage.setItem("token", response.token);
                
                if (response.refreshToken) {
                    localStorage.setItem("refreshToken", response.refreshToken);
                }
                
                localStorage.setItem("mfaVerified", "true");
                
                // Use the login function to update context
                await loginWithAuth(
                    response.token,
                    response.role || 'USER', 
                    {
                        id: response.id,
                        username: response.username || email.split('@')[0] || 'user',
                        email: response.email || email,
                        name: response.name || '',
                        avatar: response.avatar || 'avatar_ai.png',
                    }
                );
                
                // Navigate to community
                navigate('/community');
            } else {
                throw new Error("Invalid response from server");
            }
        } catch (err) {
            console.error("MFA verification error:", err);
            setError(err.response?.data?.message || err.message || "Invalid code. Please try again.");
            setIsLoading(false);
        }
    };
    
    const handleResendCode = async () => {
        setError('');
        setIsLoading(true);
        
        try {
            // Use real API for MFA resend
            await Api.sendMfa(email);
            
            setCountdown(30);
            setCanResendCode(false);
            alert("Code resent to your email.");
            setIsLoading(false);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to resend code. Please try again.");
            setIsLoading(false);
        }
    };
    
    const returnToLogin = () => {
        setShowMfaVerification(false);
        setMfaCode('');
        setError('');
    };

    // Show MFA verification interface
    if (showMfaVerification) {
        return (
            <div className="login-container">
                <CosmicBackground />
                <div className="login-form-container">
                    <div className="brand-logo">
                        <div className="logo-icon">
                            <RiTerminalBoxFill />
                        </div>
                        <h1 className="brand-title">WHY AURA FX</h1>
                    </div>
                    
                    <h2 className="mfa-title">MFA VERIFICATION</h2>
                    <p className="mfa-info">Please enter the 6-digit code sent to your email.</p>
                    <p className="email-sent">Code sent to: {email}</p>
                    
                    {error && <div className="error-message">{error}</div>}
                    
                    <form onSubmit={handleVerifyMfa}>
                        <div className="form-group">
                            <label htmlFor="mfa-code">Verification Code</label>
                            <div className="input-wrapper">
                                <input 
                                    type="text"
                                    id="mfa-code"
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                    maxLength={6}
                                    required
                                    placeholder="Enter 6-digit code"
                                />
                            </div>
                        </div>
                        
                        <button 
                            type="submit" 
                            className="login-button"
                            disabled={isLoading || mfaCode.length !== 6}
                        >
                            {isLoading ? 'VERIFYING...' : 'VERIFY CODE'}
                        </button>
                        
                        <div className="mfa-actions">
                            <button
                                type="button"
                                className="resend-btn"
                                onClick={handleResendCode}
                                disabled={!canResendCode || isLoading}
                            >
                                {canResendCode ? 'Resend Code' : `Resend Code (${countdown}s)`}
                            </button>
                            
                            <button 
                                type="button"
                                className="back-btn"
                                onClick={returnToLogin}
                            >
                                Back to Login
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // Regular login interface
    return (
        <div className="login-container">
            <CosmicBackground />
            <div className="login-form-container">
                
                <div className="form-header">
                    <h2 className="login-title">SIGN IN</h2>
                    <p className="login-subtitle">Access your trading account</p>
                </div>
                
                {error && error.trim() && (
                    <div 
                        className="error-message" 
                        role="alert" 
                        aria-live="assertive"
                        style={{ 
                            display: 'block !important',
                            visibility: 'visible !important',
                            opacity: '1 !important',
                            marginBottom: '24px',
                            marginTop: '16px',
                            padding: '20px 24px',
                            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.25) 100%)',
                            border: '2px solid #EF4444',
                            borderRadius: '12px',
                            color: '#FFFFFF',
                            fontSize: '16px',
                            fontWeight: '700',
                            textAlign: 'center',
                            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4), 0 0 0 3px rgba(239, 68, 68, 0.1)',
                            animation: 'errorPulse 0.5s ease-in-out',
                            zIndex: 1000,
                            position: 'relative',
                            textTransform: 'none',
                            letterSpacing: '0.3px',
                            lineHeight: '1.6'
                        }}
                    >
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '12px',
                            fontSize: '20px',
                            marginBottom: '8px'
                        }}>
                            <span style={{ fontSize: '28px' }}>⚠️</span>
                            <strong style={{ fontSize: '18px', color: '#FFFFFF' }}>LOGIN ERROR</strong>
                        </div>
                        <div style={{ 
                            fontSize: '16px', 
                            color: '#FFFFFF', 
                            fontWeight: '600',
                            marginTop: '8px'
                        }}>
                            {error}
                        </div>
                    </div>
                )}
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">Email Address</label>
                        <input 
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            placeholder="Enter your email"
                            className="form-input"
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="password" className="form-label">Password</label>
                        <input 
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            className="form-input"
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading ? 'AUTHENTICATING...' : 'LOGIN'}
                    </button>
                    
                    {/* Error message displayed prominently right under login button */}
                    {error && error.trim() && (
                        <div 
                            className="error-message-under-button" 
                            role="alert" 
                            aria-live="assertive"
                            style={{ 
                                display: 'block !important',
                                visibility: 'visible !important',
                                opacity: '1 !important',
                                marginTop: '20px',
                                marginBottom: '16px',
                                padding: '20px 24px',
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.25) 100%)',
                                border: '2px solid #EF4444',
                                borderRadius: '12px',
                                color: '#FFFFFF',
                                fontSize: '15px',
                                fontWeight: '700',
                                textAlign: 'center',
                                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4), 0 0 0 3px rgba(239, 68, 68, 0.1)',
                                animation: 'errorPulse 0.5s ease-in-out',
                                zIndex: 1000,
                                position: 'relative',
                                textTransform: 'none',
                                letterSpacing: '0.3px',
                                lineHeight: '1.6',
                                wordWrap: 'break-word',
                                maxWidth: '100%'
                            }}
                        >
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '12px',
                                fontSize: '20px',
                                marginBottom: '10px'
                            }}>
                                <span style={{ fontSize: '28px' }}>⚠️</span>
                                <strong style={{ fontSize: '18px', color: '#FFFFFF' }}>LOGIN FAILED</strong>
                            </div>
                            <div style={{ 
                                fontSize: '15px', 
                                color: '#FFFFFF', 
                                fontWeight: '600',
                                marginTop: '8px',
                                whiteSpace: 'pre-wrap'
                            }}>
                                {error}
                            </div>
                        </div>
                    )}
                    
                    <Link to="/forgot-password" className="forgot-password">
                        Forgot Password?
                    </Link>
                </form>
                
                <div className="register-link">
                    <p>Don't have an account? <Link to="/register">Sign Up</Link></p>
                </div>
            </div>
        </div>
    );
};

export default Login;
