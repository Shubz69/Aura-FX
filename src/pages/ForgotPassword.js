import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import "../styles/Login.css";
import { RiTerminalBoxFill } from 'react-icons/ri';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';

const ForgotPassword = () => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState(1); // 1: email input, 2: code verification, 3: new password
    const [resetCode, setResetCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const navigate = useNavigate();

    const handleSendResetEmail = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            console.log('Attempting to send password reset email for:', email);
            
            // Call the API service to send password reset email with MFA
            const success = await Api.sendPasswordResetEmail(email);
            
            console.log('Password reset email result:', success);
            
            if (success === true || success === undefined) {
                setSuccess(t('forgotPassword.successEmailSent'));
                setStep(2);
            } else {
                setError(t('forgotPassword.errorSendFailed'));
            }
        } catch (err) {
            console.error('Password reset error:', err);
            console.error('Error details:', {
                message: err.message,
                code: err.code,
                response: err.response,
                request: err.request
            });
            
            // Use the error message from the API
            const errorMessage = err.message || t('forgotPassword.errorSendFailed');
            setError(errorMessage);
        }
        
        setIsLoading(false);
    };

    const handleVerifyCode = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (resetCode.length !== 6) { 
                setError(t('forgotPassword.errorInvalidCode')); 
                setIsLoading(false); 
                return; 
            }
            
            const resp = await Api.verifyResetCode(email, resetCode);
            if (resp && resp.success && resp.token) {
                setSuccess(t('forgotPassword.successCodeVerified'));
                // Store the reset token for password reset
                localStorage.setItem('resetToken', resp.token);
                setStep(3);
            } else {
                setError(t('forgotPassword.errorInvalidOrExpired'));
            }
        } catch (err) {
            if (err.message.includes('expired')) {
                setError(t('forgotPassword.errorCodeExpired'));
            } else if (err.message.includes('Invalid')) {
                setError(t('forgotPassword.errorInvalidCodeGeneric'));
            } else {
                setError(t('forgotPassword.errorVerificationFailed'));
            }
        }
        
        setIsLoading(false);
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError(t('forgotPassword.errorPasswordsMismatch'));
            return;
        }

        if (newPassword.length < 6) {
            setError(t('forgotPassword.errorPasswordTooShort'));
            return;
        }

        setIsLoading(true);

        try {
            // Get the reset token from localStorage
            const resetToken = localStorage.getItem('resetToken');
            if (!resetToken) {
                setError(t('forgotPassword.errorResetTokenMissing'));
                setIsLoading(false);
                return;
            }

            // Call the API service to reset password
            const success = await Api.resetPassword(resetToken, newPassword);
            
            if (success) {
                setSuccess(t('forgotPassword.successPasswordReset'));
                // Clean up the reset token
                localStorage.removeItem('resetToken');
                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            } else {
                setError(t('forgotPassword.errorResetFailed'));
            }
        } catch (err) {
            if (err.message.includes('expired')) {
                setError(t('forgotPassword.errorResetExpired'));
                localStorage.removeItem('resetToken');
            } else if (err.message.includes('Invalid')) {
                setError(t('forgotPassword.errorInvalidToken'));
                localStorage.removeItem('resetToken');
            } else {
                setError(t('forgotPassword.errorResetFailed'));
            }
        }
        
        setIsLoading(false);
    };

    const renderStep1 = () => (
        <div className="login-form-container">
            <div className="brand-logo">
                <div className="logo-icon">
                    <RiTerminalBoxFill />
                </div>
                <h1 className="brand-title">{t('forgotPassword.brandTitle')}</h1>
            </div>
            
            <div className="form-header">
                <h2 className="login-title">{t('forgotPassword.step1Title')}</h2>
                <p className="login-subtitle">{t('forgotPassword.step1Subtitle')}</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleSendResetEmail}>
                <div className="form-group">
                    <label htmlFor="email" className="form-label">{t('forgotPassword.emailLabel')}</label>
                    <input 
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder={t('forgotPassword.emailPlaceholder')}
                        className="form-input"
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading}
                >
                    {isLoading ? t('forgotPassword.sending') : t('forgotPassword.sendResetEmail')}
                </button>
            </form>
            
            <div className="register-link">
                <p>{t('forgotPassword.rememberPassword')} <Link to="/login">{t('forgotPassword.backToLoginLink')}</Link></p>
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="login-form-container">
            <div className="brand-logo">
                <div className="logo-icon">
                    <RiTerminalBoxFill />
                </div>
                <h1 className="brand-title">{t('forgotPassword.brandTitle')}</h1>
            </div>
            
            <div className="form-header">
                <h2 className="login-title">{t('forgotPassword.step2Title')}</h2>
                <p className="login-subtitle">{t('forgotPassword.step2Subtitle')}</p>
                <p className="email-sent">{t('forgotPassword.codeSentLabel')} {email}</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleVerifyCode}>
                <div className="form-group">
                    <label htmlFor="reset-code" className="form-label">{t('auth.verificationCode')}</label>
                    <input 
                        type="text"
                        id="reset-code"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                        maxLength={6}
                        required
                        placeholder={t('auth.enterSixDigitCode')}
                        className="form-input"
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading || resetCode.length !== 6}
                >
                    {isLoading ? t('forgotPassword.verifying') : t('forgotPassword.verifyCode')}
                </button>
            </form>
            
            <div className="register-link">
                <p>{t('forgotPassword.didNotReceive')} <button type="button" onClick={() => setStep(1)} className="link-button">{t('forgotPassword.resendEmail')}</button></p>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="login-form-container">
            <div className="brand-logo">
                <div className="logo-icon">
                    <RiTerminalBoxFill />
                </div>
                <h1 className="brand-title">{t('forgotPassword.brandTitle')}</h1>
            </div>
            
            <div className="form-header">
                <h2 className="login-title">{t('forgotPassword.step3Title')}</h2>
                <p className="login-subtitle">{t('forgotPassword.step3Subtitle')}</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleResetPassword}>
                <div className="form-group">
                    <label htmlFor="new-password" className="form-label">{t('forgotPassword.newPasswordLabel')}</label>
                    <input 
                        type="password"
                        id="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder={t('forgotPassword.newPasswordPlaceholder')}
                        className="form-input"
                    />
                </div>
                
                <div className="form-group">
                    <label htmlFor="confirm-password" className="form-label">{t('auth.confirmPassword')}</label>
                    <input 
                        type="password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
                        className="form-input"
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading}
                >
                    {isLoading ? t('forgotPassword.resetting') : t('forgotPassword.resetPassword')}
                </button>
            </form>
            
            <div className="register-link">
                <p>{t('forgotPassword.rememberPassword')} <Link to="/login">{t('forgotPassword.backToLoginLink')}</Link></p>
            </div>
        </div>
    );

    return (
        <div className="login-container">
            <CosmicBackground />
            
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
        </div>
    );
};

export default ForgotPassword;
