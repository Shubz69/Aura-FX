import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
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
        errorRef.current = '';
        setError('');
        setIsLoading(true);

        try {
            const result = await loginWithAuth(email, password);

            if (result && result.status === "MFA_REQUIRED") {
                return;
            }

            if (result && result.token) {
                return;
            }

            setError('Login failed. Please try again.');
        } catch (err) {
            console.error('Login error details:', err);

            let errorMessage = '';
            const status = err.response?.status;

            if (err.response) {
                const serverMessage = err.response.data?.message || err.response.data?.error;

                if (status === 404) {
                    errorMessage = serverMessage
                        || 'No account with this email exists. Please check your email or sign up for a new account.';
                } else if (status === 401 || status === 400) {
                    // 401 = wrong password, 400 = validation — clear inline + toast, no redirect
                    errorMessage = serverMessage || 'Incorrect email or password.';
                    toast.error('Incorrect email or password.');
                } else if (status === 500) {
                    errorMessage = serverMessage || 'The server encountered an error. Please try again in a few moments or contact support.';
                } else if (status === 503) {
                    errorMessage = 'The login service is temporarily down. Please try again later.';
                } else if (status === 429) {
                    errorMessage = 'Too many login attempts. Please wait a few minutes before trying again.';
                } else if (serverMessage) {
                    errorMessage = serverMessage;
                } else {
                    errorMessage = `Login failed (${status}). Please try again or contact support.`;
                }
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
                errorMessage = 'Cannot connect to the server. Check your internet connection and try again.';
            } else if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
                errorMessage = 'The server took too long to respond. Check your connection and try again.';
            } else if (err.message) {
                errorMessage = err.message;
            } else {
                errorMessage = 'An unexpected error occurred. Please try again or contact support.';
            }

            errorRef.current = errorMessage;
            setError(errorMessage);

            if (status === 401 || status === 400) {
                setTimeout(() => {
                    if (errorRef.current) setError(errorRef.current);
                }, 100);
            }
        } finally {
            setIsLoading(false);
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
                            <strong style={{ fontSize: '18px', color: '#FFFFFF' }}>Login Error</strong>
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
                                <strong style={{ fontSize: '18px', color: '#FFFFFF' }}>Login Failed</strong>
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
