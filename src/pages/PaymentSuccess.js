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
        const isSubscription = params.get("subscription") === "true" || !courseIdFromUrl;
        
        // If this is a subscription payment, redirect to community after processing
        if (isSubscription && paymentSuccess === "true" && sessionId) {
            const userData = localStorage.getItem("user");
            const userId = userData ? JSON.parse(userData)?.id : null;
            
            if (userId) {
                const activateSubscription = async () => {
                    try {
                        const token = localStorage.getItem("token");
                        const response = await axios.post(
                            `${API_BASE_URL}/api/stripe/subscription-success`,
                            { userId, session_id: sessionId },
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            }
                        );
                        
                        if (response.data && response.data.success) {
                            // Verify subscription is actually active before redirecting
                            // Wait a moment for database to update, then verify
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Double-check subscription status from API
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
                                    
                                    // Update user role in localStorage
                                    const user = JSON.parse(localStorage.getItem('user') || '{}');
                                    user.role = 'premium';
                                    localStorage.setItem('user', JSON.stringify(user));
                                    
                                    setMessage("🎉 Subscription activated! All checks passed. Redirecting to community...");
                                    setProcessing(false);
                                    
                                    // Redirect to community after brief delay
                                    setTimeout(() => {
                                        window.location.href = '/community';
                                    }, 1500);
                                    return;
                                } else {
                                    throw new Error('Subscription verification failed');
                                }
                            } catch (verifyError) {
                                console.error('Subscription verification error:', verifyError);
                                setMessage("⚠️ Payment processed but subscription activation needs verification. Please contact support or wait a moment and refresh.");
                                setError(true);
                                setProcessing(false);
                                return;
                            }
                        } else {
                            throw new Error('Subscription activation failed');
                        }
                    } catch (error) {
                        console.error('Error activating subscription:', error);
                    }
                };
                
                activateSubscription();
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
                        setMessage(`🎉 Your purchase of "${courseTitle}" was successful! Course added and community access unlocked!`);
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
