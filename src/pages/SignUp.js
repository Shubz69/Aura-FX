import React, { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from 'react-router-dom';
import "../styles/Login.css";
import CosmicBackground from '../components/CosmicBackground';
import { useAuth } from "../context/AuthContext";
import Api from '../services/Api';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';

function SignUp() {
    const [step, setStep] = useState(1); // 1: form entry, 2: email verify, 3: phone verify, 4: complete
    const [formData, setFormData] = useState({
        username: "",
        fullName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: ""
    });
    const [emailCode, setEmailCode] = useState("");
    const [phoneCode, setPhoneCode] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [emailVerified, setEmailVerified] = useState(false);
    const [phoneVerified, setPhoneVerified] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { register } = useAuth();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const nextParam = params.get('next');
        const planParam = params.get('plan');
        if (!nextParam) return;
        const existing = loadPostAuthRedirect();
        if (!existing || existing.next !== nextParam || (existing.plan || null) !== (planParam ? planParam.toLowerCase() : null)) {
            savePostAuthRedirect({
                next: nextParam,
                plan: planParam,
                from: `${location.pathname}${location.search}`
            });
        }
    }, [location.pathname, location.search]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const validateStep1 = () => {
        const { username, fullName, email, phone, password, confirmPassword } = formData;
        if (!username || username.trim().length < 3) {
            setError("Username must be at least 3 characters.");
            return false;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            setError("Username can only contain letters, numbers, hyphens, and underscores.");
            return false;
        }
        if (!fullName || fullName.trim().length < 2) {
            setError("Full name is required.");
            return false;
        }
        if (!email || !email.includes('@')) {
            setError("Valid email is required.");
            return false;
        }
        if (!phone || phone.replace(/\D/g, '').length < 10) {
            setError("Valid phone number is required (10+ digits).");
            return false;
        }
        if (!password || password.length < 6) {
            setError("Password must be at least 6 characters.");
            return false;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return false;
        }
        return true;
    };

    const handleSendVerificationEmail = async (e) => {
        e.preventDefault();
        if (!validateStep1()) return;
        setIsLoading(true);
        setError("");
        setSuccess("");
        try {
            const result = await Api.sendSignupVerificationEmail(formData.email, formData.username);
            if (result === true || result === undefined) {
                setSuccess("Verification code sent! Check your email for the 6-digit code.");
                setStep(2);
            } else {
                setError("Failed to send verification email. Please try again.");
            }
        } catch (err) {
            let msg = err.message || "Failed to send verification email.";
            if (err.message?.includes("already exists")) msg = "An account with this email already exists. Please sign in.";
            if (err.message?.includes("already taken")) msg = "This username is already taken.";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyEmailCode = async (e) => {
        e.preventDefault();
        if (emailCode.length !== 6) {
            setError("Please enter the 6-digit code.");
            return;
        }
        setIsLoading(true);
        setError("");
        try {
            const result = await Api.verifySignupCode(formData.email, emailCode);
            if (result?.verified) {
                setEmailVerified(true);
                setSuccess("Email verified! Now verify your phone number.");
                setStep(3);
                setError("");
                try {
                    await Api.sendPhoneVerificationCode(formData.phone);
                } catch (phoneErr) {
                    setError(phoneErr.message || "Could not send SMS. Please contact support.");
                }
            } else {
                setError("Invalid or expired code.");
            }
        } catch (err) {
            setError(err.message || "Verification failed.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyPhoneCode = async (e) => {
        e.preventDefault();
        if (phoneCode.length !== 6) {
            setError("Please enter the 6-digit SMS code.");
            return;
        }
        setIsLoading(true);
        setError("");
        try {
            const ok = await Api.verifyPhoneCode(formData.phone, phoneCode);
            if (ok) {
                setPhoneVerified(true);
                setSuccess("Phone verified! Creating your account...");
                setStep(4);
                handleCompleteRegistration();
            } else {
                setError("Invalid or expired code.");
            }
        } catch (err) {
            setError(err.message || "Verification failed.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCompleteRegistration = async () => {
        if (!emailVerified || !phoneVerified) {
            setError("Email and phone must be verified.");
            return;
        }
        setIsLoading(true);
        setError("");
        try {
            const response = await register({
                username: formData.username.trim(),
                name: formData.fullName.trim(),
                email: formData.email.trim().toLowerCase(),
                phone: formData.phone.trim(),
                password: formData.password
            });
            if (response && response.status !== "MFA_REQUIRED") {
                localStorage.setItem('pendingSubscription', 'true');
                localStorage.setItem('newSignup', 'true');
                navigate("/choose-plan");
            }
        } catch (err) {
            setError(err.message || "Registration failed.");
            setIsLoading(false);
        }
    };

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
                    <label htmlFor="username" className="form-label">Username (displayed name)</label>
                    <input type="text" id="username" name="username" value={formData.username} onChange={handleChange}
                        required minLength={3} placeholder="e.g. trader2024" className="form-input" disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="fullName" className="form-label">Full Name</label>
                    <input type="text" id="fullName" name="fullName" value={formData.fullName} onChange={handleChange}
                        required placeholder="Enter your full name" className="form-input" disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="email" className="form-label">Email Address</label>
                    <input type="email" id="email" name="email" value={formData.email} onChange={handleChange}
                        required placeholder="Enter your email" className="form-input" disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="phone" className="form-label">Phone Number</label>
                    <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange}
                        required placeholder="e.g. +44 7700 900000" className="form-input" disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password" className="form-label">Password</label>
                    <input type="password" id="password" name="password" value={formData.password} onChange={handleChange}
                        required minLength={6} placeholder="Create a password" className="form-input" disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                    <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                        required placeholder="Confirm your password" className="form-input" disabled={isLoading}
                    />
                </div>
                <button type="submit" className="login-button" disabled={isLoading}>
                    {isLoading ? 'SENDING...' : 'VERIFY EMAIL'}
                </button>
            </form>
            <div className="register-link">
                <p>Already have an account? <Link to="/login">Sign In</Link></p>
            </div>
        </div>
    );

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
                    <label htmlFor="email-code" className="form-label">Verification Code</label>
                    <input type="text" id="email-code" value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                        maxLength={6} required placeholder="Enter 6-digit code" className="form-input" disabled={isLoading}
                    />
                </div>
                <button type="submit" className="login-button" disabled={isLoading || emailCode.length !== 6}>
                    {isLoading ? 'VERIFYING...' : 'VERIFY CODE'}
                </button>
            </form>
            <div className="register-link">
                <p><button type="button" onClick={() => { setStep(1); setEmailCode(''); setError(''); setSuccess(''); }} className="link-button">Back</button></p>
            </div>
        </div>
    );

    const handleResendPhoneCode = async () => {
        setError("");
        setIsLoading(true);
        try {
            await Api.sendPhoneVerificationCode(formData.phone);
            setSuccess("Code resent to your phone.");
        } catch (err) {
            setError(err.message || "Failed to resend code.");
        } finally {
            setIsLoading(false);
        }
    };

    const renderStep3 = () => (
        <div className="login-form-container">
            <div className="form-header">
                <h2 className="login-title">VERIFY PHONE</h2>
                <p className="login-subtitle">Enter the 6-digit code sent to your phone</p>
                <p className="email-sent">Code sent to: {formData.phone}</p>
            </div>
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            <form onSubmit={handleVerifyPhoneCode}>
                <div className="form-group">
                    <label htmlFor="phone-code" className="form-label">SMS Code</label>
                    <input type="text" id="phone-code" value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                        maxLength={6} required placeholder="Enter 6-digit code" className="form-input" disabled={isLoading}
                    />
                </div>
                <button type="submit" className="login-button" disabled={isLoading || phoneCode.length !== 6}>
                    {isLoading ? 'VERIFYING...' : 'VERIFY & SIGN UP'}
                </button>
            </form>
            <div className="register-link">
                <p><button type="button" onClick={handleResendPhoneCode} className="link-button" disabled={isLoading}>Resend code</button></p>
                <p><button type="button" onClick={() => { setStep(2); setPhoneCode(''); setError(''); setSuccess(''); }} className="link-button">Back</button></p>
            </div>
        </div>
    );

    const renderStep4 = () => (
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
            <CosmicBackground />
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
        </div>
    );
}

export default SignUp;
