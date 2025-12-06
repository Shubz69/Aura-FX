import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/VerifyMFA.css";
import BinaryBackground from '../components/BinaryBackground';

const VerifyMFA = () => {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [timer, setTimer] = useState(30);
    const [canResend, setCanResend] = useState(false);
    const [userId, setUserId] = useState(null);
    const [emailAddress, setEmailAddress] = useState("");
    const navigate = useNavigate();
    const location = useLocation();
    const { login, user, verifyMfa } = useAuth();

    // Check if we have the necessary data and should show this component
    useEffect(() => {
        console.log('VerifyMFA mounted with state:', location.state);
        
        // Get MFA verification status from localStorage
        const mfaVerified = localStorage.getItem("mfaVerified") === "true";
        
        // Get stored MFA email and userId from localStorage (as backup)
        const storedEmail = localStorage.getItem("mfaEmail");
        const storedUserId = localStorage.getItem("mfaUserId");
        
        // Try to get userId and email from location state or localStorage
        const userIdFromState = location.state?.userId;
        const emailFromState = location.state?.email;
        
        // Set userId and email, preferring location state but falling back to localStorage
        setUserId(userIdFromState || storedUserId);
        setEmailAddress(emailFromState || storedEmail || "your email");
        
        console.log('Using userId:', userIdFromState || storedUserId);
        console.log('Using email:', emailFromState || storedEmail);
        
        // If user accessed this page directly without going through login or register,
        // or if MFA is already verified, redirect away
        if (mfaVerified) {
            console.log('MFA verification already completed, redirecting');
            const hasActiveSubscription = localStorage.getItem('hasActiveSubscription') === 'true';
            const pendingSubscription = localStorage.getItem('pendingSubscription') === 'true';
            const isAdmin = user?.role === 'ADMIN';
            
            if (!isAdmin && !hasActiveSubscription && !pendingSubscription) {
                navigate('/subscription');
            } else {
                navigate(location.state?.returnUrl || "/community");
            }
            return;
        }
        
        // If user is ADMIN, they don't need MFA verification
        if (user && user.role === 'ADMIN') {
            console.log('Admin user detected, bypassing MFA');
            localStorage.setItem("mfaVerified", "true");
            verifyMfa();
            navigate(location.state?.returnUrl || "/community");
            return;
        }
        
        // If we don't have userId from state and can't retrieve from localStorage, 
        // redirect to login
        if (!userIdFromState && !storedUserId && !storedEmail) {
            console.error('Missing required MFA data, redirecting to login');
            navigate("/login");
            return;
        }
    }, [user, navigate, location.state, verifyMfa]);

    // Get the user data from location state or defaults
    // eslint-disable-next-line no-unused-vars
    const userData = location.state?.userData || {};
    
    // Setup countdown timer for resending code
    useEffect(() => {
        let interval = null;
        if (timer > 0) {
            interval = setInterval(() => {
                setTimer(seconds => seconds - 1);
            }, 1000);
        } else {
            setCanResend(true);
        }
        return () => clearInterval(interval);
    }, [timer]);


    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        if (!code || code.length !== 6) {
            setError("Please enter a valid 6-digit code");
            setIsLoading(false);
            return;
        }

        try {
            const API_BASE_URL = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' && window.location.origin.includes('theglitch.world') ? window.location.origin : 'https://www.theglitch.world');
            const res = await axios.post(`${API_BASE_URL}/api/auth/verify-mfa`, {
                userId,
                code,
                email: emailAddress // Send email as a backup if userId is missing
            });

            // Only login if verification is successful
            if (res.data && res.data.token) {
                // Set token in localStorage
                localStorage.setItem("token", res.data.token);
                
                // If there's a refreshToken in the response, store it
                if (res.data.refreshToken) {
                    localStorage.setItem("refreshToken", res.data.refreshToken);
                }
                
                // Mark MFA as verified
                localStorage.setItem("mfaVerified", "true");
                
                // Update auth context with user data
                login(
                    res.data.token, 
                    res.data.role,
                    {
                        id: res.data.id,
                        username: res.data.username,
                        email: res.data.email,
                        name: res.data.name,
                        avatar: res.data.avatar,
                        phone: res.data.phone || "",
                        address: res.data.address || ""
                    }
                );
                
                // Call the verifyMfa function to update state
                verifyMfa();

                // Check subscription status after MFA verification
                const hasActiveSubscription = localStorage.getItem('hasActiveSubscription') === 'true';
                const pendingSubscription = localStorage.getItem('pendingSubscription') === 'true';
                const isAdmin = res.data.role === 'ADMIN';
                
                // If no subscription and not admin, redirect to subscription page
                if (!isAdmin && !hasActiveSubscription && !pendingSubscription) {
                    navigate('/subscription');
                } else {
                    // Navigate to returnUrl if provided, otherwise to community
                    navigate(location.state?.returnUrl || "/community");
                }
            } else {
                throw new Error("Invalid response from server");
            }
        } catch (err) {
            console.error("MFA verification error:", err);
            setError(err.response?.data?.message || "Invalid code. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendCode = async () => {
        setError("");
        setIsLoading(true);
        
        try {
            // Send either userId or email depending on what we have
            const payload = userId ? { userId } : { email: emailAddress };
            
            const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://www.theglitch.world';
            await axios.post(`${API_BASE_URL}/api/auth/send-mfa`, { ...payload, resend: true });
            setTimer(30);
            setCanResend(false);
            alert("Code resent to your email.");
        } catch (err) {
            setError("Failed to resend code. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const navigateToSupport = () => {
        navigate("/contact-us", { 
            state: { 
                fromMfa: true,
                userEmail: emailAddress 
            } 
        });
    };

    return (
        <div className="login-container">
            <BinaryBackground />
            
            <div className="login-box">
                <h2 className="gradient-text">🔐 MFA VERIFICATION</h2>
                <p>Please enter the 6-digit code sent to your email.</p>
                <p className="email-sent">Code sent to: {emailAddress}</p>

                {error && <p className="error-message">{error}</p>}

                <form onSubmit={handleSubmit}>
                    <div className="code-input-container">
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                            placeholder="Enter 6-digit code"
                            maxLength={6}
                            className="code-input"
                            required
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="verify-btn" 
                        disabled={isLoading || code.length !== 6}
                    >
                        {isLoading ? "Verifying..." : "Verify Code"}
                    </button>
                </form>

                <div className="resend-container">
                    <button
                        className="resend-btn"
                        onClick={handleResendCode}
                        disabled={!canResend || isLoading}
                    >
                        {canResend ? "Resend Code" : `Resend Code (${timer}s)`}
                    </button>
                </div>

                <div className="support-container">
                    <p>Having trouble with verification?</p>
                    <button 
                        className="support-btn" 
                        onClick={navigateToSupport}
                    >
                        Contact Support
                    </button>
                </div>

                <div className="back-link">
                    <Link to="/login">← Back to Login</Link>
                </div>
            </div>
        </div>
    );
};

export default VerifyMFA;
