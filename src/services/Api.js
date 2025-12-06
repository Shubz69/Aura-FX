import axios from 'axios';

// Define a fixed API base URL with proper fallback
// Automatically detect the origin to avoid CORS issues with www redirects
const getApiBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }

    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }
    
    return 'https://theglitch.world';
};

const API_BASE_URL = getApiBaseUrl();

// List of endpoints that should be accessible without authentication
const PUBLIC_ENDPOINTS = [
    '/api/courses',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/password-reset',
    '/api/auth/send-signup-verification',
    '/api/auth/verify-signup-code'
];

// Helper function to check if a URL is public
const isPublicUrl = (url) => {
    return PUBLIC_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Check if user has valid authentication
const hasValidAuth = () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    try {
        // Basic validation - check if token has expected format
        const parts = token.split('.');
        
        // Validate token structure
        if (parts.length !== 3) {
            console.error('Invalid token structure');
            return false;
        }
        
        // Try to decode token
        const payload = JSON.parse(atob(parts[1]));
        const currentTime = Date.now() / 1000;
        
        // Check if token is expired
        if (payload.exp && payload.exp < currentTime) {
            console.error('Token has expired');
            // Clean up expired token
            localStorage.removeItem('token');
            return false;
        }
        
        return true;
    } catch (err) {
        console.error('Token validation error:', err);
        return false;
    }
};

// Helper function to determine if a request should proceed
const shouldMakeRequest = (url) => {
    // Allow requests to public endpoints
    if (isPublicUrl(url)) {
        return true;
    }

    // Block requests to protected endpoints if no valid auth
    return hasValidAuth();
};

// Add global interceptor to include auth token
axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && !config.skipAuthRefresh) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor to handle auth errors
axios.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (error.response && error.response.status === 403) {
            console.error('Access forbidden: Authentication failed or insufficient permissions');
            
            // Check token validity
            if (!hasValidAuth()) {
                console.log('Invalid token detected during request');
                // Could trigger a logout or refresh token here
            }
        }
        return Promise.reject(error);
    }
);

