import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import "../styles/Login.css";
import { useAuth } from "../context/AuthContext";
import { RiTerminalBoxFill } from 'react-icons/ri';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';

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
    const location = useLocation();
    const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const nextParam = queryParams.get('next');
    const planParam = queryParams.get('plan');
    
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
        if (queryParams.get('deleted') === 'true') {
            setError('Your account has been deleted by an administrator. You have been logged out.');
            // Clear the URL parameter
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // Redirect if already authenticated
        if (isAuthenticated) {
            const storedRedirect = loadPostAuthRedirect();
            const targetPath = storedRedirect?.next;
            if (targetPath) {
                navigate(targetPath, { replace: true });
            } else {
                navigate('/community');
            }
        }
    }, [isAuthenticated, navigate, queryParams]);
    
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

    useEffect(() => {
        if (!nextParam || isAuthenticated) {
            return;
        }
        const existing = loadPostAuthRedirect();
        if (!existing || existing.next !== nextParam || (existing.plan || null) !== (planParam ? planParam.toLowerCase() : null)) {
            savePostAuthRedirect({
                next: nextParam,
                plan: planParam,
                from: `${location.pathname}${location.search}`
            });
        }
    }, [nextParam, planParam, location.pathname, location.search, isAuthenticated]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        errorRef.current = '';
        setError('');
        setIsLoading(true);

        const emailTrimmed = (email || '').trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailTrimmed) {
            setError('Please enter a valid email address.');
            setIsLoading(false);
            return;
        }
        if (!emailRegex.test(emailTrimmed)) {
            setError('Please enter a valid email address.');
            setIsLoading(false);
            return;
        }
        if (!(password || '').trim()) {
            setError('Password is required.');
            setIsLoading(false);
            return;
        }

        try {
            const result = await loginWithAuth(emailTrimmed, password);

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
            const data = err.response?.data;
            const isJsonResponse = data != null && typeof data === 'object';
            const serverMessage = isJsonResponse ? (data.message || data.error) : '';

            if (status === 401) {
                errorMessage = serverMessage || 'Incorrect password. Please try again or use Forgot Password.';
            } else if (status === 404) {
                if (isJsonResponse && serverMessage) {
                    errorMessage = serverMessage;
                } else if (!isJsonResponse) {
                    errorMessage = 'Login service is unavailable. Please try again later.';
                } else {
                    errorMessage = 'No account with this email exists. Sign up for an account.';
                }
            } else if (err.response) {
                errorMessage = serverMessage || (status === 429 ? 'Too many attempts. Try again shortly.' : status === 500 ? 'Something went wrong. Please try again.' : `Login failed. Please try again.`);
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK' || (err.message && err.message.includes('Network Error'))) {
                errorMessage = 'Cannot connect to server. Please try again.';
            } else if (err.code === 'ETIMEDOUT' || (err.message && err.message.includes('timeout'))) {
                errorMessage = 'The server took too long to respond. Check your connection and try again.';
            } else if (err.message) {
                errorMessage = err.message;
            } else {
                errorMessage = 'Login failed. Please try again.';
            }

            errorRef.current = errorMessage;
            setError(errorMessage);
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
                    
                    {error && error.trim() && (
                        <div 
                            className="error-message-under-button" 
                            role="alert" 
                            aria-live="assertive"
                            style={{ 
                                display: 'block !important',
                                visibility: 'visible !important',
                                opacity: '1 !important',
                                marginBottom: '16px',
                                marginTop: '0',
                                padding: '16px 20px',
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.25) 100%)',
                                border: '2px solid #EF4444',
                                borderRadius: '12px',
                                color: '#FFFFFF',
                                fontSize: '15px',
                                fontWeight: '600',
                                textAlign: 'center',
                                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4)',
                                zIndex: 1000,
                                position: 'relative',
                                textTransform: 'none',
                                lineHeight: '1.5',
                                wordWrap: 'break-word',
                                maxWidth: '100%'
                            }}
                        >
                            {error}
                        </div>
                    )}
                    
                    <button 
                        type="submit" 
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading ? 'AUTHENTICATING...' : 'LOGIN'}
                    </button>
                    
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
