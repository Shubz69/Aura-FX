import React, { useState, useEffect, useLayoutEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { EntitlementsProvider } from './context/EntitlementsContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { AuraConnectionProvider } from './context/AuraConnectionContext';
import { CommunityGuard, SubscriptionPageGuard, PremiumAIGuard, SurveillanceGuard, AdminGuard, AuthenticatedGuard, InboxGuard } from './components/RouteGuards';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';
import AuraDashboardGuard from './pages/aura-analysis/AuraDashboardGuard';
import GDPRModal from './components/GDPRModal';
import Footer from './components/Footer';
import CommunityRouteBoundary from './components/CommunityRouteBoundary';
import { consumePostLoginTransition, isPostLoginTransitionExcludedPath } from './utils/postLoginTransition';
import { LEGACY_MISSED_TRADE_REVIEW_PATH, PLAYBOOK_MISSED_REVIEW_PATH } from './lib/trader-playbook/playbookPaths';
import { ensureWebPushSubscription } from './utils/ensureWebPushSubscription';
import JournalReminderScheduler from './components/JournalReminderScheduler';
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import './styles/Courses.css';
import './styles/AuraPageTitle.css';

function Mt5MetricsLegacyRedirect() {
    const location = useLocation();
    return <Navigate to={`/manual-metrics/dashboard${location.search}`} replace />;
}

/** Old bookmarks: /reports/manual-metrics → standalone manual metrics */
function LegacyManualMetricsRedirect({ suffix = '' }) {
    const location = useLocation();
    return <Navigate to={`/manual-metrics${suffix}${location.search}`} replace />;
}

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
const OperatingSystem = lazy(() => import('./pages/OperatingSystem'));
const LiveMetricsPage = lazy(() => import('./pages/LiveMetricsPage'));
const MonthlyStatementsPage = lazy(() => import('./pages/MonthlyStatementsPage'));
const TraderPassportPage = lazy(() => import('./pages/TraderPassportPage'));
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
const PipelineHealthAdmin = lazy(() => import('./pages/PipelineHealthAdmin'));
const AdminIntegrationsHealth = lazy(() => import('./pages/AdminIntegrationsHealth'));
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
const OperatorEntry = lazy(() => import('./pages/aura-analysis/OperatorEntry'));
const OperatorShell = lazy(() => import('./components/trader-deck/OperatorShell'));
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
const AuraHabitsReport = lazy(() => import('./pages/aura-analysis/tabs/HabitsReport'));
const AuraGrowth = lazy(() => import('./pages/aura-analysis/tabs/GrowthEngine'));
const AuraAnalysisPlaceholder = lazy(() => import('./pages/aura-analysis/AuraAnalysisPlaceholder'));
const TradeCalculator = lazy(() => import('./pages/aura-analysis/TradeCalculator'));
const AuraAnalytics = lazy(() => import('./pages/aura-analysis/AuraAnalytics'));
const AuraLeaderboard = lazy(() => import('./pages/aura-analysis/AuraLeaderboard'));
const TraderCVTab = lazy(() => import('./pages/aura-analysis/TraderCVTab'));
const TraderDeckTradeJournal = lazy(() => import('./pages/trader-deck/TraderDeckTradeJournal'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const ReportsLiveAnalyticsHub = lazy(() => import('./pages/reports/ReportsLiveAnalyticsHub'));
const ReportsDnaPage = lazy(() => import('./pages/reports/ReportsDnaPage'));
const ManualMetricsEntryPage = lazy(() => import('./pages/reports/ManualMetricsEntryPage'));
const ManualMetricsProcessingPage = lazy(() => import('./pages/reports/ManualMetricsProcessingPage'));
const ManualMetricsDashboardPage = lazy(() => import('./pages/reports/ManualMetricsDashboardPage'));
const Affiliation = lazy(() => import('./pages/Affiliation'));
const TraderLab = lazy(() => import('./pages/TraderLab'));
const TraderReplay = lazy(() => import('./pages/TraderReplay'));
const TraderPlaybook = lazy(() => import('./pages/TraderPlaybook'));
const MissedTradeReview = lazy(() => import('./pages/MissedTradeReview'));
const PlaybookRouteOutlet = lazy(() => import('./pages/PlaybookRouteOutlet'));
const BacktestingLayout = lazy(() => import('./pages/backtesting/BacktestingLayout'));
const BacktestingHub = lazy(() => import('./pages/backtesting/BacktestingHub'));
const BacktestingNewSession = lazy(() => import('./pages/backtesting/BacktestingNewSession'));
const BacktestingWorkspace = lazy(() => import('./pages/backtesting/BacktestingWorkspace'));
const BacktestingSessions = lazy(() => import('./pages/backtesting/BacktestingSessions'));
const BacktestingTrades = lazy(() => import('./pages/backtesting/BacktestingTrades'));
const BacktestingReports = lazy(() => import('./pages/backtesting/BacktestingReports'));
const SurveillancePage = lazy(() => import('./pages/surveillance/SurveillancePage'));

/** Prefetch route chunks after initial load so navigation feels instant site-wide */
function usePrefetchRoutes() {
    useEffect(() => {
        const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
        const saveData = Boolean(conn && conn.saveData);
        const slowNetwork = Boolean(conn && /2g/i.test(conn.effectiveType || ''));
        if (saveData || slowNetwork) return undefined;

        const prefetch = () => {
            // Keep prefetch light: only highest-probability next routes.
            import('./pages/Login');
            import('./pages/SignUp');
            import('./pages/Community');
            import('./pages/PremiumAI');
        };
        if (typeof requestIdleCallback !== 'undefined') {
            const id = requestIdleCallback(prefetch, { timeout: 3000 });
            return () => cancelIdleCallback(id);
        }
        const t = setTimeout(prefetch, 1500);
        return () => clearTimeout(t);
    }, []);
}

/** Warm Aura dashboard tab chunks during idle time while user is on any dashboard route */
function usePrefetchAuraDashboardTabChunks() {
    const { pathname } = useLocation();
    useEffect(() => {
        if (!pathname.startsWith('/aura-analysis/dashboard')) return undefined;
        const prefetchTabs = () => {
            import('./pages/aura-analysis/tabs/PerformanceAnalytics');
            import('./pages/aura-analysis/tabs/RiskLab');
            import('./pages/aura-analysis/tabs/EdgeAnalyzer');
            import('./pages/aura-analysis/tabs/ExecutionLab');
            import('./pages/aura-analysis/tabs/CalendarIntelligence');
            import('./pages/aura-analysis/tabs/PsychologyDiscipline');
            import('./pages/aura-analysis/tabs/GrowthEngine');
            import('./pages/TraderReplay');
        };
        if (typeof requestIdleCallback !== 'undefined') {
            const id = requestIdleCallback(prefetchTabs, { timeout: 2400 });
            return () => cancelIdleCallback(id);
        }
        const t = setTimeout(prefetchTabs, 500);
        return () => clearTimeout(t);
    }, [pathname]);
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

    const [showGDPR, setShowGDPR] = useState(false);
    const [postLoginGateArmed, setPostLoginGateArmed] = useState(() => {
        if (isPostLoginTransitionExcludedPath(location.pathname)) return false;
        return consumePostLoginTransition();
    });
    const [postLoginTransitionActive, setPostLoginTransitionActive] = useState(() => postLoginGateArmed);
    const [postLoginLoadingActive, setPostLoginLoadingActive] = useState(() => postLoginGateArmed);

    usePrefetchRoutes();
    usePrefetchAuraDashboardTabChunks();

    /** Re-register Web Push when permission already granted (DMs, @mentions → device) */
    useEffect(() => {
        if (loading || !user?.id) return;
        const t = setTimeout(() => {
            ensureWebPushSubscription();
        }, 2500);
        return () => clearTimeout(t);
    }, [loading, user?.id]);

    /** Installed PWA / iOS “Add to Home Screen” — safe-area padding via html.pwa-standalone (see index.css) */
    useEffect(() => {
        const apply = () => {
            const standaloneMq =
                typeof window !== 'undefined' && window.matchMedia
                    ? window.matchMedia('(display-mode: standalone)').matches
                    : false;
            const iosStandalone =
                typeof window !== 'undefined' &&
                typeof window.navigator !== 'undefined' &&
                window.navigator.standalone === true;
            document.documentElement.classList.toggle('pwa-standalone', Boolean(standaloneMq || iosStandalone));
        };
        apply();
        const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
        if (mq?.addEventListener) {
            mq.addEventListener('change', apply);
            return () => mq.removeEventListener('change', apply);
        }
        return undefined;
    }, []);

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

    // Post-login splash: run once per pathname change only. Do NOT depend on postLoginGateArmed —
    // flipping that state re-ran this effect, cleared timers before they fired, and left
    // postLoginLoadingActive stuck true (full-screen loader forever), including on /choose-plan.
    useLayoutEffect(() => {
        if (isPostLoginTransitionExcludedPath(location.pathname)) {
            consumePostLoginTransition();
            setPostLoginGateArmed(false);
            setPostLoginTransitionActive(false);
            setPostLoginLoadingActive(false);
            return;
        }
        if (!postLoginGateArmed && !consumePostLoginTransition()) return;
        setPostLoginGateArmed(false);
        setPostLoginLoadingActive(true);
        setPostLoginTransitionActive(true);
        const fadeTimer = setTimeout(() => setPostLoginTransitionActive(false), 2200);
        const gateTimer = setTimeout(() => setPostLoginLoadingActive(false), 3000);
        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(gateTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit postLoginGateArmed; see comment above
    }, [location.pathname]);
    const handleAgreeGDPR = () => {
        localStorage.setItem("gdprAccepted", "true");
        setShowGDPR(false);
    };

    // Show loading screen while authentication is being checked
    if (loading) {
        return <LoadingSpinner />;
    }

    // Guaranteed login → community handoff screen on successful sign-in
    if (postLoginLoadingActive) {
        return <LoadingSpinner />;
    }

    return (
        <div className={`app-container${postLoginTransitionActive ? ' post-login-transition' : ''}`}>
            {showGDPR && <GDPRModal onAgree={handleAgreeGDPR} />}

            <Navbar />
            {user?.id ? <JournalReminderScheduler /> : null}

            {/* Main content area - page-wrapper now only contains the route content */}
            <main className={`page-wrapper${postLoginTransitionActive ? ' post-login-transition-surface' : ''}`}>
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
                        <Route path="/operating-system" element={<OperatingSystem />} />
                        <Route path="/live-metrics" element={<AuthenticatedGuard><LiveMetricsPage /></AuthenticatedGuard>} />
                        <Route path="/monthly-statements" element={<AuthenticatedGuard><MonthlyStatementsPage /></AuthenticatedGuard>} />
                        <Route path="/trader-passport" element={<AuthenticatedGuard><TraderPassportPage /></AuthenticatedGuard>} />
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
                        {/* Aura Analysis: Connection Hub (MT4/MT5 investor read-only) + dashboard. */}
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
                                <Route path="habits" element={<AuraHabitsReport />} />
                                <Route path="growth" element={<AuraGrowth />} />
                                <Route path="trader-replay" element={<TraderReplay />} />
                            </Route>
                        </Route>
                        <Route path="/trader-deck/trade-validator" element={<AuthenticatedGuard><OperatorShell /></AuthenticatedGuard>}>
                            <Route index element={<Navigate to="/trader-deck/trade-validator/overview" replace />} />
                            <Route path="checklist" element={<OperatorEntry />} />
                            <Route path="overview" element={<AuraOverview />} />
                            <Route path="calculator" element={<TradeCalculator />} />
                            <Route path="journal" element={<TraderDeckTradeJournal />} />
                            <Route path="ai-chart-check" element={<Navigate to="/trader-deck/trade-validator/checklist#ai-chart-check" replace />} />
                            <Route path="analytics" element={<AuraAnalytics />} />
                            <Route path="trader-cv" element={<TraderCVTab />} />
                            <Route path="leaderboard" element={<AuraLeaderboard />} />
                            <Route path="trader-lab" element={<TraderLab />} />
                            <Route path="missed-trade-review" element={<Navigate to={PLAYBOOK_MISSED_REVIEW_PATH} replace />} />
                            <Route path="trader-playbook" element={<PlaybookRouteOutlet />}>
                                <Route index element={<TraderPlaybook />} />
                                <Route path="missed-review" element={<MissedTradeReview />} />
                            </Route>
                            <Route path="trader-replay" element={<Navigate to="/aura-analysis/dashboard/trader-replay" replace />} />
                        </Route>
                        <Route path="/reports" element={<AuthenticatedGuard><ReportsPage /></AuthenticatedGuard>} />
                        <Route path="/reports/live" element={<AuthenticatedGuard><ReportsLiveAnalyticsHub /></AuthenticatedGuard>} />
                        <Route path="/reports/dna" element={<AuthenticatedGuard><ReportsDnaPage /></AuthenticatedGuard>} />
                        <Route path="/reports/mt5-metrics" element={<Mt5MetricsLegacyRedirect />} />
                        <Route path="/reports/manual-metrics/dashboard" element={<LegacyManualMetricsRedirect suffix="/dashboard" />} />
                        <Route path="/reports/manual-metrics/processing" element={<LegacyManualMetricsRedirect suffix="/processing" />} />
                        <Route path="/reports/manual-metrics" element={<LegacyManualMetricsRedirect />} />
                        <Route path="/manual-metrics/dashboard" element={<AuthenticatedGuard><ManualMetricsDashboardPage /></AuthenticatedGuard>} />
                        <Route path="/manual-metrics/processing" element={<AuthenticatedGuard><ManualMetricsProcessingPage /></AuthenticatedGuard>} />
                        <Route path="/manual-metrics" element={<AuthenticatedGuard><ManualMetricsEntryPage /></AuthenticatedGuard>} />
                        <Route path="/trader-deck" element={<AuthenticatedGuard><TraderDeck /></AuthenticatedGuard>} />
                        <Route path="/trader-lab" element={<AuthenticatedGuard><Navigate to="/trader-deck/trade-validator/trader-lab" replace /></AuthenticatedGuard>} />
                        <Route path="/trader-replay" element={<AuthenticatedGuard><Navigate to="/aura-analysis/dashboard/trader-replay" replace /></AuthenticatedGuard>} />
                        <Route path="/trader-playbook" element={<AuthenticatedGuard><Navigate to="/trader-deck/trade-validator/trader-playbook" replace /></AuthenticatedGuard>} />
                        <Route path="/trader-playbook/missed-review" element={<AuthenticatedGuard><Navigate to={PLAYBOOK_MISSED_REVIEW_PATH} replace /></AuthenticatedGuard>} />
                        <Route path="/journal" element={<AuthenticatedGuard><Journal /></AuthenticatedGuard>} />
                        <Route path="/surveillance" element={<AuthenticatedGuard><SurveillanceGuard><SurveillancePage /></SurveillanceGuard></AuthenticatedGuard>} />
                        <Route path="/backtesting" element={<AuthenticatedGuard><BacktestingLayout /></AuthenticatedGuard>}>
                            <Route index element={<BacktestingHub />} />
                            <Route path="new" element={<BacktestingNewSession />} />
                            <Route path="sessions" element={<BacktestingSessions />} />
                            <Route path="trades" element={<BacktestingTrades />} />
                            <Route path="reports" element={<BacktestingReports />} />
                            <Route path="session/:sessionId/*" element={<BacktestingWorkspace />} />
                        </Route>
                        <Route path="/admin/messages" element={<AdminGuard><AdminMessages /></AdminGuard>} />
                        <Route path="/admin/inbox" element={<InboxGuard><AdminInbox /></InboxGuard>} />
                        <Route path="/admin" element={<AdminGuard><AdminPanel /></AdminGuard>} />
                        <Route path="/admin/users" element={<AdminGuard><AdminUserList /></AdminGuard>} />
                        <Route path="/admin/journal" element={<AdminGuard><AdminJournal /></AdminGuard>} />
                        <Route path="/admin/pipeline-health" element={<AdminGuard><PipelineHealthAdmin /></AdminGuard>} />
                        <Route path="/admin/integration-health" element={<AdminGuard><AdminIntegrationsHealth /></AdminGuard>} />
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