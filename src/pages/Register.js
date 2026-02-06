import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import "../styles/Register.css";
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { useAuth } from '../context/AuthContext';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';
import { isFirebasePhoneEnabled, setupRecaptcha, sendPhoneOtp, confirmPhoneOtp } from '../utils/firebasePhoneAuth';
import { COUNTRY_CODES, toE164 } from '../utils/countryCodes';

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
    const [codesSent, setCodesSent] = useState(false); // true after "Send verification codes" – show email + phone OTP on same page
    const [firebaseOtpSent, setFirebaseOtpSent] = useState(false);
    const [phoneCountryCode, setPhoneCountryCode] = useState('+44');
    const [phoneNational, setPhoneNational] = useState('');
    const firebaseConfirmationRef = useRef(null);
    const useFirebasePhone = isFirebasePhoneEnabled();
    const { register: registerUser } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Keep formData.phone in sync with country code + national number (E.164)
    useEffect(() => {
        setFormData(prev => ({ ...prev, phone: toE164(phoneCountryCode, phoneNational) }));
    }, [phoneCountryCode, phoneNational]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const nextParam = params.get('next');
        const planParam = params.get('plan');
        if (!nextParam) {
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
    }, [location.pathname, location.search]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    /** Send both email and phone OTP on the same page; then show both code inputs. */
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
        const phoneDigits = (formData.phone || '').replace(/\D/g, '');
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
            const result = await Api.sendSignupVerificationEmail(formData.email, formData.username);
            if (result !== true && result !== undefined) {
                setError("Failed to send verification email. Please try again.");
                setIsLoading(false);
                return;
            }
            if (!useFirebasePhone) {
                try {
                    const sendRes = await Api.sendPhoneVerificationCode(formData.phone);
                    if (sendRes?.useFirebase) setError("Backend has Firebase but frontend is not configured. Add REACT_APP_FIREBASE_* or configure Twilio.");
                    else if (!sendRes?.success && !sendRes?.useFirebase) setError("Could not send phone code. Configure Firebase (free) or Twilio.");
                } catch (phoneErr) {
                    setError(phoneErr.message || "Could not send phone code. Configure Firebase (free) or Twilio.");
                    setIsLoading(false);
                    return;
                }
            }
            setCodesSent(true);
            setFirebaseOtpSent(false);
            setSuccess(useFirebasePhone ? "Email code sent! Click 'Send code' below to get your phone code." : "Codes sent! Enter the 6-digit codes from your email and phone below.");
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

    const handleSendFirebaseOtp = async () => {
        setIsLoading(true);
        setError("");
        try {
            const recaptcha = setupRecaptcha('recaptcha-container-register');
            if (!recaptcha) {
                setError("Firebase reCAPTCHA could not be loaded. Try refreshing the page.");
                setIsLoading(false);
                return;
            }
            const { confirmationResult } = await sendPhoneOtp(formData.phone, recaptcha);
            firebaseConfirmationRef.current = confirmationResult;
            setFirebaseOtpSent(true);
            setSuccess("Code sent! Enter the 6-digit code from your phone.");
        } catch (err) {
            const msg = err.message || "Failed to send code.";
            if (msg.includes('captcha') || msg.includes('recaptcha') || msg.includes('network')) {
                setError(msg + " Try completing the 'I'm not a robot' checkbox above, then click Send again.");
            } else {
                setError(msg + " Try again.");
            }
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
        if (useFirebasePhone && !firebaseOtpSent) {
            setError("Please click 'Send code' to get your phone verification code first.");
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
            let verifiedPhone = formData.phone.trim();
            if (useFirebasePhone && firebaseConfirmationRef.current) {
                const { idToken, phoneNumber } = await confirmPhoneOtp(firebaseConfirmationRef.current, phoneCode);
                const res = await Api.verifyPhoneWithFirebase(idToken);
                if (!res?.verified) {
                    setError("Invalid or expired phone code.");
                    setIsLoading(false);
                    return;
                }
                verifiedPhone = res.phone || phoneNumber || formData.phone;
            } else {
                const ok = await Api.verifyPhoneCode(formData.phone, phoneCode);
                if (!ok) {
                    setError("Invalid or expired phone code.");
                    setIsLoading(false);
                    return;
                }
            }
            setSuccess("Creating your account...");
            const submitData = {
                username: formData.username.trim(),
                email: formData.email.trim().toLowerCase(),
                phone: verifiedPhone,
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
                setFirebaseOtpSent(false);
            }
            setError(errorMsg);
            setIsLoading(false);
        }
    };

    const handleResendPhoneCode = async () => {
        setError("");
        setIsLoading(true);
        try {
            const sendRes = await Api.sendPhoneVerificationCode(formData.phone);
            if (sendRes?.useFirebase) setError("Use Firebase 'Send code' or configure Twilio.");
            else setSuccess("Code resent to your phone.");
        } catch (err) {
            setError(err.message || "Failed to resend code.");
        } finally {
            setIsLoading(false);
        }
    };

    // Single page: form, then email + phone OTP on same page
    return (
        <div className="register-container">
            <CosmicBackground />
            <div className="register-form-container">
                <div className="form-header">
                    <h2 className="register-title">SIGN UP</h2>
                    <p className="register-subtitle">Create your account – verify email and phone on this page</p>
                </div>
                {error ? <div className="error-message">{error}</div> : null}
                {success ? <div className="success-message">{success}</div> : null}

                {!codesSent && (
            <form onSubmit={handleSendVerificationCodes}>
                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor="username" className="form-label">Username</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            value={formData.username}
                            onChange={handleInputChange}
                            required
                            placeholder="Enter username"
                            className="form-input"
                            disabled={isLoading}
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">Email</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            required
                            placeholder="Enter email"
                            className="form-input"
                            disabled={isLoading}
                        />
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor="name" className="form-label">Full Name</label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            required
                            placeholder="Enter full name"
                            className="form-input"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="form-group form-group-phone">
                        <label htmlFor="phone-national" className="form-label">Phone Number (any country)</label>
                        <div className="phone-input-row">
                            <select
                                id="phone-country"
                                aria-label="Country code"
                                value={phoneCountryCode}
                                onChange={(e) => setPhoneCountryCode(e.target.value)}
                                className="form-input phone-country-select"
                                disabled={isLoading}
                            >
                                {COUNTRY_CODES.map(({ code, label }) => (
                                    <option key={code} value={code}>{label}</option>
                                ))}
                            </select>
                            <input
                                type="tel"
                                id="phone-national"
                                name="phoneNational"
                                value={phoneNational}
                                onChange={(e) => setPhoneNational(e.target.value.replace(/\D/g, ''))}
                                required
                                placeholder="e.g. 7700 900000"
                                className="form-input phone-national-input"
                                disabled={isLoading}
                                autoComplete="tel-national"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor="password" className="form-label">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={formData.password}
                            onChange={handleInputChange}
                            required
                            placeholder="Enter password"
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
                            onChange={handleInputChange}
                            required
                            placeholder="Confirm password"
                            className="form-input"
                            disabled={isLoading}
                        />
                    </div>
                </div>
                
                <div 
                    className="terms-checkbox" 
                    onClick={(e) => {
                        // If clicking on a link, don't toggle checkbox
                        if (e.target.tagName === 'A' || e.target.closest('a')) {
                            return;
                        }
                        // Toggle checkbox when clicking anywhere in the container
                        setAcceptedTerms(!acceptedTerms);
                    }}
                    onTouchStart={(e) => {
                        // Handle touch events for iOS
                        if (e.target.tagName === 'A' || e.target.closest('a')) {
                            return;
                        }
                        e.preventDefault();
                        setAcceptedTerms(!acceptedTerms);
                    }}
                >
                    <input
                        type="checkbox"
                        id="terms"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        onClick={(e) => {
                            e.stopPropagation();
                            setAcceptedTerms(e.target.checked);
                        }}
                        onTouchStart={(e) => {
                            e.stopPropagation();
                            setAcceptedTerms(!acceptedTerms);
                        }}
                        required
                        disabled={isLoading}
                    />
                    <label 
                        htmlFor="terms" 
                        onClick={(e) => {
                            // If clicking on a link, don't toggle
                            if (e.target.tagName === 'A' || e.target.closest('a')) {
                                return;
                            }
                            // Prevent default label behavior and let container handle it
                            e.preventDefault();
                            setAcceptedTerms(!acceptedTerms);
                        }}
                        onTouchStart={(e) => {
                            if (e.target.tagName === 'A' || e.target.closest('a')) {
                                return;
                            }
                            e.preventDefault();
                            setAcceptedTerms(!acceptedTerms);
                        }}
                    >
                        I agree to the <Link to="/terms" target="_blank" onClick={(e) => e.stopPropagation()}>Terms and Conditions</Link> and <Link to="/privacy" target="_blank" onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>
                    </label>
                </div>
                
                <button type="submit" className="register-button" disabled={isLoading}>
                    {isLoading ? 'SENDING CODES...' : 'SEND VERIFICATION CODES'}
                </button>
            </form>
                )}

                {codesSent && (
                    <>
                        <hr style={{ margin: '1.25rem 0', borderColor: 'rgba(255,255,255,0.2)' }} />
                        <p className="register-subtitle" style={{ marginBottom: '1rem' }}>Enter the 6-digit codes sent to your email and phone</p>
                        {useFirebasePhone && (
                            <div id="recaptcha-container-register" style={{ minHeight: 78, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }} />
                        )}
                        <form onSubmit={handleVerifyAndSignUp}>
                            <div className="form-group" style={{ maxWidth: '320px', margin: '0 auto 1rem' }}>
                                <label htmlFor="email-code-register" className="form-label">Email code (sent to {formData.email})</label>
                                <input
                                    type="text"
                                    id="email-code-register"
                                    value={emailCode}
                                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                    maxLength={6}
                                    placeholder="6-digit code"
                                    className="form-input"
                                    disabled={isLoading}
                                    style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '6px' }}
                                />
                            </div>
                            <div className="form-group" style={{ maxWidth: '320px', margin: '0 auto 1rem' }}>
                                <label htmlFor="phone-code-register" className="form-label">Phone code (sent to {formData.phone})</label>
                                {useFirebasePhone && !firebaseOtpSent ? (
                                    <div>
                                        <button type="button" className="register-button" onClick={handleSendFirebaseOtp} disabled={isLoading} style={{ marginBottom: '0.75rem' }}>
                                            {isLoading ? 'SENDING...' : 'SEND PHONE CODE'}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            id="phone-code-register"
                                            value={phoneCode}
                                            onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                            maxLength={6}
                                            placeholder="6-digit code"
                                            className="form-input"
                                            disabled={isLoading}
                                            style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '6px' }}
                                        />
                                        {useFirebasePhone && firebaseOtpSent && <p><button type="button" onClick={handleSendFirebaseOtp} className="link-button" disabled={isLoading} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>Resend phone code</button></p>}
                                        {!useFirebasePhone && <p><button type="button" onClick={handleResendPhoneCode} className="link-button" disabled={isLoading} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>Resend phone code</button></p>}
                                    </>
                                )}
                            </div>
                            {(firebaseOtpSent || !useFirebasePhone) && (
                                <button type="submit" className="register-button" disabled={isLoading || emailCode.length !== 6 || phoneCode.length !== 6} style={{ marginTop: '0.5rem' }}>
                                    {isLoading ? 'VERIFYING...' : 'VERIFY & SIGN UP'}
                                </button>
                            )}
                        </form>
                        <p style={{ marginTop: '1rem' }}>
                            <button type="button" onClick={() => { setCodesSent(false); setEmailCode(''); setPhoneCode(''); setPhoneCountryCode('+44'); setPhoneNational(''); setError(''); setSuccess(''); setFirebaseOtpSent(false); }} className="link-button" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>Start over</button>
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
