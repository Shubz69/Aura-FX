import axios from 'axios';

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

// Use current origin to avoid CORS redirect issues
const getApiBaseUrl = () => {
    const fromEnv = resolveReactAppApiUrl();
    if (fromEnv) {
        return fromEnv;
    }
    if (process.env.NODE_ENV === 'development') {
        return '';
    }
    if (typeof window !== 'undefined') {
        if (/(?:^|\.)auraxfx\.com$/i.test(window.location.hostname || '') || /(?:^|\.)auraterminal\.ai$/i.test(window.location.hostname || '')) {
            return 'https://www.auraterminal.ai';
        }
        return window.location.origin;
    }
    return ''; // Use relative URLs
};

const API_BASE_URL = getApiBaseUrl();

// Admin-specific API methods
const AdminApi = {
    getAllUsers: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/admin/users`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },
    
    deleteUser: (userId) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/admin/users/${userId}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    getContactMessages: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/contact`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    deleteContactMessage: (messageId) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/contact/${messageId}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    getOnlineStatus: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/admin/user-status`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    getJournalStats: (userId = null) => {
        const token = localStorage.getItem('token');
        const url = userId
            ? `${API_BASE_URL}/api/admin/journal-stats?userId=${userId}`
            : `${API_BASE_URL}/api/admin/journal-stats`;
        return axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    getJournalProof: (taskId) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/admin/journal-proof?taskId=${encodeURIComponent(taskId)}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    getReferralPayouts: (params = {}) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/admin/referral/payouts`, {
            params,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },

    processReferralPayout: (id, action, extra = {}) => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/admin/referral/payouts`,
            { id, action, ...extra },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
    },

    reverseReferralEventBySource: ({ sourceTable, sourceId, reason }) => {
        const token = localStorage.getItem('token');
        return axios.post(
            `${API_BASE_URL}/api/admin/referral/events`,
            { sourceTable, sourceId, reason },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
    },

    getReferralReversalHistory: (limit = 20, sourceTable = '', windowDays = 0) => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/admin/referral/events`, {
            params: {
                limit,
                ...(sourceTable ? { sourceTable } : {}),
                ...(windowDays > 0 ? { windowDays } : {}),
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    }
};

export default AdminApi; 