const Api = {
    // Authentication
    login: async (credentials) => {
        // Use real API only - no mock fallback for production
        // This ensures proper error messages are returned
        return await axios.post(`${API_BASE_URL}/api/auth/login`, credentials);
    },
    
    register: async (userData) => {
        // Use real API only - no mock fallback for production
        // Handle FormData for file uploads
        const config = userData instanceof FormData ? {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        } : {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/register`, userData, config);
            return response;
        } catch (apiError) {
            console.error('Registration API error:', apiError);
            
            // Provide better error messages
            if (apiError.response) {
                // Server responded with error
                const status = apiError.response.status;
                const errorMessage = apiError.response.data?.message || apiError.response.data?.error || 'Registration failed';
                
                if (status === 404) {
                    throw new Error('Registration service is not available. Please contact support or try again later.');
                } else if (status === 409) {
                    throw new Error(errorMessage || 'An account with this email or username already exists. Please sign in instead.');
                } else if (status === 400) {
                    throw new Error(errorMessage || 'Invalid registration data. Please check your information and try again.');
                } else {
                    throw new Error(errorMessage || 'Registration failed. Please try again later.');
                }
            } else if (apiError.request) {
                // Request made but no response
                throw new Error('Unable to reach server. Please check your connection and try again.');
            } else {
                // Error setting up request
                throw new Error('An error occurred during registration. Please try again.');
            }
        }
    },
    
    // Direct Stripe payment link that bypasses authentication checks
    getDirectStripeCheckoutUrl: (courseId) => {
        return `${API_BASE_URL}/api/stripe/direct-checkout?courseId=${courseId}&timestamp=${Date.now()}`;
    },
    
    // Payment Processing
    initiatePayment: (courseId) => {
        console.log('Initiating payment for course:', courseId);
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('Cannot initiate payment: No authentication token');
            return Promise.reject(new Error('Authentication required'));
        }
        
        // Create a specialized axios instance for payment processing with better error handling
        const paymentAxios = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 second timeout for payment requests
        });
        
        return paymentAxios.post('/api/payments/checkout', { courseId })
            .then(response => {
                console.log('Payment initiation successful:', response.data);
                return response;
            })
            .catch(error => {
                console.error('Payment initiation failed:', error);
                // Add detailed error info
                if (error.response) {
                    console.error('Response data:', error.response.data);
                    console.error('Response status:', error.response.status);
                } else if (error.request) {
                    console.error('No response received from server');
                }
                throw error;
            });
    },
    
    completePayment: (sessionId, courseId) => {
        console.log('Completing payment for course:', courseId, 'with session:', sessionId);
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('Cannot complete payment: No authentication token');
            return Promise.reject(new Error('Authentication required'));
        }
        
        return axios.post(
            `${API_BASE_URL}/api/payments/complete`, 
            { sessionId, courseId },
            { 
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
    },
    
    // Courses
    getCourses: async () => {
        console.log('Fetching courses from live API:', `${API_BASE_URL}/api/courses`);
        return await axios.get(`${API_BASE_URL}/api/courses`);
    },
    
    getCourseById: (id) => {
        return axios.get(`${API_BASE_URL}/api/courses/${id}`);
    },
    
    // Admin APIs
    getAllUsers: () => {
        if (!shouldMakeRequest(`${API_BASE_URL}/api/users`)) {
            console.log('Skipping getAllUsers request - auth required');
            return Promise.resolve({ data: [] });
        }
        return axios.get(`${API_BASE_URL}/api/users`);
    },
    
    deleteUser: (userId) => {
        if (!shouldMakeRequest(`${API_BASE_URL}/api/users/${userId}`)) {
            console.log('Skipping deleteUser request - auth required');
            return Promise.resolve({ success: false });
        }
        return axios.delete(`${API_BASE_URL}/api/users/${userId}`);
    },
    
    // Community/Channels
    getChannels: async (customHeaders = {}) => {
        console.log('Attempting to fetch channels from:', `${API_BASE_URL}/api/community/channels`);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE_URL}/api/community/channels`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...customHeaders
                }
            });
            return response;
        } catch (error) {
            console.error('Error fetching channels:', error);
            throw error;
        }
    },
    
    createChannel: async (channelData) => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication required to create channels');
        }

        return axios.post(`${API_BASE_URL}/api/community/channels`, channelData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    },

    deleteChannel: async (channelId) => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication required to delete channels');
        }

        return axios.delete(`${API_BASE_URL}/api/community/channels`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: {
                id: channelId
            },
            params: {
                id: channelId
            }
        });
    },

    getChannelMessages: async (channelId, customHeaders = {}) => {
        console.log(`Attempting to fetch messages for channel ${channelId}`);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE_URL}/api/community/channels/${channelId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...customHeaders
                }
            });
            return response;
        } catch (error) {
            console.error(`Error fetching messages for channel ${channelId}:`, error);
            throw error;
        }
    },
    
    sendMessage: async (channelId, messageData) => {
        console.log(`Attempting to send message to channel ${channelId}`);
        
        if (!shouldMakeRequest(`${API_BASE_URL}/api/community/channels/${channelId}/messages`)) {
            console.log('Cannot send message: Not authenticated');
            throw new Error('Authentication required to send messages');
        }
        
        try {
            const token = localStorage.getItem('token');
            const customAxios = axios.create();
            
            const response = await customAxios.post(
                `${API_BASE_URL}/api/community/channels/${channelId}/messages`, 
                messageData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error(`Error sending message to channel ${channelId}:`, error);
            throw error; // Rethrow as sending messages should report errors to user
        }
    },
    
    deleteMessage: async (channelId, messageId) => {
        console.log(`Attempting to delete message ${messageId} from channel ${channelId}`);
        
        if (!shouldMakeRequest(`${API_BASE_URL}/api/community/channels/${channelId}/messages/${messageId}`)) {
            console.log('Cannot delete message: Not authenticated');
            throw new Error('Authentication required to delete messages');
        }
        
        try {
            const token = localStorage.getItem('token');
            const customAxios = axios.create();
            
            const response = await customAxios.delete(
                `${API_BASE_URL}/api/community/channels/${channelId}/messages/${messageId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            return response;
        } catch (error) {
            console.error(`Error deleting message ${messageId}:`, error);
            throw error; // Rethrow as deletion should report errors to user
        }
    },
    
    updateMessage: async (channelId, messageId, messageData) => {
        console.log(`Attempting to update message ${messageId} in channel ${channelId}`);
        
        if (!shouldMakeRequest(`${API_BASE_URL}/api/community/channels/${channelId}/messages/${messageId}`)) {
            console.log('Cannot update message: Not authenticated');
            throw new Error('Authentication required to update messages');
        }
        
        try {
            const token = localStorage.getItem('token');
            const customAxios = axios.create();
            
            const response = await customAxios.put(
                `${API_BASE_URL}/api/community/channels/${channelId}/messages/${messageId}`,
                messageData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error(`Error updating message ${messageId}:`, error);
            throw error; // Rethrow as updates should report errors to user
        }
    },
    
    // User Profile
    getUserData: () => {
        return axios.get(`${API_BASE_URL}/api/users/me`);
    },
    
    getUserProfile: (userId) => {
        return axios.get(`${API_BASE_URL}/api/users/${userId}`);
    },
    
    updateUserProfile: (userId, profileData) => {
        return axios.put(`${API_BASE_URL}/api/users/${userId}`, profileData);
    },
    
    getUserLevel: (userId) => {
        const baseUrl = getApiBaseUrl();
        const token = localStorage.getItem('token');
        
        if (!token) {
            console.error('Cannot get user level: No authentication token');
            return Promise.reject(new Error('Authentication required'));
        }
        
        return axios.get(`${baseUrl}/api/users/${userId}/level`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    getUserCourses: (userId) => {
        const token = localStorage.getItem('token');
        if (!token) {
            return Promise.reject(new Error('Authentication required'));
        }
        return axios.get(`${API_BASE_URL}/api/users/${userId}/courses`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    getLeaderboard: (timeframe = 'all-time') => {
        return axios.get(`${API_BASE_URL}/api/leaderboard`, {
            params: { timeframe }
        });
    },
    
    // Contact
    getBaseUrl: () => getApiBaseUrl(),
    
    getContactMessages: () => {
        return axios.get(`${API_BASE_URL}/api/contact`);
    },
    
    submitContactForm: (contactData) => {
        return axios.post(`${API_BASE_URL}/api/contact`, contactData);
    },
    
    // Subscription
    checkSubscription: async (userId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE_URL}/api/subscription/check`, {
                params: { userId },
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error checking subscription:', error);
            throw error;
        }
    },
    

    
    // Password reset methods
    sendPasswordResetEmail: async (email) => {
        try {
            // Use real API only - no mock fallback for production
            console.log('Sending password reset email request to:', `${API_BASE_URL}/api/auth/forgot-password`);
            
            // Configure request with proper headers and timeout
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 15000 // 15 second timeout
            };
            
            const response = await axios.post(`${API_BASE_URL}/api/auth/forgot-password`, { email }, config);
            console.log('Password reset email response:', response.data);
            
            // Check various response formats
            if (response.data && (response.data.success === true || response.data.success === false)) {
                return response.data.success;
            }
            
            // If response has message but no explicit success flag, assume success
            if (response.data && response.data.message) {
                return true;
            }
            
            // If response status is 200, assume success
            if (response.status === 200) {
                return true;
            }
            
            return false;
        } catch (apiError) {
            console.error('Failed to send password reset email:', apiError);
            console.error('Error response:', apiError.response);
            console.error('Error status:', apiError.response?.status);
            console.error('Error data:', apiError.response?.data);
            console.error('Error message:', apiError.message);
            
            // Handle network errors (no response from server)
            if (!apiError.response) {
                // Check for CORS errors specifically
                if (apiError.message && (apiError.message.includes('CORS') || apiError.message.includes('Cross-Origin'))) {
                    throw new Error('Server connection issue. Please contact support if this persists.');
                }
                
                // Check for blocked requests (often CORS-related)
                if (apiError.code === 'ERR_NETWORK' || apiError.message.includes('Network Error')) {
                    // Check if it's likely a CORS or backend issue
                    if (apiError.request && apiError.request.status === 0) {
                        throw new Error('Unable to connect to server. The password reset service may be temporarily unavailable. Please try again in a few moments or contact support.');
                    }
                    throw new Error('Connection error. Please check your internet connection and try again.');
                } else if (apiError.message.includes('timeout')) {
                    throw new Error('Request timed out. Please try again.');
                } else if (apiError.code === 'ERR_CERT' || apiError.message.includes('certificate')) {
                    throw new Error('Security certificate error. Please contact support.');
                } else {
                    throw new Error('Unable to reach server. Please try again later or contact support.');
                }
            }
            
            // Handle HTTP error responses
            const status = apiError.response.status;
            
            // Always check for server-provided error messages first
            if (apiError.response?.data?.message) {
                throw new Error(apiError.response.data.message);
            }
            
            // Fallback to status-specific messages if no custom message
            if (status === 404) {
                throw new Error('This email does not exist in our system. Please check your email address or sign up for a new account.');
            } else if (status === 405) {
                throw new Error('Password reset endpoint is not configured correctly on the server. Please contact support.');
            } else if (status === 429) {
                throw new Error('Too many requests. Please wait a few minutes before trying again.');
            } else if (status === 500) {
                throw new Error('Server error. Please try again later.');
            } else if (status === 400) {
                throw new Error('Invalid request. Please check your email address.');
            } else {
                throw new Error(`Failed to send reset email (Status: ${status}). Please try again.`);
            }
        }
    },

    verifyResetCode: async (email, code) => {
        // Use combined password-reset endpoint with action='verify'
        try {
            // Use real API only - no mock fallback for production
            const response = await axios.post(`${API_BASE_URL}/api/auth/password-reset`, { action: 'verify', email, code });
            if (response.data.success && response.data.token) {
                return {
                    success: true,
                    token: response.data.token
                };
            }
            throw new Error('Invalid or expired code');
        } catch (apiError) {
            console.error('Failed to verify reset code:', apiError);
            throw new Error(apiError.response?.data?.message || 'Invalid or expired code');
        }
    },

    resetPassword: async (token, newPassword) => {
        try {
            // Use real API only - no mock fallback for production
            const response = await axios.post(`${API_BASE_URL}/api/auth/password-reset`, { action: 'reset', token, newPassword });
            return response.data.success || true;
        } catch (apiError) {
            console.error('Failed to reset password:', apiError);
            throw new Error(apiError.response?.data?.message || 'Invalid or expired token');
        }
    },

    // Signup email verification methods
    sendSignupVerificationEmail: async (email, username = null) => {
        try {
            const payload = { action: 'send', email };
            if (username) {
                payload.username = username;
            }
            const response = await axios.post(`${API_BASE_URL}/api/auth/signup-verification`, payload);
            return response.data.success;
        } catch (error) {
            console.error('Error sending signup verification email:', error);
            if (error.response?.data?.message) {
                throw new Error(error.response.data.message);
            }
            throw error;
        }
    },
    
    verifySignupCode: async (email, code) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/signup-verification`, { action: 'verify', email, code });
            if (response.data && (response.data.verified === true || response.data.success === true)) {
                return {
                    verified: true,
                    token: response.data.token || null
                };
            }
            throw new Error('Invalid or expired code');
        } catch (apiError) {
            console.error('Failed to verify signup code:', apiError);
            throw new Error(apiError.response?.data?.message || 'Invalid or expired code');
        }
    },

    // Enhanced login with better error handling
    loginWithErrorDetails: async (credentials) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/login`, credentials);
            return {
                success: true,
                token: response.data.token,
                user: response.data.user || response.data
            };
        } catch (apiError) {
            // Return API error details
            return {
                success: false,
                error: apiError.response?.status === 401 ? 'password' : apiError.response?.status === 404 ? 'email' : 'system',
                message: apiError.response?.data?.message || 'An error occurred. Please try again.'
            };
        }
    },

    // MFA methods
    sendMfa: async (email, userId = null) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/send-mfa`, {
                action: 'send',
                email,
                userId
            });
            return response.data;
        } catch (error) {
            console.error('Error sending MFA code:', error);
            throw error;
        }
    },

    verifyMfa: async (email, code, userId = null) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/verify-mfa`, {
                action: 'verify',
                email,
                code,
                userId
            });
            return response.data;
        } catch (error) {
            console.error('Error verifying MFA code:', error);
            throw error;
        }
    },

    // Handle API errors in a consistent way
    handleApiError: (error) => {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            if (error.response.data && error.response.data.message) {
                return error.response.data.message;
            }
            return `Error ${error.response.status}: ${error.response.statusText}`;
        } else if (error.request) {
            // The request was made but no response was received
            return "No response from server. Please try again later.";
        } else {
            // Something happened in setting up the request that triggered an Error
            return error.message;
        }
    },

    // User Management (Super Admin only)
    getUsers: async () => {
        console.log('Fetching all users...');
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE_URL}/api/admin/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response;
        } catch (error) {
            console.error('Error fetching users:', error);
            throw error;
        }
    },

    updateUserRole: async (userId, roleData) => {
        console.log(`Updating user ${userId} role and capabilities...`);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.put(
                `${API_BASE_URL}/api/admin/users/${userId}/role`,
                roleData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error updating user role:', error);
            throw error;
        }
    }
};

export default Api;