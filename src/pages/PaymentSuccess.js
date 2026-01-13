import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/PaymentSuccess.css";
import CosmicBackground from '../components/CosmicBackground';

// Define API base URL with fallback
const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.REACT_APP_API_URL || 'https://aurafx.com');

const PaymentSuccess = () => {
    const [message, setMessage] = useState("Processing your purchase...");
    const navigate = useNavigate();
    const location = useLocation();
    const [processing, setProcessing] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const courseIdFromUrl = params.get("courseId");
        const sessionId = params.get("session_id");
        const paymentSuccess = params.get("payment_success");
        const planParam = params.get("plan");
        const isSubscription = params.get("subscription") === "true" || !courseIdFromUrl;
        
        // Determine purchase type and name
        let purchaseType = "course";
        let purchaseName = "your course";
        
        if (isSubscription) {
            purchaseType = "subscription";
            // Determine subscription plan name
            if (planParam === "a7fx") {
                purchaseName = "A7FX Elite subscription";
            } else {
                purchaseName = "Aura FX subscription";
            }
            setMessage(`Purchasing ${purchaseName}...`);
        } else {
            const courseTitle = localStorage.getItem("purchasedCourseTitle") || "your course";
            purchaseName = courseTitle;
            setMessage(`Purchasing ${purchaseName}...`);
        }
        
        // If this is a subscription payment, redirect to community after processing
        if (isSubscription && (paymentSuccess === "true" || sessionId || params.get("redirect_status") === "succeeded")) {
            const userData = localStorage.getItem("user");
            const userId = userData ? JSON.parse(userData)?.id : null;
            
            if (userId) {
                const activateSubscription = async () => {
                    try {
                        const token = localStorage.getItem("token");
                        const response = await axios.post(
                            `${API_BASE_URL}/api/stripe/subscription-success`,
                            { 
                                userId, 
                                session_id: sessionId || `stripe-${Date.now()}`,
                                plan: planParam || 'aura' // Pass plan type to backend
                            },
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            }
                        );
                        
                        if (response.data && response.data.success) {
                            // Wait a moment for database to update
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // Verify subscription status from API
                            try {
                                const verifyResponse = await axios.get(
                                    `${API_BASE_URL}/api/subscription/check`,
                                    {
                                        params: { userId },
                                        headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                        }
                                    }
                                );
                                
                                if (verifyResponse.data && verifyResponse.data.hasActiveSubscription && !verifyResponse.data.paymentFailed) {
                                    // All checks passed - update localStorage
                                    localStorage.setItem('hasActiveSubscription', 'true');
                                    if (verifyResponse.data.expiry) {
                                        localStorage.setItem('subscriptionExpiry', verifyResponse.data.expiry);
                                    }
                                    
                                    // Update user role in localStorage based on plan
                                    const user = JSON.parse(localStorage.getItem('user') || '{}');
                                    // Set role based on plan: 'a7fx' for A7FX Elite, 'premium' for Aura FX
                                    if (planParam === 'a7fx' || planParam === 'A7FX' || planParam === 'elite') {
                                        user.role = 'a7fx';
                                    } else {
                                        user.role = 'premium'; // Default to premium for 'aura' or any other plan
                                    }
                                    user.subscription_status = 'active';
                                    user.subscription_plan = planParam || 'aura';
                                    localStorage.setItem('user', JSON.stringify(user));
                                    
                                    // Show success message before redirect
                                    setMessage(`Purchased ${purchaseName}!`);
                                    setProcessing(false);
                                    
                                    // Clear URL params
                                    window.history.replaceState({}, document.title, window.location.pathname);
                                    
                                    // Redirect to community after a brief delay to show success message
                                    setTimeout(() => {
                                        window.location.href = '/community';
                                    }, 1500);
                                    return;
                                } else {
                                    // Retry once more after another second
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    const retryResponse = await axios.get(
                                        `${API_BASE_URL}/api/subscription/check`,
                                        {
                                            params: { userId },
                                            headers: {
                                                'Authorization': `Bearer ${token}`,
                                                'Content-Type': 'application/json'
                                            }
                                        }
                                    );
                                    
                                    if (retryResponse.data && retryResponse.data.hasActiveSubscription && !retryResponse.data.paymentFailed) {
                                        localStorage.setItem('hasActiveSubscription', 'true');
                                        if (retryResponse.data.expiry) {
                                            localStorage.setItem('subscriptionExpiry', retryResponse.data.expiry);
                                        }
                                        const user = JSON.parse(localStorage.getItem('user') || '{}');
                                        // Set role based on plan: 'a7fx' for A7FX Elite, 'premium' for Aura FX
                                        if (planParam === 'a7fx' || planParam === 'A7FX' || planParam === 'elite') {
                                            user.role = 'a7fx';
                                        } else {
                                            user.role = 'premium'; // Default to premium for 'aura' or any other plan
                                        }
                                        user.subscription_status = 'active';
                                        user.subscription_plan = planParam || 'aura';
                                        localStorage.setItem('user', JSON.stringify(user));
                                        
                                        // Show success message before redirect
                                        setMessage(`Purchased ${purchaseName}!`);
                                        setProcessing(false);
                                        
                                        window.history.replaceState({}, document.title, window.location.pathname);
                                        
                                        // Redirect to community after a brief delay to show success message
                                        setTimeout(() => {
                                            window.location.href = '/community';
                                        }, 1500);
                                        return;
                                    }
                                    
                                    throw new Error('Subscription verification failed after retry');
                                }
                            } catch (verifyError) {
                                console.error('Subscription verification error:', verifyError);
                                // Still redirect to community - the check there will handle it
                                window.history.replaceState({}, document.title, window.location.pathname);
                                window.location.href = '/community';
                                return;
                            }
                        } else {
                            // Still redirect to community even if activation failed
                            window.history.replaceState({}, document.title, window.location.pathname);
                            window.location.href = '/community';
                            return;
                        }
                    } catch (error) {
                        console.error('Error activating subscription:', error);
                        // Still redirect to community
                        window.history.replaceState({}, document.title, window.location.pathname);
                        window.location.href = '/community';
                        return;
                    }
                };
                
                activateSubscription();
                return; // Don't continue with course purchase flow
            }
        }
        
        const completePurchase = async () => {
            try {
                const token = localStorage.getItem("token");
                const courseId = courseIdFromUrl || localStorage.getItem("purchasedCourseId");
                const courseTitle = localStorage.getItem("purchasedCourseTitle") || "your course";
                const userData = localStorage.getItem("user");
                const userId = userData ? JSON.parse(userData)?.id : null;
                
                console.log("Completing purchase for course:", courseId, "with session:", sessionId);

                if (!courseId) {
                    setMessage("Missing course information. Please try again or contact support.");
                    setError(true);
                    setProcessing(false);
                    return;
                }
                
                if (!token) {
                    setMessage("Authentication error. Please log in before continuing.");
                    setError(true);
                    setProcessing(false);
                    // Don't automatically redirect - let user click button
                    return;
                }

                try {
                    // Notify backend about successful purchase with session ID if available
                    console.log(`Sending payment completion request to ${API_BASE_URL}/api/payments/complete`);
                    
                    const response = await axios.post(
                        `${API_BASE_URL}/api/payments/complete`,
                        { 
                            courseId, 
                            sessionId: sessionId || undefined,
                            // Include timestamp for better tracking
                            timestamp: new Date().toISOString()
                        },
                        { 
                            headers: { 
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    console.log("Payment completion response:", response.data);

                    if (userId) {
                        try {
                            // Fetch updated course list
                            console.log(`Fetching updated courses for user ${userId}`);
                            const res = await axios.get(`${API_BASE_URL}/api/users/${userId}/courses`, {
                                headers: { 
                                    'Authorization': `Bearer ${token}`,
                                    'Accept': 'application/json'
                                }
                            });

                            if (res.data) {
                                const purchasedCourseIds = res.data.map(c => c.courseId || c.id);
                                console.log("Updated user courses:", purchasedCourseIds);
                                localStorage.setItem('userCourses', JSON.stringify(purchasedCourseIds));
                            }
                        } catch (err) {
                            console.warn("Error updating user courses list:", err);
                            // Non-fatal error, continue with success message
                        }
                    }

                    if (response.status === 200) {
                        setMessage(`🎉 Purchased ${courseTitle}! Course added and community access unlocked!`);
                    } else {
                        setMessage("Your payment was processed but there was an issue with course enrollment. Please contact support.");
                        setError(true);
                    }
                } catch (error) {
                    console.error("Error completing purchase with API:", error);
                    if (error.response && error.response.status === 403) {
                        setMessage("Authentication error. Please log in and try again.");
                    } else if (error.response) {
                        setMessage(`Error: ${error.response.data?.message || "Failed to enroll in the course. Please contact support."}`);
                    } else {
                        setMessage("Error completing your purchase. Please contact support with your confirmation number.");
                    }
                    setError(true);
                }
                
                setProcessing(false);
                
            } catch (error) {
                console.error("Error:", error);
                setMessage("Something went wrong. Please contact support or try again.");
                setError(true);
                setProcessing(false);
            }

            // Clear stored course ID after processing
            localStorage.removeItem("purchasedCourseId");
            localStorage.removeItem("purchasedCourseTitle");
        };

        completePurchase();
    }, [location.search]);

    const handleLogin = () => {
        navigate("/login", { state: { returnUrl: "/my-courses" } });
    };

    return (
        <div className="payment-success-container">
            <CosmicBackground />
            <div className="payment-success-card">
                <div className={`success-icon ${error ? "error" : ""}`}>
                    {error ? "❌" : "✅"}
                </div>
                <h2 className="payment-title">
                    {error ? "PROCESSING ERROR" : "PAYMENT SUCCESSFUL"}
                </h2>
                
                {processing ? (
                    <div className="processing-indicator">
                        <div className="spinner"></div>
                        <p>{message}</p>
                    </div>
                ) : (
                    <p className="success-message">{message}</p>
                )}
                
                <div className="action-buttons">
                    {error && !localStorage.getItem("token") ? (
                        <button 
                            onClick={handleLogin} 
                            className="primary-button"
                        >
                            Log In
                        </button>
                    ) : (
                        <button 
                            onClick={() => navigate("/my-courses")} 
                            className="primary-button"
                        >
                            Go to My Courses
                        </button>
                    )}
                    <button 
                        onClick={() => navigate("/courses")} 
                        className="secondary-button"
                    >
                        Browse More Courses
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;
