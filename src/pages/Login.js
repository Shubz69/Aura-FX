import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import "../styles/Login.css";
import { useAuth } from "../context/AuthContext";
import { RiTerminalBoxFill } from 'react-icons/ri';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';
import { armPostLoginTransition } from '../utils/postLoginTransition';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [errorType, setErrorType] = useState(null);
    const [passwordError, setPasswordError] = useState(false);
    const [emailError, setEmailError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showMfaVerification, setShowMfaVerification] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [countdown, setCountdown] = useState(30);
    const [canResendCode, setCanResendCode] = useState(false);
    const { login: loginWithAuth, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const errorRef = useRef('');
    const redirectedAuthedRef = useRef(false);
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
        if (isLoading) {
            return;
        }
        if (isAuthenticated && !redirectedAuthedRef.current) {
            redirectedAuthedRef.current = true;
            const storedRedirect = loadPostAuthRedirect();
            const targetPath = storedRedirect?.next;
            if (targetPath) {
                navigate(targetPath, { replace: true });
            } else {
                navigate('/community', { replace: true });
            }
        }
    }, [isAuthenticated, isLoading, navigate, queryParams]);
    
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
        setPasswordError(false);
        setEmailError(false);
        setError('');
        setErrorType(null);
        setIsLoading(true);

        const emailTrimmed = (email || '').trim();
        if (!emailTrimmed || emailTrimmed.length < 2) {
            setError('Please enter your email or username.');
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

            setPasswordError(true);
            setErrorType('password');
            setError('The password you entered is incorrect. Try again or use Forgot Password.');
        } catch (err) {
            console.error('Login error details:', err);

            let errorMessage = '';
            const status = err.response?.status;
            const data = err.response?.data;
            const isJsonResponse = data != null && typeof data === 'object' && !Array.isArray(data);
            const serverErrorCode = isJsonResponse ? String(data.error || '') : '';
            const serverMessage = isJsonResponse ? String(data.message || '').trim() : '';
            const errMsg = (err.message || '').trim();

            const isNoAccount =
                status === 404 ||
                serverErrorCode === 'NO_ACCOUNT' ||
                /no account with this email/i.test(serverMessage) ||
                /no account found with that email or username/i.test(serverMessage) ||
                /no account exists/i.test(errMsg);
            const isBadPassword =
                status === 401 ||
                serverErrorCode === 'INVALID_PASSWORD' ||
                /incorrect password/i.test(serverMessage) ||
                /incorrect password/i.test(errMsg);

            if (isBadPassword && !isNoAccount) {
                setErrorType('password');
                setPasswordError(true);
                setEmailError(false);
                errorMessage = serverMessage || errMsg || 'The password you entered is incorrect. Try again or use Forgot Password.';
            } else if (isNoAccount) {
                setErrorType('email');
                setPasswordError(false);
                setEmailError(true);
                errorMessage = serverMessage || errMsg || 'No account exists with this email address. Please sign up for an account.';
            } else if (err.response) {
                setErrorType(null);
                setPasswordError(false);
                setEmailError(false);
                errorMessage = serverMessage || errMsg || (status === 429 ? 'Too many attempts. Try again shortly.' : status === 500 ? 'Something went wrong. Please try again.' : 'Login failed. Please try again.');
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK' || (err.message && err.message.includes('Network Error'))) {
                setErrorType(null);
                setPasswordError(false);
                setEmailError(false);
                errorMessage = 'Cannot connect to server. Please try again.';
            } else if (err.code === 'ETIMEDOUT' || (err.message && err.message.includes('timeout'))) {
                setErrorType(null);
                setPasswordError(false);
                setEmailError(false);
                errorMessage = 'The server took too long to respond. Check your connection and try again.';
            } else if (errMsg) {
                const isPwErr = errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('incorrect');
                setErrorType(isPwErr ? 'password' : 'email');
                setPasswordError(isPwErr);
                setEmailError(!isPwErr);
                errorMessage = errMsg;
            } else {
                setErrorType(null);
                setPasswordError(false);
                setEmailError(false);
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
                        avatar: response.avatar || null,
                    }
                );
                
                // Navigate to community
                armPostLoginTransition();
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
                        <h1 className="brand-title">Why Aura Terminal</h1>
                    </div>
                    
                    <h2 className="mfa-title">MFA verification</h2>
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
                    <h2 className="login-title">Sign in</h2>
                    <p className="login-subtitle">Access your trading account</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">Email or username</label>
                        <input 
                            type="text"
                            id="email"
                            value={email}
                            onChange={(e) => {
                                if (emailError) setEmailError(false);
                                setEmail(e.target.value);
                            }}
                            required
                            autoComplete="username"
                            placeholder="Email or username"
                            className={`form-input ${emailError ? 'input-error' : ''}`}
                            aria-invalid={emailError}
                            aria-describedby={emailError ? 'email-error' : undefined}
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="password" className="form-label">Password</label>
                        <input 
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => {
                                if (passwordError) {
                                    setPasswordError(false);
                                }
                                setPassword(e.target.value);
                            }}
                            required
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            className={`form-input ${passwordError ? 'input-error' : ''}`}
                            aria-invalid={passwordError}
                            aria-describedby={passwordError ? 'password-error' : emailError ? 'email-error' : undefined}
                        />
                    </div>

                    {error && error.trim() && (
                        <div
                            className="error-message-under-button login-error-banner"
                            role="alert"
                            aria-live="assertive"
                            id={passwordError ? 'password-error' : emailError ? 'email-error' : 'login-error-general'}
                        >
                            {errorType === 'password' && (
                                <div className="login-error-label">Incorrect password</div>
                            )}
                            {errorType === 'email' && (
                                <div className="login-error-label">No account for this email or username</div>
                            )}
                            <div className="login-error-body">{error}</div>
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
