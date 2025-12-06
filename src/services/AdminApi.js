import axios from 'axios';

// Use current origin to avoid CORS redirect issues
const getApiBaseUrl = () => {
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }
    if (typeof window !== 'undefined') {
        return window.location.origin; // This will be https://www.theglitch.world or https://theglitch.world
    }
    return 'https://www.theglitch.world'; // Default to www version
};

const API_BASE_URL = getApiBaseUrl();

// Admin-specific API methods
const AdminApi = {
    getAllUsers: () => {
        const token = localStorage.getItem('token');
        return axios.get(`${API_BASE_URL}/api/users`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
    },
    
    deleteUser: (userId) => {
        const token = localStorage.getItem('token');
        return axios.delete(`${API_BASE_URL}/api/users/${userId}`, {
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
    }
};

export default AdminApi; 