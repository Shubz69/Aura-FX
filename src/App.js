import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { EntitlementsProvider } from './context/EntitlementsContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { CommunityGuard, SubscriptionPageGuard, PremiumAIGuard, AdminGuard, AuthenticatedGuard } from './components/RouteGuards';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';
import GDPRModal from './components/GDPRModal';
import Footer from './components/Footer';
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import './styles/Courses.css';

/* Lazy-load pages so each route loads only when visited (faster initial load) */
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const SignUp = lazy(() => import('./pages/SignUp'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AdminUserList = lazy(() => import('./pages/AdminUserList'));
const Courses = lazy(() => import('./pages/Courses'));
const MyCourses = lazy(() => import('./pages/MyCourses'));
const Community = lazy(() => import('./pages/Community'));
const Explore = lazy(() => import('./pages/Explore'));
const WhyInfinity = lazy(() => import('./pages/WhyInfinity'));
const ContactUs = lazy(() => import('./pages/ContactUs'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Chatbot = lazy(() => import('./components/Chatbot'));
const Profile = lazy(() => import('./pages/Profile'));
const EditName = lazy(() => import('./pages/EditName'));
const EditEmail = lazy(() => import('./pages/EditEmail'));
const EditAddress = lazy(() => import('./pages/EditAddress'));
const EditPhone = lazy(() => import('./pages/EditPhone'));
const EditPassword = lazy(() => import('./pages/EditPassword'));
const AdminMessages = lazy(() => import('./pages/AdminMessages'));
const AdminInbox = lazy(() => import('./pages/AdminInbox'));
const Messages = lazy(() => import('./pages/Messages'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const VerifyMFA = lazy(() => import('./pages/VerifyMFA'));
const Subscription = lazy(() => import('./pages/Subscription'));
const ChoosePlan = lazy(() => import('./pages/ChoosePlan'));
const Settings = lazy(() => import('./pages/Settings'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const PremiumAI = lazy(() => import('./pages/PremiumAI'));

/** Prefetch common route chunks after initial load so navigation feels instant */
function usePrefetchRoutes() {
    useEffect(() => {
        const prefetch = () => {
            import('./pages/Courses');
            import('./pages/Explore');
            import('./pages/WhyInfinity');
            import('./pages/ContactUs');
            import('./pages/Login');
            import('./pages/SignUp');
        };
        if (typeof requestIdleCallback !== 'undefined') {
            const id = requestIdleCallback(prefetch, { timeout: 4000 });
            return () => cancelIdleCallback(id);
        }
        const t = setTimeout(prefetch, 2500);
        return () => clearTimeout(t);
    }, []);
}

/** Lightweight fallback while a route chunk loads (keeps perceived load fast) */
function PageLoadFallback() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            background: '#0a0a0a',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '1rem'
        }}>
            <span>Loading…</span>
        </div>
    );
}

function AppRoutes() {
    const { user, loading } = useAuth();
    // Only show chatbot to logged-out users; hide everywhere when logged in (including Community)
    const showChatbot = !user;
    const location = useLocation();
    const isHomePage = location.pathname === '/';

    const [showGDPR, setShowGDPR] = useState(false);

    usePrefetchRoutes();
    
    useEffect(() => {
        const accepted = localStorage.getItem("gdprAccepted");
        if (!accepted) {
            // If on home page, delay GDPR modal to show after loading screen (3 seconds)
            // Otherwise show immediately
            if (isHomePage) {
                const gdprTimer = setTimeout(() => {
                    setShowGDPR(true);
                }, 2000); // Show 0.5 seconds after loading screen ends (1.5s load + 0.5s)
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
                <Suspense fallback={<PageLoadFallback />}>
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
                    <Route path="/profile" element={<AuthenticatedGuard><Profile /></AuthenticatedGuard>} />
                    <Route path="/profile/edit-name" element={<AuthenticatedGuard><EditName /></AuthenticatedGuard>} />
                    <Route path="/profile/edit-email" element={<AuthenticatedGuard><EditEmail /></AuthenticatedGuard>} />
                    <Route path="/profile/edit-address" element={<AuthenticatedGuard><EditAddress /></AuthenticatedGuard>} />
                    <Route path="/profile/edit-phone" element={<AuthenticatedGuard><EditPhone /></AuthenticatedGuard>} />
                    <Route path="/profile/edit-password" element={<AuthenticatedGuard><EditPassword /></AuthenticatedGuard>} />
                    <Route path="/profile/:userId" element={<PublicProfile />} />
                    <Route path="/public-profile/:userId" element={<PublicProfile />} />
                    <Route path="/payment-success" element={<PaymentSuccess />} />
                    <Route path="/verify-mfa" element={<VerifyMFA />} />
                    {/* Choose plan - required after signup/login until plan selected; redirects to /community if already has access */}
                    <Route path="/choose-plan" element={<ChoosePlan />} />
                    {/* Subscription page - redirects paid users to /community */}
                    <Route path="/subscription" element={
                        <SubscriptionPageGuard>
                            <Subscription />
                        </SubscriptionPageGuard>
                    } />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />

                    {/* COMMUNITY ROUTES - STRICT ACCESS CONTROL */}
                    {/* Requires active paid subscription (Aura FX £99 or A7FX Elite £250) */}
                    <Route path="/community" element={
                        <CommunityGuard>
                            <Community />
                        </CommunityGuard>
                    } />
                    <Route path="/community/:channelId" element={
                        <CommunityGuard>
                            <Community />
                        </CommunityGuard>
                    } />
                    
                    {/* Premium AI - requires canAccessAI (PREMIUM/ELITE/ADMIN) */}
                    <Route path="/premium-ai" element={
                        <PremiumAIGuard>
                            <PremiumAI />
                        </PremiumAIGuard>
                    } />
                    
                    {/* Authenticated routes (no subscription required) */}
                    <Route path="/leaderboard" element={<AuthenticatedGuard><Leaderboard /></AuthenticatedGuard>} />
                    <Route path="/messages" element={<AuthenticatedGuard><Messages /></AuthenticatedGuard>} />

                    {/* Admin-only Routes */}
                    <Route path="/admin/messages" element={<AdminGuard><AdminMessages /></AdminGuard>} />
                    <Route path="/admin/inbox" element={<AdminGuard><AdminInbox /></AdminGuard>} />
                    <Route path="/admin" element={<AdminGuard><AdminPanel /></AdminGuard>} />
                    <Route path="/admin/users" element={<AdminGuard><AdminUserList /></AdminGuard>} />
                    <Route path="/admin/tools" element={<AdminGuard><AdminPanel /></AdminGuard>} />
                    <Route path="/settings" element={<AdminGuard><Settings /></AdminGuard>} />

                    <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
            </main>
            <Footer />
            {showChatbot && (
                <Suspense fallback={null}>
                    <Chatbot />
                </Suspense>
            )}
            <ToastContainer position="bottom-right" autoClose={3000} />
        </div>
    );
}

function App() {
    return (
        <Router>
            <AuthProvider>
                <SubscriptionProvider>
                    <EntitlementsProvider>
                        <WebSocketProvider>
                            <AppRoutes />
                        </WebSocketProvider>
                    </EntitlementsProvider>
                </SubscriptionProvider>
            </AuthProvider>
        </Router>
    );
}

export default App;
