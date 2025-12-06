import React, { useState } from "react";
import { useNavigate, Link } from 'react-router-dom';
import "../styles/Login.css";
import BinaryBackground from '../components/BinaryBackground';
import { useAuth } from "../context/AuthContext";
import Api from '../services/Api';

function SignUp() {
    const [step, setStep] = useState(1); // 1: email/password entry, 2: email verification code, 3: complete registration
    const [formData, setFormData] = useState({ email: "", password: "", confirmPassword: "" });
    const [verificationCode, setVerificationCode] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [emailVerified, setEmailVerified] = useState(false);
    const navigate = useNavigate();
    const { register } = useAuth();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // Step 1: Send verification email
    const handleSendVerificationEmail = async (e) => {
        e.preventDefault();
        const { email, password, confirmPassword } = formData;

        if (!email || !password || !confirmPassword) {
            setError("All fields are required.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters long.");
            return;
        }

        setIsLoading(true);
        setError("");
        setSuccess("");

        try {
            // Send verification code to email - MUST succeed before proceeding
            const result = await Api.sendSignupVerificationEmail(email);
            
            if (result === true || result === undefined) {
                setSuccess("Verification code sent! Please check your email for the 6-digit code.");
                setStep(2);
            } else {
                setError("Failed to send verification email. Your email address may not be valid. Please check and try again.");
                // Do NOT proceed to step 2 if email fails
            }
        } catch (error) {
            console.error("Email verification error:", error);
            // If email sending fails, user CANNOT proceed with signup
            // This prevents signup with fake/invalid emails
            let errorMsg = error.message || "Failed to send verification email. Please check your email address and try again.";
            
            // Provide more specific error messages
            if (error.message && error.message.includes("already exists")) {
                errorMsg = "An account with this email already exists. Please sign in instead.";
            } else if (error.message && error.message.includes("invalid")) {
                errorMsg = "Invalid email address. Please enter a valid email.";
            } else if (error.message && error.message.includes("not configured")) {
                errorMsg = "Email service is temporarily unavailable. Please try again later or contact support.";
            }
            
            setError(errorMsg);
            // Stay on step 1 - don't allow progression without email verification
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Verify email code
    const handleVerifyEmailCode = async (e) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        if (verificationCode.length !== 6) {
            setError("Please enter a valid 6-digit code.");
            setIsLoading(false);
            return;
        }

        try {
            const result = await Api.verifySignupCode(formData.email, verificationCode);
            
            if (result && result.verified) {
                setEmailVerified(true);
                setSuccess("Email verified successfully! Completing registration...");
                setStep(3);
                
                // Automatically proceed to registration after a brief delay
                handleCompleteRegistration();
            } else {
                setError("Invalid or expired verification code.");
            }
        } catch (error) {
            console.error("Code verification error:", error);
            if (error.message && error.message.includes("expired")) {
                setError("Verification code has expired. Please request a new one.");
            } else if (error.message && error.message.includes("Invalid")) {
                setError("Invalid verification code. Please check and try again.");
            } else {
                setError(error.message || "Verification failed. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Step 3: Complete registration after email is verified
    const handleCompleteRegistration = async () => {
        if (!emailVerified) {
            setError("Email must be verified before completing registration.");
            setStep(2); // Go back to verification step
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const response = await register({ email: formData.email, password: formData.password });
            
            // If MFA is required, the register function will redirect to verify-mfa
            // Otherwise, redirect to subscription page (first month free, then £99/month)
            if (response && response.status !== "MFA_REQUIRED") {
                // Mark as new signup to show subscription page
                localStorage.setItem('pendingSubscription', 'true');
                localStorage.setItem('newSignup', 'true');
                navigate("/subscription");
            }
        } catch (error) {
            console.error("Registration error:", error);
            setError(error.message || "Unable to register. Please try again later.");
            setIsLoading(false);
        }
    };

    // Step 1: Email and password entry
    const renderStep1 = () => (
        <div className="login-form-container">
            <div className="form-header">
                <h2 className="login-title">SIGN UP</h2>
                <p className="login-subtitle">Create your new account</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleSendVerificationEmail}>
                <div className="form-group">
                    <label htmlFor="email" className="form-label">Email Address</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        autoComplete="email"
                        placeholder="Enter your email"
                        className="form-input"
                        disabled={isLoading}
                    />
                </div>
                
                <div className="form-group">
                    <label htmlFor="password" className="form-label">Password</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                        placeholder="Create a password"
                        className="form-input"
                        disabled={isLoading}
                    />
                </div>
                
                <div className="form-group">
                    <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                    <input
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                        placeholder="Confirm your password"
                        className="form-input"
                        disabled={isLoading}
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading}
                >
                    {isLoading ? 'SENDING...' : 'VERIFY EMAIL'}
                </button>
            </form>
            
            <div className="register-link">
                <p>Already have an account? <Link to="/login">Sign In</Link></p>
            </div>
        </div>
    );

    // Step 2: Email verification code entry
    const renderStep2 = () => (
        <div className="login-form-container">
            <div className="form-header">
                <h2 className="login-title">VERIFY EMAIL</h2>
                <p className="login-subtitle">Enter the 6-digit code sent to your email</p>
                <p className="email-sent">Code sent to: {formData.email}</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <form onSubmit={handleVerifyEmailCode}>
                <div className="form-group">
                    <label htmlFor="verification-code" className="form-label">Verification Code</label>
                    <input 
                        type="text"
                        id="verification-code"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                        maxLength={6}
                        required
                        placeholder="Enter 6-digit code"
                        className="form-input"
                        disabled={isLoading}
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="login-button"
                    disabled={isLoading || verificationCode.length !== 6}
                >
                    {isLoading ? 'VERIFYING...' : 'VERIFY CODE'}
                </button>
            </form>
            
            <div className="register-link">
                <p>Didn't receive the code? <button type="button" onClick={handleSendVerificationEmail} className="link-button" disabled={isLoading}>Resend Code</button></p>
                <p><button type="button" onClick={() => { setStep(1); setVerificationCode(''); setError(''); setSuccess(''); }} className="link-button">Back to Sign Up</button></p>
            </div>
        </div>
    );

    // Step 3: Completing registration (loading state)
    const renderStep3 = () => (
        <div className="login-form-container">
            <div className="form-header">
                <h2 className="login-title">CREATING ACCOUNT</h2>
                <p className="login-subtitle">Please wait while we create your account...</p>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
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
}

export default SignUp;
