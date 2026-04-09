import axios from 'axios';
import { savePostAuthRedirect } from '../utils/postAuthRedirect';

/** If REACT_APP_API_URL points at the standalone analysis API host, ignore it — app JWT routes live on the main site. */
function resolveReactAppApiUrl() {
    const raw = process.env.REACT_APP_API_URL;
    if (!raw) return null;
    try {
        const host = new URL(raw).hostname || '';
        if (/(?:^|\.)aura-analysis\.com$/i.test(host)) return null;
        return raw;
    } catch {
        return raw;
    }
}

// Define a fixed API base URL with proper fallback
// Automatically detect the origin to avoid CORS issues with www redirects
const getApiBaseUrl = () => {
    const fromEnv = resolveReactAppApiUrl();
    if (fromEnv) {
        return fromEnv;
    }
    // In local dev prefer relative URLs so CRA proxy handles routing consistently.
    if (process.env.NODE_ENV === 'development') {
        return '';
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
        // Production domain currently serves marketing redirects on /api/*.
        // Route API traffic to the live app API host unless explicitly overridden.
        if (/(?:^|\.)auraxfx\.com$/i.test(window.location.hostname || '') || /(?:^|\.)auraterminal\.ai$/i.test(window.location.hostname || '')) {
            return 'https://www.auraterminal.ai';
        }
        return window.location.origin;
    }
    return '';
};

const API_BASE_URL = getApiBaseUrl();
const LOGIN_REQUEST_TIMEOUT_MS = 12000;
const VERIFY_REQUEST_TIMEOUT_MS = 28000;

/** Raw file size above this uses chunked POSTs so each request stays under Vercel ~4.5MB body limit. */
const BRIEF_SINGLE_UPLOAD_MAX_RAW = 2 * 1024 * 1024;
const BRIEF_CHUNK_RAW = 2 * 1024 * 1024;

function readBlobAsBase64(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
            const s = typeof r.result === 'string' ? r.result.replace(/^data:[^;]+;base64,/, '') : '';
            resolve(s);
        };
        r.onerror = () => reject(new Error('File read failed'));
        r.readAsDataURL(blob);
    });
}

// List of endpoints that should be accessible without authentication
const PUBLIC_ENDPOINTS = [
    '/api/courses',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/password-reset',
    '/api/auth/send-signup-verification',
    '/api/auth/verify-signup-code',
    '/api/auth/phone-verification'
];

// Helper function to check if a URL is public
const isPublicUrl = (url) => {
    return PUBLIC_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

const SUBSCRIPTION_PATH_FRAGMENT = '/api/subscription';
let subscriptionRedirectInProgress = false;

const normalizePlanHint = (plan) => {
    if (!plan || typeof plan !== 'string') {
        return null;
    }
    const normalized = plan.toLowerCase();
    if (normalized === 'aura' || normalized === 'premium') return 'pro';
    if (normalized === 'a7fx') return 'elite';
    if (['free', 'access', 'pro', 'elite'].includes(normalized)) {
        return normalized === 'free' ? 'access' : normalized;
    }
    return null;
};

const resolveRequestUrl = (input) => {
    if (!input) return '';
    if (typeof input === 'string') {
        return input;
    }
    if (typeof input === 'object' && input.url) {
        return input.url;
    }
    return '';
};

const isSubscriptionEndpoint = (url = '') => {
    if (!url) return false;
    try {
        return url.includes(SUBSCRIPTION_PATH_FRAGMENT);
    } catch {
        return false;
    }
};

const redirectToLoginForSubscription401 = (planHint) => {
    if (subscriptionRedirectInProgress || typeof window === 'undefined') {
        return;
    }
    subscriptionRedirectInProgress = true;

    const normalizedPlan = normalizePlanHint(planHint);
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const nextPath = normalizedPlan ? `/choose-plan?plan=${normalizedPlan}` : (currentPath || '/choose-plan');

    savePostAuthRedirect({
        next: nextPath,
        plan: normalizedPlan || undefined,
        from: currentPath
    });

    const loginUrl = `/login?next=${encodeURIComponent(nextPath)}`;
    window.location.assign(loginUrl);
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

// Lightweight GET cache (site-wide speed: avoid duplicate/repeated GETs)
const GET_CACHE_TTL_MS = 18000; // 18s
const GET_CACHE_SKIP_PATTERNS = /login|register|payment|stripe|password|forgot-password|auth\/login|auth\/register|auth\/forgot|auth\/phone-verification|auth\/verify-signup|auth\/send-signup/i;
const getCacheStore = (() => {
    const store = new Map();
    return () => store;
})();
const getCacheKey = (config) => {
    const base = config.baseURL || '';
    const path = typeof config.url === 'string' ? config.url : (config.url || '');
    const url = path.startsWith('http') ? path : (base.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path));
    const params = config.params ? JSON.stringify(config.params) : '';
    return (config.method || 'get') + '|' + url + '|' + params;
};
const shouldCacheGet = (config) => {
    const url = resolveRequestUrl(config.url) || (config.baseURL || '') + (config.url || '');
    return config.method === 'get' && !config.skipCache && !GET_CACHE_SKIP_PATTERNS.test(url);
};

// De-duplicate concurrent GET calls for the same resource.
const getInFlightStore = (() => {
    const store = new Map();
    return () => store;
})();

const buildInFlightGetKey = (url, options = {}) => {
    const params = options?.params ? JSON.stringify(options.params) : '';
    const headers = options?.headers ? JSON.stringify(options.headers) : '';
    return `GET|${url}|${params}|${headers}`;
};

const dedupeGet = (url, options = {}) => {
    const key = buildInFlightGetKey(url, options);
    const inflight = getInFlightStore();
    const existing = inflight.get(key);
    if (existing) return existing;
    const request = axios.get(url, options)
        .finally(() => inflight.delete(key));
    inflight.set(key, request);
    return request;
};

axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && !config.skipAuthRefresh) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (shouldCacheGet(config)) {
            const key = getCacheKey(config);
            const entry = getCacheStore().get(key);
            if (entry && (Date.now() - entry.at) < GET_CACHE_TTL_MS) {
                config.adapter = () => Promise.resolve(entry.response);
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor to handle auth errors and cache GET responses
axios.interceptors.response.use(
    (response) => {
        const config = response.config || {};
        if (shouldCacheGet(config) && response.status >= 200 && response.status < 300) {
            const key = getCacheKey(config);
            getCacheStore().set(key, {
                at: Date.now(),
                response: { data: response.data, status: response.status, statusText: response.statusText, headers: response.headers, config }
            });
        }
        return response;
    },
    (error) => {
        if (error.response && error.response.status === 401) {
            const requestUrl = resolveRequestUrl(error.config?.url);
            if (isSubscriptionEndpoint(requestUrl)) {
                const headerPlan =
                    error.config?.headers?.['X-Subscription-Plan'] ||
                    error.config?.headers?.['x-subscription-plan'] ||
                    null;
                redirectToLoginForSubscription401(headerPlan);
            }
        }
        if (error.response && error.response.status === 403) {
            const reqUrl = resolveRequestUrl(error.config?.url) || '';
            const fullUrl = (error.config?.baseURL || '') + (error.config?.url || '');
            const isAdminEndpoint = /\/api\/admin\//i.test(reqUrl) || /\/api\/admin\//i.test(fullUrl) || /journal-stats/i.test(reqUrl) || /journal-stats/i.test(fullUrl);
            if (!isAdminEndpoint) {
                console.error('Access forbidden: Authentication failed or insufficient permissions');
            }
            if (!hasValidAuth() && !isAdminEndpoint) {
                if (typeof console !== 'undefined' && console.log) {
                    console.log('Invalid token detected during request');
                }
            }
        }
        return Promise.reject(error);
    }
);

if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__subscriptionFetchInterceptorInstalled) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (response?.status === 401) {
            const requestUrl = resolveRequestUrl(args[0]);
            if (isSubscriptionEndpoint(requestUrl)) {
                redirectToLoginForSubscription401();
            }
        }
        return response;
    };
    window.__subscriptionFetchInterceptorInstalled = true;
}

