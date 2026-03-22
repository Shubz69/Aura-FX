import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { EntitlementsProvider } from './context/EntitlementsContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { AuraConnectionProvider } from './context/AuraConnectionContext';
import { CommunityGuard, SubscriptionPageGuard, PremiumAIGuard, AdminGuard, AuthenticatedGuard, InboxGuard } from './components/RouteGuards';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';
import AuraDashboardGuard from './pages/aura-analysis/AuraDashboardGuard';
import GDPRModal from './components/GDPRModal';
import Footer from './components/Footer';
import CommunityRouteBoundary from './components/CommunityRouteBoundary';
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import './styles/index.css';
import './styles/Courses.css';
import './styles/AppCosmicBackground.css';
import './styles/GlassSystem.css';
import { shouldUseAppCosmicBackground } from './utils/appCosmicBackground';


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
const AdminJournal = lazy(() => import('./pages/AdminJournal'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const VerifyMFA = lazy(() => import('./pages/VerifyMFA'));
const Subscription = lazy(() => import('./pages/Subscription'));
const ChoosePlan = lazy(() => import('./pages/ChoosePlan'));
const Settings = lazy(() => import('./pages/Settings'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const PremiumAI = lazy(() => import('./pages/PremiumAI'));
const Journal = lazy(() => import('./pages/Journal'));
const AuraAnalysis = lazy(() => import('./pages/AuraAnalysis'));
const AuraAnalysisShell = lazy(() => import('./components/aura-analysis/AuraAnalysisShell'));
const AuraAnalysisGateway = lazy(() => import('./pages/aura-analysis/AuraAnalysisGateway'));
const TradeValidatorEntry = lazy(() => import('./pages/aura-analysis/TradeValidatorEntry'));
const TradeValidatorShell = lazy(() => import('./components/trader-deck/TradeValidatorShell'));
/** Resolves to src/pages/TraderDeck.js – do not remove or rename; required for build. */
const TraderDeck = lazy(() => import('./pages/TraderDeck'));
const ConnectionHub = lazy(() => import('./pages/aura-analysis/ConnectionHub'));
const AuraDashboardLayout = lazy(() => import('./pages/aura-analysis/AuraDashboardLayout'));
const AuraOverview = lazy(() => import('./pages/aura-analysis/tabs/Overview'));
const AuraOverviewDashboard = lazy(() => import('./pages/aura-analysis/tabs/OverviewDashboard'));
const AuraPerformance = lazy(() => import('./pages/aura-analysis/tabs/PerformanceAnalytics'));
const AuraRiskLab = lazy(() => import('./pages/aura-analysis/tabs/RiskLab'));
const AuraEdgeAnalyzer = lazy(() => import('./pages/aura-analysis/tabs/EdgeAnalyzer'));
const AuraExecutionLab = lazy(() => import('./pages/aura-analysis/tabs/ExecutionLab'));
const AuraCalendar = lazy(() => import('./pages/aura-analysis/tabs/CalendarIntelligence'));
const AuraPsychology = lazy(() => import('./pages/aura-analysis/tabs/PsychologyDiscipline'));
const AuraGrowth = lazy(() => import('./pages/aura-analysis/tabs/GrowthEngine'));
const AuraAnalysisPlaceholder = lazy(() => import('./pages/aura-analysis/AuraAnalysisPlaceholder'));
const TradeCalculator = lazy(() => import('./pages/aura-analysis/TradeCalculator'));
const AuraAnalytics = lazy(() => import('./pages/aura-analysis/AuraAnalytics'));
const AuraLeaderboard = lazy(() => import('./pages/aura-analysis/AuraLeaderboard'));
const TraderCVTab = lazy(() => import('./pages/aura-analysis/TraderCVTab'));
const TraderDeckTradeJournal = lazy(() => import('./pages/trader-deck/TraderDeckTradeJournal'));
const AiChartCheckTab = lazy(() => import('./pages/aura-analysis/AiChartCheckTab'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const ReportsDnaPage = lazy(() => import('./pages/reports/ReportsDnaPage'));
const Affiliation = lazy(() => import('./pages/Affiliation'));

/** Prefetch route chunks after initial load so navigation feels instant site-wide */
function usePrefetchRoutes() {
    useEffect(() => {
        const prefetch = () => {
            import('./pages/Courses');
            import('./pages/Explore');
            import('./pages/WhyInfinity');
            import('./pages/ContactUs');
            import('./pages/Login');
            import('./pages/SignUp');
            import('./pages/Leaderboard');
            import('./pages/Profile');
            import('./pages/Journal');
            import('./pages/Messages');
            import('./pages/Community');
            import('./pages/Subscription');
            import('./pages/ChoosePlan');
            import('./pages/PremiumAI');
            import('./pages/PublicProfile');
        };
        if (typeof requestIdleCallback !== 'undefined') {
            const id = requestIdleCallback(prefetch, { timeout: 3000 });
            return () => cancelIdleCallback(id);
        }
        const t = setTimeout(prefetch, 1500);
        return () => clearTimeout(t);
    }, []);
}

/** Lightweight fallback while a route chunk loads (memoized to avoid re-renders) */
const PageLoadFallback = React.memo(function PageLoadFallback() {
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
});

function AppRoutes() {
    const { user, loading } = useAuth();
    // Only show chatbot to logged-out users; hide everywhere when logged in (including Community)
    const showChatbot = !user;
    const location = useLocation();
    const isHomePage = location.pathname === '/';
    const appCosmicBg = useMemo(
        () => shouldUseAppCosmicBackground(location.pathname),
        [location.pathname],
    );

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
            
            {/* Main content area - page-wrapper now only contains the route content */}
            <main className={`page-wrapper${appCosmicBg ? ' app-cosmic-bg' : ''}`}>
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
                        <Route path="/choose-plan" element={<ChoosePlan />} />
                        <Route path="/subscription" element={
                            <SubscriptionPageGuard>
                                <Subscription />
                            </SubscriptionPageGuard>
                        } />
                        <Route path="/affiliation" element={<AuthenticatedGuard><Affiliation /></AuthenticatedGuard>} />
                        <Route path="/terms" element={<Terms />} />
                        <Route path="/privacy" element={<Privacy />} />
                        <Route path="/community" element={
                            <CommunityGuard>
                                <CommunityRouteBoundary>
                                    <Community />
                                </CommunityRouteBoundary>
                            </CommunityGuard>
                        } />
                        <Route path="/community/:channelId" element={
                            <CommunityGuard>
                                <CommunityRouteBoundary>
                                    <Community />
                                </CommunityRouteBoundary>
                            </CommunityGuard>
                        } />
                        <Route path="/premium-ai" element={
                            <PremiumAIGuard>
                                <PremiumAI />
                            </PremiumAIGuard>
                        } />
                        <Route path="/leaderboard" element={<AuthenticatedGuard><Leaderboard /></AuthenticatedGuard>} />
                        <Route path="/messages" element={<AuthenticatedGuard><Messages /></AuthenticatedGuard>} />
                        {/* Aura Analysis = MT5 only (Connection Hub + dashboard). No Trade Validator. */}
                        <Route path="/aura-analysis" element={<AuthenticatedGuard><AuraAnalysis /></AuthenticatedGuard>}>
                            <Route index element={<Navigate to="/aura-analysis/ai" replace />} />
                            <Route path="ai" element={<ConnectionHub />} />
                            <Route path="overview" element={<Navigate to="/aura-analysis/dashboard/overview" replace />} />
                            <Route path="dashboard" element={<AuraDashboardGuard><AuraDashboardLayout /></AuraDashboardGuard>}>
                                <Route index element={<Navigate to="overview" replace />} />
                                <Route path="overview" element={<AuraOverviewDashboard />} />
                                <Route path="performance" element={<AuraPerformance />} />
                                <Route path="risk-lab" element={<AuraRiskLab />} />
                                <Route path="edge-analyzer" element={<AuraEdgeAnalyzer />} />
                                <Route path="execution-lab" element={<AuraExecutionLab />} />
                                <Route path="calendar" element={<AuraCalendar />} />
                                <Route path="psychology" element={<AuraPsychology />} />
                                <Route path="growth" element={<AuraGrowth />} />
                            </Route>
                        </Route>
                        <Route path="/trader-deck/trade-validator" element={<AuthenticatedGuard><TradeValidatorShell /></AuthenticatedGuard>}>
                            <Route index element={<Navigate to="/trader-deck/trade-validator/overview" replace />} />
                            <Route path="checklist" element={<TradeValidatorEntry />} />
                            <Route path="overview" element={<AuraOverview />} />
                            <Route path="calculator" element={<TradeCalculator />} />
                            <Route path="journal" element={<TraderDeckTradeJournal />} />
                            <Route path="ai-chart-check" element={<AiChartCheckTab />} />
                            <Route path="analytics" element={<AuraAnalytics />} />
                            <Route path="trader-cv" element={<TraderCVTab />} />
                            <Route path="leaderboard" element={<AuraLeaderboard />} />
                        </Route>
                        <Route path="/reports" element={<AuthenticatedGuard><ReportsPage /></AuthenticatedGuard>} />
                        <Route path="/reports/dna" element={<AuthenticatedGuard><ReportsDnaPage /></AuthenticatedGuard>} />
                        <Route path="/trader-deck" element={<AuthenticatedGuard><TraderDeck /></AuthenticatedGuard>} />
                        <Route path="/journal" element={<AuthenticatedGuard><Journal /></AuthenticatedGuard>} />
                        <Route path="/admin/messages" element={<AdminGuard><AdminMessages /></AdminGuard>} />
                        <Route path="/admin/inbox" element={<InboxGuard><AdminInbox /></InboxGuard>} />
                        <Route path="/admin" element={<AdminGuard><AdminPanel /></AdminGuard>} />
                        <Route path="/admin/users" element={<AdminGuard><AdminUserList /></AdminGuard>} />
                        <Route path="/admin/journal" element={<AdminGuard><AdminJournal /></AdminGuard>} />
                        <Route path="/admin/tools" element={<AdminGuard><AdminPanel /></AdminGuard>} />
                        <Route path="/settings" element={<AdminGuard><Settings /></AdminGuard>} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Suspense>
                 <Footer />
            </main>

           
           

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
                            <AuraConnectionProvider>
                                <AppRoutes />
                            </AuraConnectionProvider>
                        </WebSocketProvider>
                    </EntitlementsProvider>
                </SubscriptionProvider>
            </AuthProvider>
        </Router>
    );
}

export default App;