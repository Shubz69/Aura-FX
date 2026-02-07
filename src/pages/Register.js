import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import "../styles/Register.css";
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { useAuth } from '../context/AuthContext';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';
import { toE164 } from '../utils/countryCodes.js';
import PhoneCountrySelect from '../components/PhoneCountrySelect';

const Register = () => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        name: ''
    });
    const [emailCode, setEmailCode] = useState('');
    const [phoneCode, setPhoneCode] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [codesSent, setCodesSent] = useState(false);
    const [phoneCountryCode, setPhoneCountryCode] = useState('+44');
    const [phoneNational, setPhoneNational] = useState('');
    const { register: registerUser } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        setFormData(prev => ({ ...prev, phone: toE164(phoneCountryCode, phoneNational) }));
    }, [phoneCountryCode, phoneNational]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const nextParam = params.get('next');
        const planParam = params.get('plan');
        if (!nextParam) return;
        const existing = loadPostAuthRedirect();
        if (!existing || existing.next !== nextParam || (existing.plan || null) !== (planParam ? planParam.toLowerCase() : null)) {
            savePostAuthRedirect({ next: nextParam, plan: planParam, from: `${location.pathname}${location.search}` });
        }
    }, [location.pathname, location.search]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSendVerificationCodes = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (formData.username.length < 3) {
            setError('Username must be at least 3 characters long');
            return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
            setError('Username can only contain letters, numbers, hyphens, and underscores');
            return;
        }
        if (!formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
            setError('All fields are required.');
            return;
        }
        if (!phoneCountryCode || !phoneCountryCode.startsWith('+')) {
            setError('Please select a country code.');
            return;
        }
        const phoneDigits = (phoneNational || '').replace(/\D/g, '');
        if (!phoneDigits.trim() || phoneDigits.length < 10) {
            setError('Valid phone number is required (10+ digits).');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        if (!acceptedTerms) {
            setError('Please accept the terms and conditions');
            return;
        }
        setIsLoading(true);
        try {
            const sendRes = await Api.sendPhoneVerificationCode(formData.phone);
            if (!sendRes?.success) {
                setError(sendRes?.message || "Could not send phone code. Please try again.");
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
            setSuccess("Codes sent! Enter the 6-digit codes from your email and phone.");
        } catch (err) {
            let errorMsg = err.message || "Failed to send verification.";
            if (err.message && err.message.includes("already exists")) errorMsg = "An account with this email already exists. Please sign in.";
            if (err.message && err.message.includes("already taken")) errorMsg = "This username is already taken.";
            if (err.message && err.message.includes("not configured")) errorMsg = "Email service is temporarily unavailable. Please try again later.";
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

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
            setSuccess("Creating your account...");
            const submitData = {
                username: formData.username.trim(),
                email: formData.email.trim().toLowerCase(),
                phone: formData.phone.trim(),
                password: formData.password,
                name: (formData.name || '').trim(),
                avatar: '/avatars/avatar_ai.png'
            };
            localStorage.setItem('newSignup', 'true');
            localStorage.setItem('pendingSubscription', 'true');
            const response = await registerUser(submitData);
            setIsLoading(false);
            toast.success('🎉 Account created successfully! Welcome to AURA FX!', {
                position: "top-center",
                autoClose: 1500,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
            });
            if (response && response.status !== "MFA_REQUIRED") {
                navigate("/choose-plan");
            }
        } catch (err) {
            let errorMsg = err.message || "Verification failed. Please try again.";
            if (err.message && (err.message.includes('already exists') || err.message.includes('already taken'))) {
                setCodesSent(false);
                setEmailCode('');
                setPhoneCode('');
            }
            setError(errorMsg);
            setIsLoading(false);
        }
    };

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

    const handleResendEmailCode = async () => {
        setError("");
        setIsLoading(true);
        try {
            await Api.sendSignupVerificationEmail(formData.email, formData.username);
            setSuccess("Code resent to your email.");
        } catch (err) {
            setError(err.message || "Failed to resend code.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="register-container">
            <CosmicBackground />
            <div className="register-form-container">
                <div className="form-header">
                    <h2 className="register-title">SIGN UP</h2>
                    <p className="register-subtitle">Create your account – verify email and phone</p>
                </div>
                {error ? <div className="error-message">{error}</div> : null}
                {success ? <div className="success-message">{success}</div> : null}

                {!codesSent && (
                    <form onSubmit={handleSendVerificationCodes}>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="username" className="form-label">Username</label>
                                <input type="text" id="username" name="username" value={formData.username} onChange={handleInputChange}
                                    required placeholder="Enter username" className="form-input" disabled={isLoading} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="email" className="form-label">Email</label>
                                <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange}
                                    required placeholder="Enter email" className="form-input" disabled={isLoading} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="name" className="form-label">Full Name</label>
                                <input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange}
                                    required placeholder="Enter full name" className="form-input" disabled={isLoading} />
                            </div>
                            <div className="form-group form-group-phone">
                                <label htmlFor="phone-national" className="form-label">Phone Number (any country)</label>
                                <div className="phone-input-row">
                                    <PhoneCountrySelect id="phone-country" value={phoneCountryCode} onChange={setPhoneCountryCode} disabled={isLoading} />
                                    <input type="tel" id="phone-national" name="phoneNational" value={phoneNational}
                                        onChange={(e) => { const v = e.target.value.replace(/[^\d\s]/g, ''); setPhoneNational(v); }}
                                        required placeholder="e.g. 201 555 5555" className="form-input phone-national-input" disabled={isLoading}
                                        autoComplete="tel-national" maxLength={20} />
                                </div>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="password" className="form-label">Password</label>
                                <input type="password" id="password" name="password" value={formData.password} onChange={handleInputChange}
                                    required placeholder="Enter password" className="form-input" disabled={isLoading} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                                <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange}
                                    required placeholder="Confirm password" className="form-input" disabled={isLoading} />
                            </div>
                        </div>
                        <label className="terms-checkbox" htmlFor="terms">
                            <input type="checkbox" id="terms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} required disabled={isLoading} />
                            <span className="terms-checkbox-text">
                                I agree to the <Link to="/terms" target="_blank" onClick={(e) => e.stopPropagation()}>Terms</Link> and <Link to="/privacy" target="_blank" onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>
                            </span>
                        </label>
                        <button type="submit" className="register-button" disabled={isLoading}>
                            {isLoading ? 'SENDING CODES...' : 'SEND VERIFICATION CODES'}
                        </button>
                    </form>
                )}

                {codesSent && (
                    <>
                        <hr style={{ margin: '1.25rem 0', borderColor: 'rgba(255,255,255,0.2)' }} />
                        <p className="register-subtitle" style={{ marginBottom: '1rem' }}>Enter the 6-digit codes sent to your email and phone</p>
                        <form onSubmit={handleVerifyAndSignUp}>
                            <div className="verification-code-group">
                                <label htmlFor="email-code-register" className="form-label">Email code (sent to {formData.email})</label>
                                <input type="text" id="email-code-register" value={emailCode}
                                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').substring(0, 6))} maxLength={6} placeholder="6-digit code"
                                    className="verification-code-input" disabled={isLoading} />
                                <p><button type="button" onClick={handleResendEmailCode} className="link-button" disabled={isLoading} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>Resend email code</button></p>
                            </div>
                            <div className="verification-code-group">
                                <label htmlFor="phone-code-register" className="form-label">Phone code (sent to {formData.phone})</label>
                                <input type="text" id="phone-code-register" value={phoneCode}
                                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').substring(0, 6))} maxLength={6} placeholder="6-digit code"
                                    className="verification-code-input" disabled={isLoading} />
                                <p><button type="button" onClick={handleResendPhoneCode} className="link-button" disabled={isLoading} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>Resend phone code</button></p>
                            </div>
                            <button type="submit" className="register-button" disabled={isLoading || emailCode.length !== 6 || phoneCode.length !== 6} style={{ marginTop: '0.5rem' }}>
                                {isLoading ? 'VERIFYING...' : 'VERIFY & SIGN UP'}
                            </button>
                        </form>
                        <p style={{ marginTop: '1rem' }}>
                            <button type="button" onClick={() => { setCodesSent(false); setEmailCode(''); setPhoneCode(''); setPhoneCountryCode('+44'); setPhoneNational(''); setError(''); setSuccess(''); }} className="link-button" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>Start over</button>
                        </p>
                    </>
                )}

                <div className="login-link" style={{ marginTop: '1.25rem' }}>
                    <p>Already have an account? <Link to="/login">Sign In</Link></p>
                </div>
            </div>
        </div>
    );
};

export default Register;
