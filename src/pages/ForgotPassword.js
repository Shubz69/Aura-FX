import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import "../styles/Login.css";
import { RiTerminalBoxFill } from 'react-icons/ri';
import BinaryBackground from '../components/BinaryBackground';
import Api from '../services/Api';

const ForgotPassword = () => {
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
                setSuccess('MFA verification code sent! Please check your email for the 6-digit code.');
                setStep(2);
            } else {
                setError('Failed to send reset email. Please try again.');
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
            const errorMessage = err.message || 'Failed to send reset email. Please try again.';
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
                setError('Please enter a valid 6-digit code.'); 
                setIsLoading(false); 
                return; 
            }
            
            const resp = await Api.verifyResetCode(email, resetCode);
            if (resp && resp.success && resp.token) {
                setSuccess('MFA code verified successfully! You can now set your new password.');
                // Store the reset token for password reset
                localStorage.setItem('resetToken', resp.token);
                setStep(3);
            } else {
                setError('Invalid or expired code.');
            }
        } catch (err) {
            if (err.message.includes('expired')) {
                setError('Code has expired. Please request a new one.');
            } else if (err.message.includes('Invalid')) {
                setError('Invalid code. Please check the code and try again.');
            } else {
                setError('Verification failed. Please try again.');
            }
        }
        
        setIsLoading(false);
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        setIsLoading(true);

        try {
            // Get the reset token from localStorage
            const resetToken = localStorage.getItem('resetToken');
            if (!resetToken) {
                setError('Reset session expired. Please start the password reset process again.');
                setIsLoading(false);
                return;
            }

            // Call the API service to reset password
            const success = await Api.resetPassword(resetToken, newPassword);
            
            if (success) {
                setSuccess('Password reset successfully! You can now login with your new password.');
                // Clean up the reset token
                localStorage.removeItem('resetToken');
                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            } else {
                setError('Failed to reset password. Please try again.');
            }
        } catch (err) {
            if (err.message.includes('expired')) {
                setError('Reset session has expired. Please start the password reset process again.');
                localStorage.removeItem('resetToken');
            } else if (err.message.includes('Invalid')) {
                setError('Invalid reset token. Please start the password reset process again.');
                localStorage.removeItem('resetToken');
            } else {
                setError('Failed to reset password. Please try again.');
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
                <h1 className="brand-title">THE GLITCH</h1>
            </div>
            
            <div className="form-header">
                <h2 className="login-title">RESET PASSWORD</h2>
                <p className="login-subtitle">Enter your email to receive reset instructions</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleSendResetEmail}>
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
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading}
                >
                    {isLoading ? 'SENDING...' : 'SEND RESET EMAIL'}
                </button>
            </form>
            
            <div className="register-link">
                <p>Remember your password? <Link to="/login">Back to Login</Link></p>
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="login-form-container">
            <div className="brand-logo">
                <div className="logo-icon">
                    <RiTerminalBoxFill />
                </div>
                <h1 className="brand-title">THE GLITCH</h1>
            </div>
            
            <div className="form-header">
                <h2 className="login-title">MFA VERIFICATION</h2>
                <p className="login-subtitle">Enter the 6-digit MFA code sent to your email</p>
                <p className="email-sent">Code sent to: {email}</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleVerifyCode}>
                <div className="form-group">
                    <label htmlFor="reset-code" className="form-label">Verification Code</label>
                    <input 
                        type="text"
                        id="reset-code"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                        maxLength={6}
                        required
                        placeholder="Enter 6-digit code"
                        className="form-input"
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading || resetCode.length !== 6}
                >
                    {isLoading ? 'VERIFYING...' : 'VERIFY CODE'}
                </button>
            </form>
            
            <div className="register-link">
                <p>Didn't receive the code? <button type="button" onClick={() => setStep(1)} className="link-button">Resend Email</button></p>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="login-form-container">
            <div className="brand-logo">
                <div className="logo-icon">
                    <RiTerminalBoxFill />
                </div>
                <h1 className="brand-title">THE GLITCH</h1>
            </div>
            
            <div className="form-header">
                <h2 className="login-title">NEW PASSWORD</h2>
                <p className="login-subtitle">Enter your new password</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleResetPassword}>
                <div className="form-group">
                    <label htmlFor="new-password" className="form-label">New Password</label>
                    <input 
                        type="password"
                        id="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder="Enter new password"
                        className="form-input"
                    />
                </div>
                
                <div className="form-group">
                    <label htmlFor="confirm-password" className="form-label">Confirm Password</label>
                    <input 
                        type="password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder="Confirm new password"
                        className="form-input"
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading}
                >
                    {isLoading ? 'RESETTING...' : 'RESET PASSWORD'}
                </button>
            </form>
            
            <div className="register-link">
                <p>Remember your password? <Link to="/login">Back to Login</Link></p>
            </div>
        </div>
    );

    return (
        <div className="login-container">
            <BinaryBackground />
            
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
        </div>
    );
};

export default ForgotPassword;