const Api = {
    // Authentication
    login: async (credentials) => {
        // Use real API only - no mock fallback for production
        // This ensures proper error messages are returned and avoids infinite "Authenticating..." waits.
        return await axios.post(`${API_BASE_URL}/api/auth/login`, credentials, {
            timeout: LOGIN_REQUEST_TIMEOUT_MS
        });
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

    // Create PaymentIntent (backend only) – frontend uses Stripe.js confirmCardPayment with clientSecret
    createPaymentIntent: async (amountCents, currency = 'gbp') => {
        const token = localStorage.getItem('token');
        const res = await axios.post(
            `${API_BASE_URL}/api/stripe/create-payment-intent`,
            { amount: amountCents, currency: (currency || 'gbp').toLowerCase().slice(0, 3) },
            { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 15000 }
        );
        return res.data;
    },
    
    // Payment Processing
    initiatePayment: (courseId) => {
        // Keep compatibility for existing callers by returning a stable object
        // while using the live Stripe direct-checkout route.
        const checkoutUrl = `${API_BASE_URL}/api/stripe/direct-checkout?courseId=${encodeURIComponent(courseId)}&timestamp=${Date.now()}`;
        return Promise.resolve({
            data: {
                success: true,
                checkoutUrl
            }
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
    
    getCourseById: async (id) => {
        const response = await axios.get(`${API_BASE_URL}/api/courses/${id}`);
        return response;
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
        if (process.env.NODE_ENV === 'development') console.log('Attempting to fetch channels from:', `${API_BASE_URL}/api/community/channels`);
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            const response = await dedupeGet(`${API_BASE_URL}/api/community/channels`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...customHeaders
                }
            });
            return response;
        } catch (error) {
            const isNetwork = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
            if (!isNetwork) console.error('Error fetching channels:', error);
            throw error;
        }
    },
    /** Single request: channels + categoryOrder + channelOrder for faster load */
    getChannelsBootstrap: async (customHeaders = {}) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            const response = await dedupeGet(`${API_BASE_URL}/api/community/channels?bootstrap=true`, {
                headers: { 'Authorization': `Bearer ${token}`, ...customHeaders }
            });
            return response;
        } catch (error) {
            const isNetwork = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
            if (!isNetwork) console.error('Error fetching channels (bootstrap):', error);
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
        if (!hasValidAuth()) {
            throw new Error('Authentication required to delete channels');
        }
        
        return axios.delete(`${API_BASE_URL}/api/community/channels`, {
            params: { id: channelId }
        });
    },

    acceptOnboarding: async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(
                `${API_BASE_URL}/api/community/accept-onboarding`,
                {},
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            return response;
        } catch (error) {
            console.error('Accept onboarding error:', error);
            throw error;
        }
    },

    getChannelMessages: async (channelId, options = {}, customHeaders = {}) => {
        const { afterId } = options;
        const params = afterId ? { afterId: String(afterId) } : {};
        if (process.env.NODE_ENV === 'development') console.log(`Attempting to fetch messages for channel ${channelId}${afterId ? ` (afterId=${afterId})` : ''}`);
        try {
            const token = localStorage.getItem('token');
            const response = await dedupeGet(`${API_BASE_URL}/api/community/channels/${channelId}/messages`, {
                params,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...customHeaders
                }
            });
            return response;
} catch (error) {
            // Avoid flooding console on network/resource errors (polling will retry)
            const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
            if (!isNetworkError) console.error(`Error fetching messages for channel ${channelId}:`, error);
            throw error;
        }
    },

    sendMessage: async (channelId, messageData) => {
        if (process.env.NODE_ENV === 'development') console.log(`Attempting to send message to channel ${channelId}`);
        
        if (!shouldMakeRequest(`${API_BASE_URL}/api/community/channels/${channelId}/messages`)) {
            console.log('Cannot send message: Not authenticated');
            throw new Error('Authentication required to send messages');
        }
        
        try {
            const token = localStorage.getItem('token');
            const customAxios = axios.create();
            
            // Send as JSON (file metadata included if present)
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
            const msg = error?.response?.data?.message || error?.message || 'Send failed';
            console.error(`Error sending message to channel ${channelId}:`, msg);
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
        return axios.get(`${API_BASE_URL}/api/me`);
    },
    
    getUserProfile: (userId) => {
        return axios.get(`${API_BASE_URL}/api/users/${userId}`);
    },

    getUserSettings: () => {
        return axios.get(`${API_BASE_URL}/api/users/settings`);
    },

    putUserSettings: (body) => {
        return axios.put(`${API_BASE_URL}/api/users/settings`, body, {
            headers: { 'Content-Type': 'application/json' },
        });
    },
    
    updateUserProfile: (userId, profileData) => {
        return axios.put(`${API_BASE_URL}/api/users/${userId}`, profileData);
    },
    
    getUserLevel: async (userId) => {
        const baseUrl = getApiBaseUrl();
        const token = localStorage.getItem('token');
        
        if (!token) {
            console.error('Cannot get user level: No authentication token');
            return Promise.reject(new Error('Authentication required'));
        }
        
        const response = await axios.get(`${baseUrl}/api/users/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        const level = response?.data?.level ?? 1;
        return { ...response, data: { ...(response?.data || {}), level } };
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

    // Daily login streak check and XP award
    checkDailyLogin: async (userId) => {
        try {
            return await axios.post(`${API_BASE_URL}/api/users/daily-login`, { userId });
        } catch (error) {
            console.error('Error checking daily login:', error);
            throw error;
        }
    },
    
    getLeaderboard: (timeframe = 'all-time') => {
        return axios.get(`${API_BASE_URL}/api/leaderboard`, {
            params: { timeframe, _cb: Date.now() },
            headers: { 'Cache-Control': 'no-cache' },
        });
    },

    // Journal (trading journal – per-user)
    getJournalTrades: (params = {}) => {
        return axios.get(`${API_BASE_URL}/api/journal/trades`, { params });
    },
    createJournalTrade: (body) => {
        return axios.post(`${API_BASE_URL}/api/journal/trades`, body);
    },
    updateJournalTrade: (id, body) => {
        return axios.put(`${API_BASE_URL}/api/journal/trades/${id}`, body);
    },
    deleteJournalTrade: (id) => {
        return axios.delete(`${API_BASE_URL}/api/journal/trades/${id}`);
    },

    /** Aura Backtesting — sessions, trades, notebook, reports */
    getBacktestingSummary: () => axios.get(`${API_BASE_URL}/api/backtesting/summary`),
    getBacktestingSessions: (params = {}) => axios.get(`${API_BASE_URL}/api/backtesting/sessions`, { params }),
    createBacktestingSession: (body) => axios.post(`${API_BASE_URL}/api/backtesting/sessions`, body),
    getBacktestingSession: (id) => axios.get(`${API_BASE_URL}/api/backtesting/sessions/${id}`),
    patchBacktestingSession: (id, body) => axios.patch(`${API_BASE_URL}/api/backtesting/sessions/${id}`, body),
    deleteBacktestingSession: (id) => axios.delete(`${API_BASE_URL}/api/backtesting/sessions/${id}`),
    completeBacktestingSession: (id) => axios.post(`${API_BASE_URL}/api/backtesting/sessions/${id}/complete`),
    archiveBacktestingSession: (id) => axios.post(`${API_BASE_URL}/api/backtesting/sessions/${id}/archive`),
    resumeBacktestingSession: (id) => axios.post(`${API_BASE_URL}/api/backtesting/sessions/${id}/resume`),
    pauseBacktestingSession: (id, body = {}) => axios.post(`${API_BASE_URL}/api/backtesting/sessions/${id}/pause`, body),
    duplicateBacktestingSession: (id) => axios.post(`${API_BASE_URL}/api/backtesting/sessions/${id}/duplicate`),
    getBacktestingSessionTrades: (sessionId) => axios.get(`${API_BASE_URL}/api/backtesting/sessions/${sessionId}/trades`),
    createBacktestingTrade: (sessionId, body) => axios.post(`${API_BASE_URL}/api/backtesting/sessions/${sessionId}/trades`, body),
    getBacktestingTrades: (params = {}) => axios.get(`${API_BASE_URL}/api/backtesting/trades`, { params }),
    getBacktestingTrade: (tradeId) => axios.get(`${API_BASE_URL}/api/backtesting/trades/${tradeId}`),
    patchBacktestingTrade: (tradeId, body) => axios.patch(`${API_BASE_URL}/api/backtesting/trades/${tradeId}`, body),
    deleteBacktestingTrade: (tradeId) => axios.delete(`${API_BASE_URL}/api/backtesting/trades/${tradeId}`),
    getBacktestingNotebook: (sessionId) => axios.get(`${API_BASE_URL}/api/backtesting/sessions/${sessionId}/notebook`),
    putBacktestingNotebook: (sessionId, notebook) =>
        axios.put(`${API_BASE_URL}/api/backtesting/sessions/${sessionId}/notebook`, { notebook }),
    getBacktestingSessionReports: (sessionId) => axios.get(`${API_BASE_URL}/api/backtesting/sessions/${sessionId}/reports`),
    getBacktestingReportsOverview: (params = {}) => axios.get(`${API_BASE_URL}/api/backtesting/reports/overview`, { params }),
    getBacktestingReportsBreakdowns: (params = {}) => axios.get(`${API_BASE_URL}/api/backtesting/reports/breakdowns`, { params }),

    getJournalTasks: (params = {}) => {
        return axios.get(`${API_BASE_URL}/api/journal/tasks`, { params });
    },
    createJournalTask: (body) => {
        return axios.post(`${API_BASE_URL}/api/journal/tasks`, body);
    },
    updateJournalTask: (id, body) => {
        return axios.put(`${API_BASE_URL}/api/journal/tasks/${id}`, body);
    },
    deleteJournalTask: (id) => {
        return axios.delete(`${API_BASE_URL}/api/journal/tasks/${id}`);
    },

    getAuraAnalysisTrades: (params = {}) => {
        return axios.get(`${API_BASE_URL}/api/aura-analysis/trades`, { params });
    },
    getAuraAnalysisPnl: (params = {}) => {
        return axios.get(`${API_BASE_URL}/api/aura-analysis/trades`, { params: { pnl: 1, ...params } });
    },
    createAuraAnalysisTrade: (body) => {
        return axios.post(`${API_BASE_URL}/api/aura-analysis/trades`, body);
    },
    updateAuraAnalysisTrade: (id, body) => {
        return axios.put(`${API_BASE_URL}/api/aura-analysis/trades/${id}`, body);
    },
    deleteAuraAnalysisTrade: (id) => {
        return axios.delete(`${API_BASE_URL}/api/aura-analysis/trades/${id}`);
    },

    getValidatorAccounts: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/aura-analysis/validator-accounts`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    createValidatorAccount: (name, accountCurrency = 'USD') => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/aura-analysis/validator-accounts`,
            { name, accountCurrency },
            { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
        );
    },
    patchValidatorAccount: (id, body) => {
        const token = localStorage.getItem('token');
        return axios.patch(`${API_BASE_URL}/api/aura-analysis/validator-accounts`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    deleteValidatorAccount: (id) => {
        const token = localStorage.getItem('token');
        const q = id != null ? `?id=${encodeURIComponent(String(id))}` : '';
        return axios.delete(`${API_BASE_URL}/api/aura-analysis/validator-accounts${q}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    verifyTradeOutcome: (tradeId, image, mimeType = 'image/png') => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/ai/trade-outcome-verify`,
            { tradeId, image, mimeType },
            { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
        );
    },

    /** Trader DNA — eligibility, report payload, cycle state (GET); generate snapshot (POST). */
    getTraderDna: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-dna`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            skipCache: true,
        });
    },
    generateTraderDna: () => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/trader-dna`,
            { confirm: true },
            { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
        );
    },

    // Platform connections (real MT5/exchange APIs — requires same JWT as other protected APIs)
    getAuraPlatformConnections: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/aura-analysis/platform-connect`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    connectAuraPlatform: (platformId, credentials) => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/aura-analysis/platform-connect`,
            { platformId, credentials },
            {
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                timeout: 88000,
            }
        );
    },
    disconnectAuraPlatform: (platformId) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/aura-analysis/platform-connect`, {
            params: { platformId },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    getAuraPlatformAccount: (platformId) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/aura-analysis/platform-account`, {
            params: { platformId },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    /** @param {number|{ days?: number, from?: string, to?: string }} daysOrOpts - preset window in days, or { from, to } YYYY-MM-DD (UTC range on API) */
    getAuraPlatformHistory: (platformId, daysOrOpts = 30) => {
        const token = localStorage.getItem('token');
        const params = { platformId };
        if (typeof daysOrOpts === 'number') {
            params.days = daysOrOpts;
        } else if (daysOrOpts && typeof daysOrOpts === 'object') {
            if (daysOrOpts.days != null) params.days = daysOrOpts.days;
            if (daysOrOpts.from) params.from = daysOrOpts.from;
            if (daysOrOpts.to) params.to = daysOrOpts.to;
        }
        return axios.get(`${API_BASE_URL}/api/aura-analysis/platform-history`, {
            params,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },

    getAuraAnalysisLeaderboard: (sortBy = 'pnl', order = 'desc') => {
        return axios.get(`${API_BASE_URL}/api/aura-analysis/leaderboard`, {
            params: { sortBy, order }
        });
    },

    getTraderDeckMarketIntelligence: (refresh = false, options = {}) => {
        const timeframe = options?.timeframe === 'weekly' ? 'weekly' : 'daily';
        const date = typeof options?.date === 'string' ? options.date.slice(0, 10) : '';
        const params = {
            timeframe,
            ...(date ? { date } : {}),
            ...(refresh ? { refresh: '1' } : {}),
        };
        return dedupeGet(`${API_BASE_URL}/api/trader-deck/market-intelligence`, {
            params,
        });
    },

    /** Rules-first asset decision brief (Trader Desk → Market Decoder). */
    getTraderDeckMarketDecoder: (symbol, options = {}) => {
        const sym = String(symbol || '').trim();
        if (!sym) {
            return Promise.reject(new Error('symbol required'));
        }
        const params = {
            symbol: sym,
            ...(options.refresh ? { refresh: '1' } : {}),
            ...(options.noAi ? { noAi: '1' } : {}),
        };
        return axios.get(`${API_BASE_URL}/api/trader-deck/market-decoder`, { params });
    },
    /**
     * Economic calendar. skipCache so actuals stay fresh.
     * Supports both legacy params (from/to/date/days) and range aliases (startDate/endDate),
     * plus optional currencies/countries/impact/includePast/includeFuture.
     * @param {number|{ from?: string, to?: string, startDate?: string, endDate?: string, date?: string, days?: number, refresh?: boolean, currencies?: string[]|string, countries?: string[]|string, impact?: string[]|string, includePast?: boolean, includeFuture?: boolean }} daysOrOpts
     * @param {boolean} [refresh=false]
     */
    getTraderDeckEconomicCalendar: (daysOrOpts = 7, refresh = false) => {
        let tz = 'UTC';
        try {
            tz =
                typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone
                    ? Intl.DateTimeFormat().resolvedOptions().timeZone
                    : 'UTC';
        } catch (_) {
            /* keep UTC */
        }
        /** @type {Record<string, string|number>} */
        const params = { tz };
        let doRefresh = refresh;
        if (daysOrOpts != null && typeof daysOrOpts === 'object' && !Array.isArray(daysOrOpts)) {
            const o = daysOrOpts;
            if (o.from && o.to) {
                params.from = String(o.from).slice(0, 10);
                params.to = String(o.to).slice(0, 10);
            } else if (o.startDate && o.endDate) {
                params.startDate = String(o.startDate).slice(0, 10);
                params.endDate = String(o.endDate).slice(0, 10);
            } else if (o.date) {
                params.date = String(o.date).slice(0, 10);
            }
            if (o.days != null) params.days = o.days;
            if (o.currencies != null) params.currencies = Array.isArray(o.currencies) ? o.currencies.join(',') : String(o.currencies);
            if (o.countries != null) params.countries = Array.isArray(o.countries) ? o.countries.join(',') : String(o.countries);
            if (o.impact != null) params.impact = Array.isArray(o.impact) ? o.impact.join(',') : String(o.impact);
            if (typeof o.includePast === 'boolean') params.includePast = o.includePast ? '1' : '0';
            if (typeof o.includeFuture === 'boolean') params.includeFuture = o.includeFuture ? '1' : '0';
            if (o.refresh) doRefresh = true;
        } else {
            const d = typeof daysOrOpts === 'number' && Number.isFinite(daysOrOpts) ? daysOrOpts : 7;
            params.days = d;
        }
        if (doRefresh) params.refresh = '1';
        return dedupeGet(`${API_BASE_URL}/api/trader-deck/economic-calendar`, {
            params,
            skipCache: true,
        });
    },
    /**
     * News feed with optional date window.
     * @param {boolean|{refresh?: boolean, from?: string, to?: string}} arg
     */
    getTraderDeckNews: (arg = false) => {
        const opts = (arg && typeof arg === 'object') ? arg : { refresh: !!arg };
        const params = {};
        if (opts.refresh) params.refresh = '1';
        if (opts.from) params.from = String(opts.from).slice(0, 10);
        if (opts.to) params.to = String(opts.to).slice(0, 10);
        return dedupeGet(`${API_BASE_URL}/api/trader-deck/news`, { params });
    },

    getTraderDeckContent: (type, date, opts = {}) => {
        const token = localStorage.getItem('token');
        const params = { type, date };
        if (opts && opts.cacheBust) params._ = String(Date.now());
        return axios.get(`${API_BASE_URL}/api/trader-deck/content`, {
            params,
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
    },
    putTraderDeckContent: (type, date, payload) => {
        const token = localStorage.getItem('token');
        return axios.put(`${API_BASE_URL}/api/trader-deck/content`, { type, date, payload }, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        });
    },
    uploadTraderDeckBrief: (body) => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE_URL}/api/trader-deck/brief-upload`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            maxBodyLength: 50 * 1024 * 1024,
            maxContentLength: 50 * 1024 * 1024,
            timeout: 120000,
        });
    },
    /**
     * Upload a brief file; uses chunked API when file is large (avoids HTTP 413 on Vercel).
     */
    uploadTraderDeckBriefFile: async (file, { date, period, title }) => {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const axiosOpts = {
            headers,
            maxBodyLength: 50 * 1024 * 1024,
            maxContentLength: 50 * 1024 * 1024,
            timeout: 120000,
        };
        const safeTitle = (title || '').trim() || file.name.replace(/\.[^/.]+$/, '') || 'Brief';
        const meta = { date, period, title: safeTitle };

        if (!file || file.size <= BRIEF_SINGLE_UPLOAD_MAX_RAW) {
            const fileBase64 = await readBlobAsBase64(file);
            return axios.post(
                `${API_BASE_URL}/api/trader-deck/brief-upload`,
                {
                    ...meta,
                    fileBase64,
                    fileName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                },
                axiosOpts
            );
        }

        const uploadToken =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `u-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
        const totalChunks = Math.ceil(file.size / BRIEF_CHUNK_RAW);
        for (let i = 0; i < totalChunks; i++) {
            const slice = file.slice(i * BRIEF_CHUNK_RAW, (i + 1) * BRIEF_CHUNK_RAW);
            const chunkBase64 = await readBlobAsBase64(slice);
            await axios.post(
                `${API_BASE_URL}/api/trader-deck/brief-upload`,
                {
                    action: 'chunk',
                    token: uploadToken,
                    chunkIndex: i,
                    totalChunks,
                    chunkBase64,
                },
                axiosOpts
            );
        }
        return axios.post(
            `${API_BASE_URL}/api/trader-deck/brief-upload`,
            {
                action: 'finalize',
                token: uploadToken,
                totalChunks,
                date: meta.date,
                period: meta.period,
                title: meta.title,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
            },
            axiosOpts
        );
    },
    deleteTraderDeckBrief: (id) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/trader-deck/brief-delete`, {
            params: { id },
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
    },
    getTraderDeckBriefPreviewUrl: (id) => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';
        const base = getApiBaseUrl();
        const q = [`id=${encodeURIComponent(id)}`];
        if (token) q.push(`token=${encodeURIComponent(token)}`);
        return `${base}/api/trader-deck/brief-preview?${q.join('&')}`;
    },
    getTraderDeckBriefTemplate: (period = 'daily') => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-deck/brief-template`, {
            params: { period },
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
    },
    putTraderDeckBriefTemplate: (period = 'daily', templateText = '') => {
        const token = localStorage.getItem('token');
        return axios.put(
            `${API_BASE_URL}/api/trader-deck/brief-template`,
            { period, templateText },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            }
        );
    },
    previewTraderDeckBriefTemplate: (period = 'daily', templateText = '') => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/trader-deck/brief-template`,
            { period, action: 'preview', templateText },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            }
        );
    },
    publishTraderDeckBriefPreview: ({ period = 'daily', date, previewTitle, previewBody }) => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/trader-deck/brief-template`,
            { period, action: 'publish-preview', date, previewTitle, previewBody },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            }
        );
    },
    getTraderPlaybookSetups: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-playbook/setups`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    getTraderPlaybookSetup: (id) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-playbook/setups/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    createTraderPlaybookSetup: (body) => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE_URL}/api/trader-playbook/setups`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    updateTraderPlaybookSetup: (id, body) => {
        const token = localStorage.getItem('token');
        return axios.put(`${API_BASE_URL}/api/trader-playbook/setups/${id}`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    deleteTraderPlaybookSetup: (id) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/trader-playbook/setups/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    touchTraderPlaybookSetup: (id) => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/trader-playbook/setups/${id}/touch`,
            {},
            { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
    },
    getTraderPlaybookSummary: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-playbook/summary`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    getTraderPlaybookMTrades: (params = {}) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-playbook/m-trades`, {
            params,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    createTraderPlaybookMTrade: (body) => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE_URL}/api/trader-playbook/m-trades`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    updateTraderPlaybookMTrade: (id, body) => {
        const token = localStorage.getItem('token');
        return axios.put(`${API_BASE_URL}/api/trader-playbook/m-trades/${id}`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    deleteTraderPlaybookMTrade: (id) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/trader-playbook/m-trades/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    getTraderPlaybookReviewNotes: (playbookId) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-playbook/review-notes`, {
            params: { playbookId },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    createTraderPlaybookReviewNote: (body) => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE_URL}/api/trader-playbook/review-notes`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    updateTraderPlaybookReviewNote: (id, body) => {
        const token = localStorage.getItem('token');
        return axios.put(`${API_BASE_URL}/api/trader-playbook/review-notes/${id}`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    deleteTraderPlaybookReviewNote: (id) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/trader-playbook/review-notes/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    getTraderLabSessions: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-lab/sessions`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    createTraderLabSession: (body) => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE_URL}/api/trader-lab/sessions`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    updateTraderLabSession: (id, body) => {
        const token = localStorage.getItem('token');
        return axios.put(`${API_BASE_URL}/api/trader-lab/sessions/${id}`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    deleteTraderLabSession: (id) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/trader-lab/sessions/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    getTraderReplaySessions: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-replay/sessions`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    getTraderReplaySession: (id) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/trader-replay/sessions/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },
    createTraderReplaySession: (body) => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE_URL}/api/trader-replay/sessions`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    updateTraderReplaySession: (id, body) => {
        const token = localStorage.getItem('token');
        return axios.put(`${API_BASE_URL}/api/trader-replay/sessions/${id}`, body, {
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    },
    deleteTraderReplaySession: (id) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/trader-replay/sessions/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
    },

    getJournalDaily: (date) => {
        return axios.get(`${API_BASE_URL}/api/journal/daily`, { params: { date } });
    },
    updateJournalDaily: (body, config = {}) => {
        return axios.put(`${API_BASE_URL}/api/journal/daily`, body, config);
    },
    getJournalXpCheck: (date) => {
        return axios.get(`${API_BASE_URL}/api/journal/xp-check`, { params: { date } });
    },
    getJournalNotes: (date) => {
        return axios.get(`${API_BASE_URL}/api/journal/notes`, { params: { date } });
    },
    addJournalNote: (date, content) => {
        return axios.post(`${API_BASE_URL}/api/journal/notes`, { date, content });
    },
    deleteJournalNote: (id) => {
        return axios.delete(`${API_BASE_URL}/api/journal/notes/${id}`);
    },
    
    // Contact
    getBaseUrl: () => getApiBaseUrl(),
    
    getContactMessages: () => {
        return axios.get(`${API_BASE_URL}/api/contact`);
    },
    
    submitContactForm: (contactData) => {
        return axios.post(`${API_BASE_URL}/api/contact`, contactData);
    },

    patchContactMessage: (id, data) => {
        return axios.patch(`${API_BASE_URL}/api/contact/${id}`, data);
    },

    getReferralStats: () => {
        const token = localStorage.getItem('token');
        const base =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : API_BASE_URL;
        return axios.get(`${base}/api/referral/stats`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    getReferralDashboard: (params = {}) => {
        const token = localStorage.getItem('token');
        const base =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : API_BASE_URL;
        return axios.get(`${base}/api/referral/dashboard`, {
            params,
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    getReferralLedger: (params = {}) => {
        const token = localStorage.getItem('token');
        const base =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : API_BASE_URL;
        return axios.get(`${base}/api/referral/ledger`, {
            params,
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    getReferralReferees: (params = {}) => {
        const token = localStorage.getItem('token');
        const base =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : API_BASE_URL;
        return axios.get(`${base}/api/referral/referees`, {
            params,
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    getReferralPayoutMethod: () => {
        const token = localStorage.getItem('token');
        const base =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : API_BASE_URL;
        return axios.get(`${base}/api/referral/payout-method`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    setReferralPayoutMethod: (method, details) => {
        const token = localStorage.getItem('token');
        const base =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : API_BASE_URL;
        return axios.post(`${base}/api/referral/payout-method`, { method, details }, {
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    requestReferralWithdrawal: (amountPence) => {
        const token = localStorage.getItem('token');
        const base =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : API_BASE_URL;
        return axios.post(`${base}/api/referral/withdraw`, { amountPence }, {
            headers: { Authorization: `Bearer ${token}` }
        });
    },

    savePushSubscription: (subscription) => {
        const token = localStorage.getItem('token');
        return axios.post(`${API_BASE_URL}/api/push/subscribe`, { subscription }, {
            headers: { Authorization: `Bearer ${token}` }
        });
    },

    removePushSubscription: (endpoint) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/push/subscribe`, {
            data: { endpoint },
            headers: { Authorization: `Bearer ${token}` }
        });
    },

    /** Opt-in push for channel activity (server throttles ~1 per 10 min per channel) */
    getChannelPushPreference: (channelId) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/community/channel-push-preference`, {
            params: { channelId: String(channelId) },
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    setChannelPushPreference: (channelId, enabled) => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/community/channel-push-preference`,
            { channelId: String(channelId), enabled: Boolean(enabled) },
            { headers: { Authorization: `Bearer ${token}` } }
        );
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
            const is500 = error?.response?.status === 500;
            const isNetwork = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
            if (!is500 && !isNetwork) console.error('Error checking subscription:', error);
            throw error;
        }
    },

    selectFreePlan: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication required');
        }
        const response = await axios.post(
            `${API_BASE_URL}/api/subscription/select-free`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Subscription-Plan': 'free'
                },
                timeout: 15000
            }
        );
        return response.data;
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
    sendSignupVerificationEmail: async (email, username = null, phone = null) => {
        try {
            const payload = { action: 'send', email };
            if (username) {
                payload.username = username;
            }
            if (phone != null && String(phone).trim()) {
                payload.phone = String(phone).trim();
            }
            const response = await axios.post(`${API_BASE_URL}/api/auth/signup-verification`, payload, {
                timeout: VERIFY_REQUEST_TIMEOUT_MS,
            });
            return response.data.success;
        } catch (error) {
            console.error('Error sending signup verification email:', error);
            if (error.response?.data?.message) {
                throw new Error(error.response.data.message);
            }
            if (error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')) {
                throw new Error('Request timed out. Check your connection and try again.');
            }
            if (!error.response) {
                throw new Error('Could not reach the server. Check your connection and try again.');
            }
            throw error;
        }
    },
    
    verifySignupCode: async (email, code) => {
        const emailNorm = (email || '').toString().trim().toLowerCase();
        const codeNorm = (code || '').toString().replace(/\s/g, '').trim();
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/signup-verification`,
                { action: 'verify', email: emailNorm, code: codeNorm },
                { validateStatus: (s) => s < 500 }
            );
            const d = response.data || {};
            if (response.status === 200 && (d.verified === true || d.success === true)) {
                return { verified: true, token: d.token || null };
            }
            return {
                verified: false,
                message: d.message || 'Invalid or expired email code. Please check and try again.'
            };
        } catch (apiError) {
            console.error('Failed to verify signup code:', apiError);
            return {
                verified: false,
                message: apiError.response?.data?.message || 'Could not verify email. Please try again.'
            };
        }
    },

    sendPhoneVerificationCode: async (phone) => {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/phone-verification`,
                { action: 'send', phone },
                { timeout: VERIFY_REQUEST_TIMEOUT_MS }
            );
            return response.data;
        } catch (error) {
            if (error.response?.data?.message) throw new Error(error.response.data.message);
            if (error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')) {
                throw new Error('SMS request timed out. Check your connection and try again.');
            }
            if (!error.response) {
                throw new Error('Could not reach the server. Check your connection and try again.');
            }
            throw error;
        }
    },

    verifyPhoneCode: async (phone, code) => {
        const codeNorm = (code || '').toString().replace(/\s/g, '').trim();
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/phone-verification`,
                { action: 'verify', phone: (phone || '').toString().trim(), code: codeNorm },
                { validateStatus: (s) => s < 500 }
            );
            const d = response.data || {};
            if (response.status === 200 && (d.verified === true || d.success === true)) {
                return { verified: true };
            }
            return {
                verified: false,
                message: d.message || 'Invalid or expired phone code. Please try again or tap Resend.'
            };
        } catch (error) {
            return {
                verified: false,
                message: error.response?.data?.message || 'Could not verify phone. Please try again.'
            };
        }
    },

    // Enhanced login with better error handling
    loginWithErrorDetails: async (credentials) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/login`, credentials, {
                timeout: LOGIN_REQUEST_TIMEOUT_MS
            });
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
            if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
                return "Login request timed out. Please try again.";
            }
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
    },

    giveXp: async (userId, xpAmount) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(
                `${API_BASE_URL}/api/admin/give-xp`,
                { userId, xpAmount },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error giving XP:', error);
            throw error;
        }
    },

    // Messaging/Thread functions (optional userIdFromAuth: pass from useAuth().user?.id when available)
    ensureAdminThread: async (userIdFromAuth = null) => {
        try {
            const token = localStorage.getItem('token');
            const userId = userIdFromAuth != null ? userIdFromAuth : (() => {
                const userJson = localStorage.getItem('user');
                const user = userJson ? JSON.parse(userJson) : null;
                return user?.id ?? null;
            })();
            
            if (userId == null || userId === '') {
                throw new Error('User ID not available');
            }
            
            const response = await axios.post(
                `${API_BASE_URL}/api/messages/threads/ensure-admin`,
                { userId },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error ensuring admin thread:', error);
            throw error;
        }
    },

    /** For admin inbox: create/get thread for a target user (shared inbox thread) */
    ensureAdminThreadForUser: async (targetUserId) => {
        try {
            const token = localStorage.getItem('token');
            if (!targetUserId) throw new Error('Target user ID required');
            const response = await axios.post(
                `${API_BASE_URL}/api/messages/threads/ensure-admin`,
                { userId: targetUserId },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error ensuring admin thread:', error);
            throw error;
        }
    },

    ensureUserThread: async (targetUserId) => {
        try {
            const token = localStorage.getItem('token');
            const userJson = localStorage.getItem('user');
            const user = userJson ? JSON.parse(userJson) : null;
            const adminUserId = user?.id || null;
            
            if (!adminUserId) {
                throw new Error('User ID not available');
            }
            
            const response = await axios.post(
                `${API_BASE_URL}/api/messages/threads/ensure-user/${targetUserId}`,
                { userId: adminUserId },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error ensuring user thread:', error);
            throw error;
        }
    },

    listThreads: async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(
                `${API_BASE_URL}/api/messages/threads`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error listing threads:', error);
            throw error;
        }
    },

    /** List DM threads (for Friends tab); optional friendsOnly */
    listFriendThreads: async (friendsOnly = true) => {
        try {
            const token = localStorage.getItem('token');
            const url = `${API_BASE_URL}/api/messages/threads?mode=dms${friendsOnly ? '&friendsOnly=1' : ''}`;
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response;
        } catch (error) {
            console.error('Error listing friend threads:', error);
            throw error;
        }
    },

    getThreadMessages: async (threadId, options = {}) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(
                `${API_BASE_URL}/api/messages/threads/${threadId}/messages`,
                {
                    params: options,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error getting thread messages:', error);
            throw error;
        }
    },

    sendThreadMessage: async (threadId, body) => {
        try {
            const token = localStorage.getItem('token');
            const userJson = localStorage.getItem('user');
            const user = userJson ? JSON.parse(userJson) : null;
            const userId = user?.id || null;
            
            if (!userId) {
                throw new Error('User ID not available');
            }
            
            const response = await axios.post(
                `${API_BASE_URL}/api/messages/threads/${threadId}/messages`,
                { body, userId },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error sending thread message:', error);
            throw error;
        }
    },

    markThreadRead: async (threadId) => {
        try {
            const token = localStorage.getItem('token');
            const userJson = localStorage.getItem('user');
            const user = userJson ? JSON.parse(userJson) : null;
            const userId = user?.id || null;
            
            if (!userId) {
                throw new Error('User ID not available');
            }
            
            const response = await axios.post(
                `${API_BASE_URL}/api/messages/threads/${threadId}/read`,
                { userId },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response;
        } catch (error) {
            console.error('Error marking thread as read:', error);
            throw error;
        }
    }
};

export default Api;