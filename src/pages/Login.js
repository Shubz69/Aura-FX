import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import "../styles/Login.css";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from 'react-i18next';
import { RiTerminalBoxFill } from 'react-icons/ri';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';
import { armPostLoginTransition } from '../utils/postLoginTransition';
import LanguageSelector from '../components/LanguageSelector';
import { getPreferredSiteLanguage } from '../utils/siteLanguage';

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
    const { t } = useTranslation();
    const [siteLanguage, setSiteLanguage] = useState(getPreferredSiteLanguage());
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
            setError(t('auth.errorAccountDeleted'));
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
                navigate('/', { replace: true });
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
            setError(t('auth.errorEmailRequired'));
            setIsLoading(false);
            return;
        }
        if (!(password || '').trim()) {
            setError(t('auth.errorPasswordRequired'));
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
            setError(t('auth.errorIncorrectPassword'));
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
                errorMessage = serverMessage || errMsg || t('auth.errorIncorrectPassword');
            } else if (isNoAccount) {
                setErrorType('email');
                setPasswordError(false);
                setEmailError(true);
                errorMessage = serverMessage || errMsg || t('auth.errorNoAccount');
            } else if (err.response) {
                setErrorType(null);
                setPasswordError(false);
                setEmailError(false);
                errorMessage =
                    serverMessage ||
                    errMsg ||
                    (status === 429
                        ? t('auth.errorTooManyAttempts')
                        : status === 503
                          ? t('auth.errorSigninUnavailable')
                          : status === 500
                            ? t('auth.errorSomethingWrong')
                            : t('auth.errorLoginFailed'));
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK' || (err.message && err.message.includes('Network Error'))) {
                setErrorType(null);
                setPasswordError(false);
                setEmailError(false);
                errorMessage = t('auth.errorCannotConnect');
            } else if (err.code === 'ETIMEDOUT' || (err.message && err.message.includes('timeout'))) {
                setErrorType(null);
                setPasswordError(false);
                setEmailError(false);
                errorMessage = t('auth.errorTimeout');
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
                errorMessage = t('auth.errorLoginFailed');
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
            setError(t('auth.errorInvalidMfaCode'));
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
                
                armPostLoginTransition();
                navigate('/');
            } else {
                throw new Error(t('auth.errorInvalidServerResponse'));
            }
        } catch (err) {
            console.error("MFA verification error:", err);
            setError(err.response?.data?.message || err.message || t('auth.errorInvalidCode'));
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
            alert(t('auth.resendSuccessAlert'));
            setIsLoading(false);
        } catch (err) {
            setError(err.response?.data?.message || err.message || t('auth.resendFailed'));
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
                        <h1 className="brand-title">{t('auth.mfaHeaderBrand')}</h1>
                    </div>
                    
                    <div style={{ marginBottom: 12 }}>
                        <LanguageSelector value={siteLanguage} onChange={setSiteLanguage} />
                    </div>
                    <h2 className="mfa-title">{t('auth.mfaTitle')}</h2>
                    <p className="mfa-info">{t('auth.mfaInfo')}</p>
                    <p className="email-sent">{t('auth.codeSentTo')} {email}</p>
                    
                    {error && <div className="error-message">{error}</div>}
                    
                    <form onSubmit={handleVerifyMfa}>
                        <div className="form-group">
                            <label htmlFor="mfa-code">{t('auth.verificationCode')}</label>
                            <div className="input-wrapper">
                                <input 
                                    type="text"
                                    id="mfa-code"
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                    maxLength={6}
                                    required
                                    placeholder={t('auth.enterSixDigitCode')}
                                />
                            </div>
                        </div>
                        
                        <button 
                            type="submit" 
                            className="login-button"
                            disabled={isLoading || mfaCode.length !== 6}
                        >
                            {isLoading ? t('auth.verifyingCta') : t('auth.verifyCodeCta')}
                        </button>
                        
                        <div className="mfa-actions">
                            <button
                                type="button"
                                className="resend-btn"
                                onClick={handleResendCode}
                                disabled={!canResendCode || isLoading}
                            >
                                {canResendCode ? t('auth.resendCode') : t('auth.resendCodeSeconds', { seconds: countdown })}
                            </button>
                            
                            <button 
                                type="button"
                                className="back-btn"
                                onClick={returnToLogin}
                            >
                                {t('auth.backToLogin')}
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
                    <h2 className="login-title">{t('auth.signIn')}</h2>
                    <p className="login-subtitle">{t('auth.accessTradingAccount')}</p>
                </div>
                <div style={{ marginBottom: 12 }}>
                    <LanguageSelector value={siteLanguage} onChange={setSiteLanguage} />
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">{t('auth.emailOrUsername')}</label>
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
                            placeholder={t('auth.emailOrUsername')}
                            className={`form-input ${emailError ? 'input-error' : ''}`}
                            aria-invalid={emailError}
                            aria-describedby={emailError ? 'email-error' : undefined}
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="password" className="form-label">{t('auth.password')}</label>
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
                            placeholder={t('auth.password')}
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
                                <div className="login-error-label">{t('auth.errorLabelIncorrectPassword')}</div>
                            )}
                            {errorType === 'email' && (
                                <div className="login-error-label">{t('auth.errorLabelNoAccount')}</div>
                            )}
                            <div className="login-error-body">{error}</div>
                        </div>
                    )}
                    
                    <button 
                        type="submit" 
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading ? t('auth.authenticating') : t('auth.loginCta')}
                    </button>
                    
                    <Link to="/forgot-password" className="forgot-password">
                        {t('auth.forgotPassword')}
                    </Link>
                </form>
                
                <div className="register-link">
                    <p>{t('auth.dontHaveAccount')} <Link to="/register">{t('auth.signUp')}</Link></p>
                </div>
            </div>
        </div>
    );
};

export default Login;
