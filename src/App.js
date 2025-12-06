import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';
import Login from './pages/Login';
import Register from './pages/Register';
import SignUp from './pages/SignUp';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminUserList from './pages/AdminUserList';
import Home from './pages/Home';
import Courses from './pages/Courses';
import MyCourses from './pages/MyCourses';
import Community from './pages/Community';
import Explore from './pages/Explore';
import WhyInfinity from './pages/WhyInfinity';
import ContactUs from './pages/ContactUs';
import NotFound from './pages/NotFound';
import Chatbot from './components/Chatbot';
import Footer from './components/Footer';
import Profile from "./pages/Profile";
import EditName from './pages/EditName';
import EditEmail from './pages/EditEmail';
import EditAddress from './pages/EditAddress';
import EditPhone from './pages/EditPhone';
import EditPassword from './pages/EditPassword';
import AdminMessages from './pages/AdminMessages';
import Messages from './pages/Messages';
import PublicProfile from './pages/PublicProfile';
import Leaderboard from './pages/Leaderboard';
import AdminPanel from './pages/AdminPanel';
import PaymentSuccess from './pages/PaymentSuccess';
import VerifyMFA from './pages/VerifyMFA';
import Subscription from './pages/Subscription';
import Settings from './pages/Settings';

import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';

import GDPRModal from './components/GDPRModal';

function AppRoutes() {
    const { user, loading } = useAuth();
    const showChatbot = true;
    const location = useLocation();
    const isHomePage = location.pathname === '/';

    const [showGDPR, setShowGDPR] = useState(false);
    
    useEffect(() => {
        const accepted = localStorage.getItem("gdprAccepted");
        if (!accepted) {
            // If on home page, delay GDPR modal to show after loading screen (3 seconds)
            // Otherwise show immediately
            if (isHomePage) {
                const gdprTimer = setTimeout(() => {
                    setShowGDPR(true);
                }, 3500); // Show 0.5 seconds after loading screen ends
                return () => clearTimeout(gdprTimer);
            } else {
                setShowGDPR(true);
            }
        }
    }, [isHomePage]);
    const handleAgreeGDPR = () => {
        localStorage.setItem("gdprAccepted", "true");
        setShowGDPR(false);
    };

    // Show loading screen while authentication is being checked
    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="app-container">
            {showGDPR && <GDPRModal onAgree={handleAgreeGDPR} />}

            <Navbar />
            <main className="page-wrapper">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/signup" element={<SignUp />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/courses" element={<Courses />} />
                    <Route path="/my-courses" element={<MyCourses />} />
                    <Route path="/explore" element={<Explore />} />
                    <Route path="/why-glitch" element={<WhyInfinity />} />
                    <Route path="/contact" element={<ContactUs />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/profile/edit-name" element={<EditName />} />
                    <Route path="/profile/edit-email" element={<EditEmail />} />
                    <Route path="/profile/edit-address" element={<EditAddress />} />
                    <Route path="/profile/edit-phone" element={<EditPhone />} />
                    <Route path="/profile/edit-password" element={<EditPassword />} />
                    <Route path="/profile/:userId" element={<PublicProfile />} />
                    <Route path="/public-profile/:userId" element={<PublicProfile />} />
                    <Route path="/payment-success" element={<PaymentSuccess />} />
                    <Route path="/verify-mfa" element={<VerifyMFA />} />
                    <Route path="/subscription" element={<Subscription />} />



                    {user && (
                        <>
                            <Route path="/community" element={<Community />} />
                            <Route path="/community/:channelId" element={<Community />} />
                            <Route path="/leaderboard" element={<Leaderboard />} />
                            <Route path="/messages" element={<Messages />} />
                        </>
                    )}

                    {/* Admin-only Routes */}
                    <Route path="/admin/messages" element={(user?.role === "ADMIN" || user?.role === "admin" || user?.role === "super_admin" || user?.email?.toLowerCase() === 'shubzfx@gmail.com') ? <AdminMessages /> : <Navigate to="/" />} />
                    <Route path="/admin" element={(user?.role === "ADMIN" || user?.role === "admin" || user?.role === "super_admin" || user?.email?.toLowerCase() === 'shubzfx@gmail.com') ? <AdminPanel /> : <Navigate to="/" />} />
                    <Route path="/admin/users" element={(user?.role === "ADMIN" || user?.role === "admin" || user?.role === "super_admin" || user?.email?.toLowerCase() === 'shubzfx@gmail.com') ? <AdminUserList /> : <Navigate to="/" />} />
                    <Route path="/admin/tools" element={(user?.role === "ADMIN" || user?.role === "admin" || user?.role === "super_admin" || user?.email?.toLowerCase() === 'shubzfx@gmail.com') ? <AdminPanel /> : <Navigate to="/" />} />
                    <Route path="/settings" element={(user?.role === "ADMIN" || user?.role === "admin" || user?.role === "SUPER_ADMIN" || user?.role === "super_admin" || user?.email?.toLowerCase() === 'shubzfx@gmail.com') ? <Settings /> : <Navigate to="/" />} />

                    <Route path="*" element={<NotFound />} />
                </Routes>
            </main>
            <Footer />
            {showChatbot && <Chatbot />}
            <ToastContainer position="bottom-right" autoClose={3000} />
        </div>
    );
}

function App() {
    return (
        <Router>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </Router>

    );
}

export default App;
