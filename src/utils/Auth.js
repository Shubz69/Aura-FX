import { jwtDecode } from "jwt-decode";

export const getCurrentUserId = () => {
    const token = localStorage.getItem("jwtToken");
    if (!token) return null;

    try {
        const decoded = jwtDecode(token);
        return decoded.userId || decoded.id || decoded.sub || null;
    } catch (e) {
        console.error("Failed to decode JWT:", e);
        return null;
    }
};
