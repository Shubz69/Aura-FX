import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import "../styles/Register.css";
import BinaryBackground from '../components/BinaryBackground';
import Api from '../services/Api';
import { useAuth } from '../context/AuthContext';
// Import avatar images
// import avatar1 from '../../public/avatars/avatar_ai.png';
// import avatar2 from '../../public/avatars/avatar_money.png';
// import avatar3 from '../../public/avatars/avatar_tech.png';
// import avatar4 from '../../public/avatars/avatar_trading.png';

const Register = () => {
    const [step, setStep] = useState(1); // 1: email/password entry, 2: email verification code, 3: complete registration
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        name: ''
    });
    const [verificationCode, setVerificationCode] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [emailVerified, setEmailVerified] = useState(false);
    const { register: registerUser } = useAuth();

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Step 1: Send verification email - REQUIRED before signup
    const handleSendVerificationEmail = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validate username
        if (formData.username.length < 3) {
            setError('Username must be at least 3 characters long');
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
            setError('Username can only contain letters, numbers, hyphens, and underscores');
            return;
        }

        if (!formData.email || !formData.password || !formData.confirmPassword) {
            setError('All fields are required.');
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
            // Send verification code to email - MUST succeed before proceeding
            // Also checks username availability
            const result = await Api.sendSignupVerificationEmail(formData.email, formData.username);
            
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
            let errorMsg = error.message || "Failed to send verification email. Please check your email address and try again.";
            
            if (error.message && error.message.includes("already exists")) {
                errorMsg = "An account with this email already exists. Please sign in instead.";
            } else if (error.message && error.message.includes("already taken")) {
                errorMsg = "This username is already taken. Please choose a different username.";
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
        setError('');
        setIsLoading(true);

        if (verificationCode.length !== 6) {
            setError('Please enter a valid 6-digit code.');
            setIsLoading(false);
            return;
        }

        // Prevent multiple verification attempts
        if (emailVerified) {
            // Already verified - don't show error, just proceed
            setIsLoading(false);
            return;
        }

        try {
            const result = await Api.verifySignupCode(formData.email, verificationCode);
            
            if (result && result.verified) {
                // Clear ALL previous messages
                setError("");
                setSuccess("Email verified successfully! Completing registration...");
                setEmailVerified(true);
                
                // Store verification status in localStorage as backup
                localStorage.setItem('emailVerified', 'true');
                
                // Set step and loading state
                setStep(3);
                setIsLoading(true); // Keep loading state for registration
                
                // Wait a moment for state to update, then proceed to registration
                setTimeout(() => {
                    handleCompleteRegistration();
                }, 100);
            } else {
                setError("Invalid verification code. Please check your email and try again.");
                setSuccess(""); // Clear success message
                setIsLoading(false);
            }
        } catch (err) {
            console.error("Code verification error:", err);
            setError(err.message || "Invalid verification code. Please try again.");
            setSuccess(""); // Clear success message
            setIsLoading(false);
        }
    };

    // Step 3: Complete registration after email verification
    const handleCompleteRegistration = async () => {
        // Double-check email is verified (use state directly if needed)
        const isVerified = emailVerified || localStorage.getItem('emailVerified') === 'true';
        
        if (!isVerified) {
            setError("Email must be verified before registration can complete.");
            setSuccess(""); // Clear success message when showing error
            setStep(2); // Go back to verification step
            setIsLoading(false);
            return;
        }

        // Prevent multiple registration attempts
        if (isLoading && step === 3) {
            return;
        }

        setIsLoading(true);
        setError(''); // Clear any errors
        setSuccess('Completing registration...');

        try {
            const submitData = {
                username: formData.username,
                email: formData.email,
                password: formData.password,
                name: formData.name,
                avatar: '/avatars/avatar_ai.png'
            };

            localStorage.setItem('newSignup', 'true');
            localStorage.removeItem('emailVerified');

            await registerUser(submitData);
            setIsLoading(false);

            toast.success('🎉 Account created successfully! Welcome to The Glitch!', {
                position: "top-center",
                autoClose: 1500,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
            });

            setError('');
            setSuccess('');
        } catch (err) {
            console.error('Registration error:', err);
            let errorMsg = err.message || 'Registration failed. Please try again.';
            
            // If username or email conflict, go back to step 1 so user can fix it
            if (err.message && (err.message.includes('already exists') || err.message.includes('already taken'))) {
                setStep(1);
                setEmailVerified(false); // Reset verification since we need to start over
                setVerificationCode('');
                errorMsg = err.message;
            }
            
            setError(errorMsg);
            setIsLoading(false);
        }
    };

    // Step 1: Email, password, and user info entry
    const renderStep1 = () => (
        <div className="register-form-container">
            <div className="form-header">
                <h2 className="register-title">SIGN UP</h2>
                <p className="register-subtitle">Create your new account</p>
            </div>
            
            {/* Only show one message at a time - error takes priority */}
            {error ? (
                <div className="error-message">{error}</div>
            ) : success ? (
                <div className="success-message">{success}</div>
            ) : null}
            
            <form onSubmit={handleSendVerificationEmail}>
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
                
                <div className="terms-checkbox">
                    <input
                        type="checkbox"
                        id="terms"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        required
                        disabled={isLoading}
                    />
                    <label htmlFor="terms">
                        I agree to the <a href="/terms" target="_blank">Terms and Conditions</a> and <a href="/privacy" target="_blank">Privacy Policy</a>
                    </label>
                </div>
                
                <button type="submit" className="register-button" disabled={isLoading}>
                    {isLoading ? 'SENDING VERIFICATION CODE...' : 'SEND VERIFICATION CODE'}
                </button>
            </form>
            
            <div className="login-link">
                <p>Already have an account? <Link to="/login">Sign In</Link></p>
            </div>
        </div>
    );

    // Step 2: Email verification code entry
    const renderStep2 = () => (
        <div className="register-form-container">
            <div className="form-header">
                <h2 className="register-title">VERIFY EMAIL</h2>
                <p className="register-subtitle">Enter the 6-digit code sent to your email</p>
                <p style={{ color: '#a78bfa', fontSize: '14px', marginTop: '10px' }}>Code sent to: {formData.email}</p>
            </div>
            
            {/* Only show one message at a time - error takes priority */}
            {error ? (
                <div className="error-message">{error}</div>
            ) : success ? (
                <div className="success-message">{success}</div>
            ) : null}
            
            <form onSubmit={handleVerifyEmailCode}>
                <div className="form-group" style={{ maxWidth: '300px', margin: '0 auto' }}>
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
                        style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }}
                    />
                </div>
                
                <button 
                    type="submit" 
                    className="register-button"
                    disabled={isLoading || verificationCode.length !== 6 || emailVerified}
                    style={{ marginTop: '20px' }}
                >
                    {isLoading ? (emailVerified ? 'COMPLETING REGISTRATION...' : 'VERIFYING...') : 'VERIFY CODE'}
                </button>
            </form>
            
            <div className="login-link" style={{ marginTop: '20px' }}>
                <p>Didn't receive the code? <button type="button" onClick={handleSendVerificationEmail} className="link-button" disabled={isLoading} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', textDecoration: 'underline' }}>Resend Code</button></p>
                <p><button type="button" onClick={() => { setStep(1); setVerificationCode(''); setError(''); setSuccess(''); }} className="link-button" style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', textDecoration: 'underline' }}>Back to Sign Up</button></p>
            </div>
        </div>
    );

    // Step 3: Completing registration (loading state)
    const renderStep3 = () => (
        <div className="register-form-container">
            <div className="form-header">
                <h2 className="register-title">CREATING ACCOUNT</h2>
                <p className="register-subtitle">Please wait while we create your account...</p>
            </div>
            
            {/* Only show one message at a time - error takes priority */}
            {error ? (
                <div className="error-message">{error}</div>
            ) : success ? (
                <div className="success-message">{success}</div>
            ) : null}
            
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
            </div>
        </div>
    );

    return (
        <div className="register-container">
            <BinaryBackground />
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
        </div>
    );
};

export default Register;
