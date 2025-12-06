import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/AdminUserList.css";
import AdminApi from "../services/AdminApi";
import BinaryBackground from '../components/BinaryBackground';

const AdminUserList = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    const fetchUsers = useCallback(async () => {
        if (user?.role !== "ADMIN") return;
        setLoading(true);
        try {
            const res = await AdminApi.getAllUsers();
            setUsers(res.data);
            setError(null);
        } catch (err) {
            setError("Failed to fetch users. Please check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const fetchOnlineUsers = useCallback(async () => {
        if (user?.role !== "ADMIN") return;
        try {
            const response = await AdminApi.getOnlineStatus();
            const ids = Array.isArray(response.data?.onlineUsers) ? response.data.onlineUsers.map(u => u.id) : [];
            setOnlineUsers(new Set(ids));
        } catch (err) {
            // ignore fetch errors; status UI will show offline
        }
    }, [user]);

    useEffect(() => {
        fetchOnlineUsers();
        const interval = setInterval(fetchOnlineUsers, 30000);
        return () => clearInterval(interval);
    }, [fetchOnlineUsers]);

    const deleteUser = async (userId) => {
        if (!window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
            return;
        }
        try {
            await AdminApi.deleteUser(userId);
            await fetchUsers();
            setError(null);
        } catch (error) {
            setError("Failed to delete user. Please check your connection and try again.");
        }
    };

    const isUserOnline = (id) => onlineUsers.has(id);

    const formatDate = (isoString) => {
        if (!isoString) return "N/A";
        const date = new Date(isoString);
        return isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
    };

    const onlineCount = users.filter((u) => isUserOnline(u.id)).length;
    const offlineCount = users.length - onlineCount;

    if (user?.role !== "ADMIN") {
        return <h4 className="text-danger">Access Denied: Admins Only</h4>;
    }

    return (
        <div className="page-wrapper">
            <BinaryBackground />
            <div className="container">
                <h2 className="gradient-text">REGISTERED USERS</h2>
                <p className="user-summary">
                    👥 Total: {users.length} | 🟢 Online: {onlineCount} | 🔴 Offline: {offlineCount}
                </p>

                {loading ? (
                    <p className="loading-text">Loading users...</p>
                ) : error ? (
                    <p className="error-text">{error}</p>
                ) : users.length === 0 ? (
                    <p className="no-users-text">No users found.</p>
                ) : (
                    <ul className="users-list">
                        {users.map((u) => (
                            <li
                                key={u.id}
                                className="user-item"
                            >
                                <div className="user-info">
                                    <span className="user-email">
                                        📧 <strong>{u.email}</strong> &nbsp;
                                        <span className="user-name">
                                            ({u.name || "No Name"})
                                        </span>
                                    </span>
                                    <br />
                                    <span className="user-details">
                                        🏷 Role: <span className={`user-role role-${u.role.toLowerCase()}`}>
                                            {u.role}
                                        </span>
                                        {" | 🕓 Joined: " + formatDate(u.createdAt)}
                                        {u.mfaEnabled && " | 🔒 MFA: Enabled"}
                                    </span>
                                </div>
                                <div className="user-actions">
                                    <span className={`user-status ${isUserOnline(u.id) ? 'online' : 'offline'}`}>
                                        {isUserOnline(u.id) ? '🟢 Online' : '🔴 Offline'}
                                    </span>
                                    <button
                                        className="delete-btn"
                                        onClick={() => deleteUser(u.id)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default AdminUserList;
