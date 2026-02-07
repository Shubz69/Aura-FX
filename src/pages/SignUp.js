import React, { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from 'react-router-dom';
import "../styles/Login.css";
import CosmicBackground from '../components/CosmicBackground';
import { useAuth } from "../context/AuthContext";
import Api from '../services/Api';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';

function SignUp() {
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
    const [codesSent, setCodesSent] = useState(false); // true after "Send verification codes" – show email + phone OTP on same page
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

    /** Send both email and phone OTP on the same page; then show both code inputs. */
    const handleSendVerificationCodes = async (e) => {
        e.preventDefault();
        if (!validateStep1()) return;
        setIsLoading(true);
        setError("");
        setSuccess("");
        try {
            // Send phone OTP first (backend API – Twilio)
            try {
                const sendRes = await Api.sendPhoneVerificationCode(formData.phone);
                if (sendRes?.useFirebase) {
                    setError("Phone verification requires Twilio. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in Vercel.");
                    setIsLoading(false);
                    return;
                }
                if (!sendRes?.success && !sendRes?.useFirebase) {
                    setError("Could not send phone code. Configure Twilio for SMS verification.");
                    setIsLoading(false);
                    return;
                }
            } catch (phoneErr) {
                setError(phoneErr.message || "Could not send phone code. Configure Twilio for SMS verification.");
                setIsLoading(false);
                return;
            }
            const result = await Api.sendSignupVerificationEmail(formData.email, formData.username);
            if (result !== true && result !== undefined) {
                setError("Failed to send verification email. Please try again.");
                setIsLoading(false);
                return;
            }
            setCodesSent(true);
            setSuccess("Codes sent! Enter the 6-digit codes from your email and phone below.");
        } catch (err) {
            let msg = err.message || "Failed to send verification.";
            if (err.message?.includes("already exists")) msg = "An account with this email already exists. Please sign in.";
            if (err.message?.includes("already taken")) msg = "This username is already taken.";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    /** Verify both email and phone OTP, then register – all on the same page. */
    const handleVerifyAndSignUp = async (e) => {
        e.preventDefault();
        if (emailCode.length !== 6) {
            setError("Please enter the 6-digit code from your email.");
            return;
        }
        if (phoneCode.length !== 6) {
            setError("Please enter the 6-digit code from your phone.");
            return;
        }
        setIsLoading(true);
        setError("");
        try {
            const emailResult = await Api.verifySignupCode(formData.email, emailCode);
            if (!emailResult?.verified) {
                setError("Invalid or expired email code. Please check and try again.");
                setIsLoading(false);
                return;
            }
            const ok = await Api.verifyPhoneCode(formData.phone, phoneCode);
            if (!ok) {
                setError("Invalid or expired phone code.");
                setIsLoading(false);
                return;
            }
            const verifiedPhone = formData.phone.trim();
            setSuccess("Creating your account...");
            const response = await register({
                username: formData.username.trim(),
                name: formData.fullName.trim(),
                email: formData.email.trim().toLowerCase(),
                phone: verifiedPhone,
                password: formData.password
            });
            if (response && response.status !== "MFA_REQUIRED") {
                localStorage.setItem('pendingSubscription', 'true');
                localStorage.setItem('newSignup', 'true');
                navigate("/choose-plan");
            }
        } catch (err) {
            setError(err.message || "Verification failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendPhoneCode = async () => {
        setError("");
        setIsLoading(true);
        try {
            const sendRes = await Api.sendPhoneVerificationCode(formData.phone);
            if (sendRes?.useFirebase) setError("Configure Twilio for SMS verification.");
            else setSuccess("Code resent to your phone.");
        } catch (err) {
            setError(err.message || "Failed to resend code.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <CosmicBackground />
            <div className="login-form-container">
                <div className="form-header">
                    <h2 className="login-title">SIGN UP</h2>
                    <p className="login-subtitle">Create your account – verify email and phone on this page</p>
                </div>
                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <form onSubmit={handleSendVerificationCodes}>
                    <div className="form-group">
                        <label htmlFor="username" className="form-label">Username</label>
                        <input type="text" id="username" name="username" value={formData.username} onChange={handleChange}
                            required minLength={3} placeholder="e.g. trader2024" className="form-input" disabled={isLoading && !codesSent}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="fullName" className="form-label">Full Name</label>
                        <input type="text" id="fullName" name="fullName" value={formData.fullName} onChange={handleChange}
                            required placeholder="Enter your full name" className="form-input" disabled={isLoading && !codesSent}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">Email Address</label>
                        <input type="email" id="email" name="email" value={formData.email} onChange={handleChange}
                            required placeholder="Enter your email" className="form-input" disabled={isLoading && !codesSent}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="phone" className="form-label">Phone Number (any country)</label>
                        <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange}
                            required placeholder="e.g. +44 7700 900000 or +1 555 123 4567" className="form-input" disabled={isLoading && !codesSent}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password" className="form-label">Password</label>
                        <input type="password" id="password" name="password" value={formData.password} onChange={handleChange}
                            required minLength={6} placeholder="Create a password" className="form-input" disabled={isLoading && !codesSent}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                        <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                            required placeholder="Confirm your password" className="form-input" disabled={isLoading && !codesSent}
                        />
                    </div>
                    {!codesSent && (
                        <button type="submit" className="login-button" disabled={isLoading}>
                            {isLoading ? 'SENDING CODES...' : 'SEND VERIFICATION CODES'}
                        </button>
                    )}
                </form>

                {codesSent && (
                    <>
                        <hr style={{ margin: '1.25rem 0', borderColor: 'rgba(255,255,255,0.2)' }} />
                        <p className="login-subtitle" style={{ marginBottom: '1rem' }}>Enter the 6-digit codes sent to your email and phone</p>
                        <form onSubmit={handleVerifyAndSignUp}>
                            <div className="form-group">
                                <label htmlFor="email-code" className="form-label">Email code (sent to {formData.email})</label>
                                <input type="text" id="email-code" value={emailCode}
                                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                    maxLength={6} placeholder="6-digit code" className="form-input" disabled={isLoading}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="phone-code" className="form-label">Phone code (sent to {formData.phone})</label>
                                <input type="text" id="phone-code" value={phoneCode}
                                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                    maxLength={6} placeholder="6-digit code" className="form-input" disabled={isLoading}
                                />
                                <p><button type="button" onClick={handleResendPhoneCode} className="link-button" disabled={isLoading}>Resend phone code</button></p>
                            </div>
                            <button type="submit" className="login-button" disabled={isLoading || emailCode.length !== 6 || phoneCode.length !== 6}>
                                {isLoading ? 'VERIFYING...' : 'VERIFY & SIGN UP'}
                            </button>
                        </form>
                        <p style={{ marginTop: '1rem' }}>
                            <button type="button" onClick={() => { setCodesSent(false); setEmailCode(''); setPhoneCode(''); setError(''); setSuccess(''); }} className="link-button">Start over</button>
                        </p>
                    </>
                )}

                <div className="register-link" style={{ marginTop: '1.25rem' }}>
                    <p>Already have an account? <Link to="/login">Sign In</Link></p>
                </div>
            </div>
        </div>
    );
}

export default SignUp;
