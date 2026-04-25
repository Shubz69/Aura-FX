import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useWebSocket } from '../utils/useWebSocket';
import ConfirmationModal from '../components/ConfirmationModal';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import Api from '../services/Api';
import AdminApi from '../services/AdminApi';
import { FaHeartbeat, FaSearch, FaUserShield, FaProjectDiagram } from 'react-icons/fa';
import '../styles/AdminPanel.css';
import { isSuperAdmin as hasSuperAdminRole, isConfiguredSuperAdminEmail } from '../utils/roles';

/** Admin card label: env-listed super admins match primary super-admin UX even if DB was left as admin. */
function getUserPlanKey(userItem) {
  return (userItem?.subscription_plan || userItem?.subscriptionPlan || '').toString().toLowerCase();
}

function adminPanelRoleLabel(userItem) {
  const r = (userItem?.role || '').toString().toLowerCase();
  if (r === 'super_admin' || isConfiguredSuperAdminEmail(userItem?.email)) return 'SUPER ADMIN';
  if (r === 'admin') return 'ADMIN';
  const plan = getUserPlanKey(userItem);
  if (plan === 'elite') return 'ELITE';
  if (plan === 'pro') return 'PRO';
  return 'ACCESS';
}

function isRowSuperAdminOrAdmin(userItem) {
  const r = (userItem?.role || '').toString().toLowerCase();
  if (r === 'super_admin' || r === 'admin') return true;
  if (isConfiguredSuperAdminEmail(userItem?.email)) return true;
  return false;
}

const PLAN_OPTIONS = [
  { value: 'access', label: 'Access', needsDuration: false },
  { value: 'pro', label: 'Pro', needsDuration: true },
  { value: 'elite', label: 'Elite', needsDuration: true },
  { value: 'admin', label: 'Admin', needsDuration: false },
  { value: 'super_admin', label: 'Super Admin', needsDuration: false },
];

function normalizePlanForSelect(raw) {
  const p = (raw || 'access').toLowerCase();
  if (PLAN_OPTIONS.some((o) => o.value === p)) return p;
  if (p === 'free' || p === 'user' || p === 'open') return 'access';
  if (p === 'aura' || p === 'premium') return 'pro';
  if (p === 'a7fx' || p === 'elite') return 'elite';
  if (p === 'admin') return 'admin';
  if (p === 'super_admin' || p === 'superadmin') return 'super_admin';
  return 'access';
}

/** Initial <select> value: staff roles from DB role; else map legacy subscription_plan → tier. */
function initialAccessPlanSelect(userItem) {
  const r = (userItem?.role || '').toString().toLowerCase();
  if (r === 'super_admin') return 'super_admin';
  if (r === 'admin') return 'admin';
  const plan = getUserPlanKey(userItem);
  return normalizePlanForSelect(plan);
}

function analyzeTemplateDraft(draft, period) {
  const text = String(draft || '').trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const issues = [];
  const sections = [];
  let instruments = [];
  let hasNoSourcesRule = /no sources/i.test(text);

  let inSections = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower === 'sections:' || lower.startsWith('sections:')) {
      inSections = true;
      continue;
    }
    if (lower.startsWith('instruments:')) {
      inSections = false;
      const raw = line.split(':').slice(1).join(':');
      instruments = raw.split(',').map((x) => x.trim()).filter(Boolean);
      continue;
    }
    if (inSections && /^-\s+/.test(line)) {
      sections.push(line.replace(/^-\s+/, '').trim());
    }
  }

  if (sections.length < 4) {
    issues.push('Too few sections found. Add at least 4 section headings under "Sections:".');
  }
  if (instruments.length < 4) {
    issues.push('Too few instruments found. Add instrument list as "Instruments: EURUSD, GBPUSD, ...".');
  }
  if (!hasNoSourcesRule) {
    issues.push('Missing explicit "no sources" instruction in template text.');
  }
  if (period === 'weekly' && !/week|weekly/i.test(text)) {
    issues.push('Weekly template should mention weekly context in heading/tone.');
  }
  if (period === 'daily' && !/daily|session/i.test(text)) {
    issues.push('Daily template should mention daily/session context.');
  }

  const improvedLines = [...lines];
  if (!lines.some((l) => l.toLowerCase().startsWith('sections:'))) {
    improvedLines.push('Sections:');
  }
  if (sections.length === 0) {
    const defaults = period === 'weekly'
      ? ['Weekly Macro Theme', 'Instrument Outlook', 'Event Map', 'Risk Radar', 'Playbook']
      : ['Market Context', 'Instrument Outlook', 'Session Focus', 'Risk Radar', 'Execution Notes'];
    defaults.forEach((s) => improvedLines.push(`- ${s}`));
  }
  if (instruments.length < 4) {
    const defaults = period === 'weekly'
      ? 'EURUSD, GBPUSD, USDJPY, AUDUSD, XAUUSD, US500, NAS100, DXY'
      : 'EURUSD, GBPUSD, USDJPY, XAUUSD, US500, NAS100, DXY';
    improvedLines.push(`Instruments: ${defaults}`);
  }
  if (!hasNoSourcesRule) {
    improvedLines.push('Style: Institutional concise, no sources shown.');
  }

  return {
    issues,
    sections,
    instruments,
    suggested: improvedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

const STAFF_PLAN_VALUES = new Set(['admin', 'super_admin']);

/** Modal: set subscription plan + duration (paid plans), or staff role when allowed. */
function SubscriptionAccessModal({ open, title, userEmail, initialPlan, includeStaffRoles, onClose, onConfirm, submitting }) {
  const [plan, setPlan] = useState('access');
  const [days, setDays] = useState('90');

  const planChoices = useMemo(
    () => (includeStaffRoles ? PLAN_OPTIONS : PLAN_OPTIONS.filter((o) => !STAFF_PLAN_VALUES.has(o.value))),
    [includeStaffRoles]
  );

  useEffect(() => {
    if (!open) return;
    let next = normalizePlanForSelect(initialPlan);
    if (!includeStaffRoles && STAFF_PLAN_VALUES.has(next)) next = 'access';
    setPlan(next);
    setDays('90');
  }, [open, initialPlan, includeStaffRoles]);

  if (!open) return null;

  const needsDuration = planChoices.some((o) => o.value === plan && o.needsDuration);
  const handleSubmit = (e) => {
    e.preventDefault();
    const d = parseInt(days, 10);
    if (needsDuration && (!Number.isFinite(d) || d < 1)) {
      alert('Enter a valid number of days (1–3650).');
      return;
    }
    if (needsDuration && d > 3650) {
      alert('Maximum duration is 3650 days.');
      return;
    }
    onConfirm(plan, needsDuration ? d : null);
  };

  return (
    <div className="ap-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ap-modal ap-modal--access"
        role="dialog"
        aria-labelledby="ap-access-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ap-access-title" className="ap-modal__title">
          {title}
        </h2>
        <p className="ap-modal__email">{userEmail}</p>
        <form onSubmit={handleSubmit} className="ap-modal__form">
          <label className="ap-modal__label" htmlFor="ap-access-plan">
            Plan
          </label>
          <select
            id="ap-access-plan"
            className="ap-modal__select"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            {planChoices.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="ap-modal__label" htmlFor="ap-access-days">
            Duration (days)
          </label>
          <input
            id="ap-access-days"
            type="number"
            min={1}
            max={3650}
            className="ap-modal__input"
            disabled={!needsDuration}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="90"
          />
          <p className="ap-modal__hint">
            {plan === 'admin' || plan === 'super_admin'
              ? 'Sets the account permission role (Super Admin only for this action). Does not set a paid subscription window; use Pro or Elite for timed product access.'
              : needsDuration
                ? 'Access expires after this many days from now. Pro and Elite stay active until that date. Surveillance follows product entitlements; admins always have staff tools for support.'
                : 'Access tier clears paid expiry and deactivates subscription billing state for this user.'}
          </p>

          <div className="ap-modal__actions">
            <button type="button" className="ap-modal__btn ap-modal__btn--ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="ap-modal__btn ap-modal__btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const AdminPanel = () => {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, userId: null, userEmail: null });
    const [channels, setChannels] = useState([]);
    const [channelsLoading, setChannelsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'channels' | 'referral-payouts' | 'market-decoder-feeds' | 'brief-templates'
    const [searchTerm, setSearchTerm] = useState(''); // Search filter for users
    const [accessModal, setAccessModal] = useState({
        open: false,
        userId: null,
        userEmail: null,
        initialPlan: 'access',
        title: 'Set access',
    });
    const [accessSubmitting, setAccessSubmitting] = useState(false);
    const [templatePeriod, setTemplatePeriod] = useState('daily');
    const [templateDraft, setTemplateDraft] = useState('');
    const [templateLoading, setTemplateLoading] = useState(false);
    const [templateSaving, setTemplateSaving] = useState(false);
    const [templateStatus, setTemplateStatus] = useState('');
    const [templatePreview, setTemplatePreview] = useState({ issues: [], sections: [], instruments: [], suggested: '' });
    const [briefToolsUnlocked, setBriefToolsUnlocked] = useState(false);
    const [referralPayouts, setReferralPayouts] = useState([]);
    const [referralPayoutsLoading, setReferralPayoutsLoading] = useState(false);
    const [referralPayoutsStatusFilter, setReferralPayoutsStatusFilter] = useState('');
    const [payoutActionBusyId, setPayoutActionBusyId] = useState(null);
    const [reverseSourceTable, setReverseSourceTable] = useState('stripe_checkout_session');
    const [reverseSourceId, setReverseSourceId] = useState('');
    const [reverseReason, setReverseReason] = useState('admin_reversal');
    const [reversingEvent, setReversingEvent] = useState(false);
    const [recentReversals, setRecentReversals] = useState([]);
    const [reversalSourceFilter, setReversalSourceFilter] = useState('');
    const [reversalWindowDays, setReversalWindowDays] = useState('30');
    const [feedDiagSymbol, setFeedDiagSymbol] = useState('EURUSD');
    const [feedDiagLoading, setFeedDiagLoading] = useState(false);
    const [feedDiagResult, setFeedDiagResult] = useState(null);
    const [feedDiagErr, setFeedDiagErr] = useState(null);
    const [tdAutoStatus, setTdAutoStatus] = useState(null);
    const [tdAutoStatusLoading, setTdAutoStatusLoading] = useState(false);
    const [tdAutoStatusErr, setTdAutoStatusErr] = useState(null);
    const [busyActionKey, setBusyActionKey] = useState(null);
    const [channelsRefreshing, setChannelsRefreshing] = useState(false);

    const withBusyAction = useCallback(async (key, fn) => {
        if (busyActionKey) return;
        setBusyActionKey(key);
        try {
            await fn();
        } finally {
            setBusyActionKey(null);
        }
    }, [busyActionKey]);

    // Handle real-time online status updates from WebSocket
    const handleOnlineStatusUpdate = (data) => {
        if (data && Array.isArray(data)) {
            setOnlineUsers(new Set(data));
        }
    };

    // WebSocket connection for real-time updates
    const { isConnected } = useWebSocket(null, handleOnlineStatusUpdate, true);

    // Check if user is authenticated and is an admin
    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        
        const userRole = user?.role?.toLowerCase() || '';
        const isAdmin = userRole === 'admin' || hasSuperAdminRole(user);
        
        if (user && !isAdmin) {
            navigate('/');
            return;
        }
        
        // Only fetch data if user is authenticated and is an admin
        fetchUsers();
        fetchChannels();
        fetchOnlineStatus();
        
        // Set up periodic refresh for online status
        const interval = setInterval(fetchOnlineStatus, 30000); // Refresh every 30 seconds
        
        return () => clearInterval(interval);
    }, [user, isAuthenticated, navigate]);
    
    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('token');
            
            // Try multiple API endpoints
            let response = await fetch(`/api/admin/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            // If that fails, try community endpoint
            if (!response.ok) {
                response = await fetch(`/api/community/users`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch users');
            }
            
            const data = await response.json();
            // Handle different response formats
            const usersList = Array.isArray(data) ? data : (data.users || data.data || []);
            const normalizedUsers = usersList.map((u) => {
                const normalizedPlan = (u.subscription_plan || u.subscriptionPlan || '').toString().toLowerCase() || 'access';
                return {
                    ...u,
                    subscription_plan: normalizedPlan,
                    subscriptionPlan: normalizedPlan,
                };
            });
            setUsers(normalizedUsers);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError(err.message || 'Failed to load users. Please try again.');
            setUsers([]); // Set empty array on error
        } finally {
            setLoading(false);
        }
    };

    const fetchOnlineStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/user-status`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setOnlineUsers(new Set(data.onlineUsers.map(u => u.id)));
            }
        } catch (err) {
        }
    };

    const fetchChannels = async () => {
        try {
            setChannelsLoading(true);
            setChannelsRefreshing(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/community/channels`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setChannels(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Error fetching channels:', err);
        } finally {
            setChannelsLoading(false);
            setChannelsRefreshing(false);
        }
    };

    const fetchReferralPayouts = useCallback(async () => {
        try {
            setReferralPayoutsLoading(true);
            const [res, revRes] = await Promise.all([
                AdminApi.getReferralPayouts({
                    page: 1,
                    pageSize: 50,
                    ...(referralPayoutsStatusFilter ? { status: referralPayoutsStatusFilter } : {}),
                }),
                AdminApi.getReferralReversalHistory(12, reversalSourceFilter, Number(reversalWindowDays) || 0),
            ]);
            const items = Array.isArray(res?.data?.items) ? res.data.items : [];
            const revItems = Array.isArray(revRes?.data?.items) ? revRes.data.items : [];
            setReferralPayouts(items);
            setRecentReversals(revItems);
        } catch (err) {
            console.error('Error loading referral payouts:', err);
            setError(err?.response?.data?.message || 'Failed to load referral payouts');
        } finally {
            setReferralPayoutsLoading(false);
        }
    }, [referralPayoutsStatusFilter, reversalSourceFilter, reversalWindowDays]);

    useEffect(() => {
        if (activeTab === 'referral-payouts') {
            fetchReferralPayouts();
        }
    }, [activeTab, fetchReferralPayouts]);

    const handlePayoutAction = async (id, action) => {
        try {
            setPayoutActionBusyId(id);
            await AdminApi.processReferralPayout(id, action, {});
            await fetchReferralPayouts();
            setError(null);
        } catch (err) {
            console.error(`Payout ${action} failed:`, err);
            setError(err?.response?.data?.message || `Failed to ${action} payout`);
        } finally {
            setPayoutActionBusyId(null);
        }
    };

    const runFeedDiagnostics = async () => {
        const sym = String(feedDiagSymbol || '').trim().toUpperCase() || 'EURUSD';
        setFeedDiagLoading(true);
        setFeedDiagErr(null);
        setFeedDiagResult(null);
        try {
            const res = await AdminApi.getMarketDecoderDiagnostics(sym);
            setFeedDiagResult(res.data);
        } catch (err) {
            setFeedDiagErr(err?.response?.data?.message || err.message || 'Diagnostics request failed');
        } finally {
            setFeedDiagLoading(false);
        }
    };

    const fetchTraderDeskAutomationStatus = useCallback(async () => {
        setTdAutoStatusLoading(true);
        setTdAutoStatusErr(null);
        try {
            const res = await AdminApi.getTraderDeskAutomationStatus();
            setTdAutoStatus(res.data);
        } catch (err) {
            setTdAutoStatus(null);
            setTdAutoStatusErr(err?.response?.data?.message || err.message || 'Failed to load Trader Desk automation status');
        } finally {
            setTdAutoStatusLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'market-decoder-feeds') {
            fetchTraderDeskAutomationStatus();
        }
    }, [activeTab, fetchTraderDeskAutomationStatus]);

    const handleReverseReferralEvent = async () => {
        if (!reverseSourceTable || !reverseSourceId.trim()) {
            setError('Source table and source id are required to reverse an event.');
            return;
        }
        try {
            setReversingEvent(true);
            await AdminApi.reverseReferralEventBySource({
                sourceTable: reverseSourceTable,
                sourceId: reverseSourceId.trim(),
                reason: reverseReason || 'admin_reversal',
            });
            setReverseSourceId('');
            setError(null);
            await fetchReferralPayouts();
            alert('✅ Referral event reversed (if matching source event was found).');
        } catch (err) {
            console.error('Reverse referral event failed:', err);
            setError(err?.response?.data?.message || 'Failed to reverse referral event.');
        } finally {
            setReversingEvent(false);
        }
    };

    const handleUpdateChannelAccess = async (channelId, newAccessLevel) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/community/channels`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: channelId,
                    accessLevel: newAccessLevel
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to update channel');
            }

            const result = await response.json();
            if (result.success) {
                fetchChannels();
                setError(null);
            } else {
                throw new Error(result.message || 'Failed to update channel');
            }
        } catch (err) {
            console.error('Error updating channel access:', err);
            setError(err.message || 'Failed to update channel access. Please try again.');
        }
    };

    const handleUpdateChannel = async (channelId, field, value) => {
        try {
            const token = localStorage.getItem('token');
            const updateData = { id: channelId };
            
            if (field === 'name') {
                updateData.name = value;
            } else if (field === 'description') {
                updateData.description = value;
            } else if (field === 'category') {
                updateData.category = value;
            }
            
            const response = await fetch(`/api/community/channels`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to update channel');
            }

            const result = await response.json();
            if (result.success) {
                fetchChannels();
                setError(null);
            } else {
                throw new Error(result.message || 'Failed to update channel');
            }
        } catch (err) {
            console.error('Error updating channel:', err);
            setError(err.message || 'Failed to update channel. Please try again.');
        }
    };


    const handleDeleteUser = (userId, userEmail) => {
        setDeleteModal({ isOpen: true, userId, userEmail });
    };

    const openGrantAccessModal = (userItem) => {
        setAccessModal({
            open: true,
            userId: userItem.id,
            userEmail: userItem.email,
            initialPlan: initialAccessPlanSelect(userItem),
            title: 'Grant access',
        });
    };

    const openChangePlanModal = (userItem) => {
        setAccessModal({
            open: true,
            userId: userItem.id,
            userEmail: userItem.email,
            initialPlan: initialAccessPlanSelect(userItem),
            title: 'Change plan',
        });
    };

    const closeAccessModal = () => {
        if (accessSubmitting) return;
        setAccessModal((m) => ({ ...m, open: false }));
    };

    const submitAccessModal = useCallback(
        async (plan, durationDays) => {
            const { userId, userEmail } = accessModal;
            if (!userId) return;
            setAccessSubmitting(true);
            setError(null);
            try {
                const token = localStorage.getItem('token');
                const headers = {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                };

                if (plan === 'admin' || plan === 'super_admin') {
                    const res = await fetch(`${Api.getBaseUrl() || ''}/api/admin/users/${userId}/role`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ role: plan, capabilities: [] }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || !data.success) {
                        throw new Error(data.message || 'Failed to update role (Super Admin required for staff roles).');
                    }
                    const label = plan === 'super_admin' ? 'Super Admin' : 'Admin';
                    alert(`✅ Set ${userEmail} to ${label}.`);
                    setAccessModal((m) => ({ ...m, open: false }));
                    fetchUsers();
                    return;
                }

                const needsPaidWindow = plan === 'pro' || plan === 'elite';
                const body = {
                    userId,
                    plan,
                    ...(needsPaidWindow ? { durationDays: durationDays ?? 90 } : {}),
                };
                const res = await fetch(`${Api.getBaseUrl() || ''}/api/admin/change-subscription`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.success) {
                    throw new Error(data.message || 'Failed to update subscription');
                }
                const exp = data.user?.subscription_expiry
                    ? new Date(data.user.subscription_expiry).toLocaleString()
                    : null;
                const tierLabel = plan === 'access' ? 'Access' : plan === 'pro' ? 'Pro' : plan === 'elite' ? 'Elite' : plan;
                const msg =
                    plan === 'access'
                        ? `Set ${userEmail} to Access.`
                        : `Set ${userEmail} to ${tierLabel} for ${data.user?.durationDays ?? durationDays} days.${exp ? `\nExpires: ${exp}` : ''}`;
                alert(`✅ ${msg}`);
                setAccessModal((m) => ({ ...m, open: false }));
                fetchUsers();
            } catch (err) {
                console.error('Subscription update:', err);
                setError(err.message || 'Failed to update subscription.');
            } finally {
                setAccessSubmitting(false);
            }
        },
        [accessModal.userId, accessModal.userEmail]
    );

    const handleRevokeCommunityAccess = async (userId, userEmail) => {
        if (!window.confirm(`Revoke community access from ${userEmail}? This will deactivate their subscription and remove their premium access.`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/revoke-access`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    userId: userId
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to revoke access');
            }

            const result = await response.json();
            
            if (result.success) {
                fetchUsers();
                setError(null);
                alert(`✅ Community access revoked from ${userEmail}!\n\nTheir subscription has been deactivated.`);
            } else {
                throw new Error(result.message || 'Failed to revoke access');
            }
        } catch (err) {
            console.error('Error revoking community access:', err);
            setError(err.message || 'Failed to revoke community access. Please try again.');
        }
    };

    const handleGrantAdminAccess = async (userId, userEmail) => {
        if (!window.confirm(`Grant admin access to ${userEmail}? They will get admin privileges, including Surveillance (staff-only tool; Elite subscribers get it via active Elite/A7FX billing).`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${userId}/role`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    role: 'admin',
                    capabilities: [] // Default admin capabilities
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to grant admin access');
            }

            const result = await response.json();
            
            if (result.success) {
                fetchUsers();
                setError(null);
                alert(`✅ Admin access granted to ${userEmail}!\n\nThey now have admin privileges, including Surveillance for support.`);
            } else {
                throw new Error(result.message || 'Failed to grant admin access');
            }
        } catch (err) {
            console.error('Error granting admin access:', err);
            setError(err.message || 'Failed to grant admin access. Please try again.');
        }
    };

    // Filter users based on search term
    const filteredUsers = useMemo(() => {
        if (!searchTerm.trim()) {
            return users;
        }
        
        const searchLower = searchTerm.toLowerCase();
        return users.filter(u => 
            u.email?.toLowerCase().includes(searchLower) ||
            u.username?.toLowerCase().includes(searchLower) ||
            u.name?.toLowerCase().includes(searchLower) ||
            u.id?.toString().includes(searchLower)
        );
    }, [users, searchTerm]);

    // Navigate to user profile
    const handleUserClick = (userId) => {
        navigate(`/profile/${userId}`);
    };

    const handleGiveXP = async (userId, userEmail, currentXP = 0, currentLevel = 1) => {
        const xpAmount = window.prompt(`Give XP points to ${userEmail}\n\nCurrent Level: ${currentLevel}\nCurrent XP: ${currentXP}\n\nEnter amount of XP to give (negative to remove):`, '100');
        
        if (xpAmount === null || xpAmount === '') {
            return; // User cancelled
        }

        const xp = parseFloat(xpAmount);
        if (isNaN(xp) || xp === 0) {
            alert('Please enter a valid number for XP amount (non-zero).');
            return;
        }

        try {
            const response = await Api.giveXp(userId, xp);

            const result = response.data || response;
            
            if (result.success) {
                fetchUsers();
                setError(null);
                const action = xp > 0 ? 'awarded' : 'removed';
                alert(`✅ Successfully ${action} ${Math.abs(xp)} XP to ${userEmail}!\n\nNew XP: ${result.newXP}\nNew Level: ${result.newLevel}`);
            } else {
                throw new Error(result.message || 'Failed to give XP');
            }
        } catch (err) {
            console.error('Error giving XP:', err);
            setError(err.message || 'Failed to give XP points. Please try again.');
        }
    };

    const handleResetXP = async (userId, userEmail) => {
        if (!window.confirm(`⚠️ WARNING: This will reset ALL XP and level for ${userEmail} to 0/1.\n\nThis action cannot be undone. Are you sure?`)) {
            return;
        }

        try {
            const response = await Api.giveXp(userId, -999999); // Large negative to reset

            const result = response.data || response;
            
            if (result.success) {
                fetchUsers();
                setError(null);
                alert(`✅ Successfully reset XP for ${userEmail}!\n\nNew XP: ${result.newXP}\nNew Level: ${result.newLevel}`);
            } else {
                throw new Error(result.message || 'Failed to reset XP');
            }
        } catch (err) {
            console.error('Error resetting XP:', err);
            setError(err.message || 'Failed to reset XP. Please try again.');
        }
    };

    const confirmDeleteUser = async () => {
        const { userId } = deleteModal;
        if (!userId) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to delete user');
            }

            // Refresh the user list
            fetchUsers();
            setDeleteModal({ isOpen: false, userId: null, userEmail: null });
        } catch (err) {
            setError(err.message || 'Failed to delete user. Please try again.');
            setDeleteModal({ isOpen: false, userId: null, userEmail: null });
        }
    };

    // Check admin status more flexibly
    const userRole = user?.role?.toLowerCase() || '';
    const isAdmin = userRole === 'admin' || hasSuperAdminRole(user);
    const isSuperAdminUser =
        userRole === 'super_admin' || hasSuperAdminRole(user);

    useEffect(() => {
        if (!isSuperAdminUser) return;
        try {
            const params = new URLSearchParams(window.location.search || '');
            const unlockFromQuery = params.get('briefTools') === '1';
            const unlockFromStorage = localStorage.getItem('adminBriefToolsUnlocked') === '1';
            const unlocked = unlockFromQuery || unlockFromStorage;
            setBriefToolsUnlocked(unlocked);
            if (unlockFromQuery) localStorage.setItem('adminBriefToolsUnlocked', '1');
        } catch (_) {
            setBriefToolsUnlocked(false);
        }
    }, [isSuperAdminUser]);

    useEffect(() => {
        if (activeTab === 'brief-templates' && (!isSuperAdminUser || !briefToolsUnlocked)) {
            setActiveTab('users');
        }
    }, [activeTab, isSuperAdminUser, briefToolsUnlocked]);

    const loadTemplate = useCallback(async (period) => {
        try {
            setTemplateLoading(true);
            setTemplateStatus('');
            const res = await Api.getTraderDeckBriefTemplate(period);
            const data = res?.data || {};
            const schema = data.template || {};
            const lines = [];
            lines.push(`# ${period === 'weekly' ? 'Weekly' : 'Daily'} Brief Template`);
            lines.push('');
            if (Array.isArray(schema.sections) && schema.sections.length) {
                lines.push('Sections:');
                schema.sections.forEach((s) => lines.push(`- ${s.heading || ''}`));
                lines.push('');
            }
            if (Array.isArray(schema.instruments) && schema.instruments.length) {
                lines.push(`Instruments: ${schema.instruments.join(', ')}`);
                lines.push('');
            }
            lines.push('Style: Institutional concise, no sources shown.');
            const nextDraft = lines.join('\n');
            setTemplateDraft(nextDraft);
            setTemplatePreview(analyzeTemplateDraft(nextDraft, period));
        } catch (err) {
            setTemplateStatus(err?.response?.status === 404 ? 'Template manager is hidden for your account.' : 'Failed to load template.');
        } finally {
            setTemplateLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isSuperAdminUser || !briefToolsUnlocked || activeTab !== 'brief-templates') return;
        loadTemplate(templatePeriod);
    }, [activeTab, templatePeriod, isSuperAdminUser, briefToolsUnlocked, loadTemplate]);

    const handleSaveTemplate = async () => {
        try {
            if (!templateDraft.trim()) {
                setTemplateStatus('Template text cannot be empty.');
                return;
            }
            setTemplateSaving(true);
            setTemplateStatus('');
            await Api.putTraderDeckBriefTemplate(templatePeriod, templateDraft.trim());
            setTemplateStatus('Template saved. New auto-briefs will follow this structure.');
            setTemplatePreview(analyzeTemplateDraft(templateDraft.trim(), templatePeriod));
        } catch (err) {
            setTemplateStatus(err?.response?.status === 404 ? 'Template manager is hidden for your account.' : (err?.response?.data?.message || 'Failed to save template.'));
        } finally {
            setTemplateSaving(false);
        }
    };

    const handleImproveTemplate = () => {
        const next = analyzeTemplateDraft(templateDraft, templatePeriod);
        setTemplatePreview(next);
        setTemplateDraft(next.suggested || templateDraft);
        if (next.issues.length > 0) {
            setTemplateStatus('Template improved with fixes for detected issues. Review and save.');
        } else {
            setTemplateStatus('Template already looks good. No critical issues found.');
        }
    };

    if (!isAuthenticated || !isAdmin) {
        return null; // Don't render anything while redirecting
    }

    const onlineUsersCount = onlineUsers.size;
    const offlineUsersCount = users.length - onlineUsersCount;

    return (
  <AuraTerminalThemeShell>
  <div className="admin-panel-container">
    <div className="admin-panel journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
      <div className="admin-header">
        <h1 className="admin-title">ADMIN PANEL</h1>
        <div className="admin-tabs">
          <button
            className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
            data-count={users.length}
          >
            Users
          </button>
          <button
            className={`admin-tab-btn ${activeTab === 'channels' ? 'active' : ''}`}
            onClick={() => setActiveTab('channels')}
            data-count={channels.length}
          >
            Channels
          </button>
          <button
            className={`admin-tab-btn ${activeTab === 'referral-payouts' ? 'active' : ''}`}
            onClick={() => setActiveTab('referral-payouts')}
            data-count={referralPayouts.length}
          >
            Referral payouts
          </button>
          <button
            className={`admin-tab-btn ${activeTab === 'market-decoder-feeds' ? 'active' : ''}`}
            onClick={() => setActiveTab('market-decoder-feeds')}
          >
            Market Decoder feeds
          </button>
          {isSuperAdminUser && briefToolsUnlocked && (
            <button
              className={`admin-tab-btn ${activeTab === 'brief-templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('brief-templates')}
            >
              Brief Templates
            </button>
          )}
        </div>
        {activeTab === 'users' && (
          <div className="user-summary">
            <span>Total: {users.length} | Showing: {filteredUsers.length}</span>
            <span className={`connection-status ${isConnected ? 'online' : 'offline'}`}>
              {isConnected ? '● Live' : '○ Offline'}
            </span>
          </div>
        )}
        {activeTab === 'channels' && (
          <div className="user-summary">
            <span>Total Channels: {channels.length}</span>
            <button onClick={fetchChannels} className="refresh-btn" disabled={channelsRefreshing}>
              {channelsRefreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        )}
        {activeTab === 'referral-payouts' && (
          <div className="user-summary">
            <span>Manual payout processing queue</span>
            <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <select
                className="access-level-select"
                style={{ minWidth: 160 }}
                value={referralPayoutsStatusFilter}
                onChange={(e) => setReferralPayoutsStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="requested">Requested</option>
                <option value="processing">Processing</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={fetchReferralPayouts} className="refresh-btn">
                ↻ Refresh
              </button>
            </div>
          </div>
        )}
        {activeTab === 'brief-templates' && isSuperAdminUser && briefToolsUnlocked && (
          <div className="user-summary">
            <span>Manage daily/weekly AI brief structure</span>
          </div>
        )}
        {activeTab === 'market-decoder-feeds' && (
          <div className="user-summary">
            <span>Internal feed diagnostics (admin only — not shown to traders)</span>
          </div>
        )}
      </div>

      <div className="admin-ops-shortcuts" role="navigation" aria-label="Admin operations">
        <Link to="/admin/integration-health" className="admin-integration-health-banner__link admin-ops-shortcuts__card">
          <FaHeartbeat aria-hidden />
          <span>
            <strong>Integration health</strong>
            {' — '}Third-party APIs (Stripe, Twilio, market data, AI, DB).
          </span>
        </Link>
        {isSuperAdminUser && (
          <Link to="/admin/pipeline-health" className="admin-integration-health-banner__link admin-ops-shortcuts__card">
            <FaProjectDiagram aria-hidden />
            <span>
              <strong>Pipeline monitor</strong>
              {' — '}Market data ingest queue and freshness (super admin).
            </span>
          </Link>
        )}
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {activeTab === 'users' && (
        <>
          <div className="search-container">
            <FaSearch className="search-icon" aria-hidden />
            <input
              type="text"
              placeholder="Search by email, username, name, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search-btn">
                ✕
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div className="loading-text">Loading users...</div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="no-users-message">
              <p>{searchTerm ? 'No users found matching your search.' : 'No users found.'}</p>
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="retry-btn">
                  Clear Search
                </button>
              )}
              {!searchTerm && (
                <button onClick={fetchUsers} className="retry-btn" disabled={loading}>
                  {loading ? 'Loading…' : 'Retry'}
                </button>
              )}
            </div>
          ) : (
            <div className="users-grid">
              {filteredUsers.map(userItem => (
                <div key={userItem.id || userItem.email} className="user-card">
                  <div className="user-info">
                    <div 
                      className="user-email"
                      onClick={() => handleUserClick(userItem.id)}
                    >
                      {userItem.email || 'No email'}
                    </div>
                    <div 
                      className="user-name"
                      onClick={() => handleUserClick(userItem.id)}
                    >
                      {userItem.name || userItem.username || 'N/A'}
                    </div>
                    <div
                      className={`user-role${adminPanelRoleLabel(userItem) === 'SUPER ADMIN' ? ' user-role--super' : ''}`}
                    >
                      {adminPanelRoleLabel(userItem)}
                    </div>
                    <div className="user-xp">
                      <span>⭐ Level {userItem.level || 1}</span>
                      <span>•</span>
                      <span>{Math.floor(userItem.xp || 0).toLocaleString()} XP</span>
                    </div>
                    <div className="user-plan">
                      <span className="user-plan__label">Plan</span>
                      <span
                        className={`user-plan__value user-plan__value--${(userItem.subscription_plan || 'access').toLowerCase()}`}
                      >
                        {userItem.subscription_plan || 'access'}
                      </span>
                      {userItem.subscription_expiry && userItem.subscription_plan !== 'access' && (
                        <span className="user-plan__expiry">
                          Expires {new Date(userItem.subscription_expiry).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="user-joined">
                      Joined: {userItem.createdAt ? new Date(userItem.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                    <div className={`user-status ${onlineUsers.has(userItem.id) ? 'online' : 'offline'}`}>
                      {onlineUsers.has(userItem.id) ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  <div className="user-actions">
                    <button 
                      className="action-btn xp-btn"
                      onClick={() => withBusyAction(`xp-${userItem.id}`, () => handleGiveXP(userItem.id, userItem.email, userItem.xp || 0, userItem.level || 1))}
                      disabled={!!busyActionKey}
                    >
                      {busyActionKey === `xp-${userItem.id}` ? 'Working…' : '⭐ Give XP'}
                    </button>
                    <button 
                      className="action-btn reset-xp-btn"
                      onClick={() => withBusyAction(`resetxp-${userItem.id}`, () => handleResetXP(userItem.id, userItem.email))}
                      disabled={!!busyActionKey}
                    >
                      {busyActionKey === `resetxp-${userItem.id}` ? 'Working…' : '🔄 Reset XP'}
                    </button>
                    <button 
                      className="action-btn grant-access-btn"
                      onClick={() => openGrantAccessModal(userItem)}
                    >
                      Grant Access
                    </button>
                    {isSuperAdminUser && !isRowSuperAdminOrAdmin(userItem) && (
                      <button 
                        className="action-btn grant-admin-btn"
                        onClick={() => withBusyAction(`grantadmin-${userItem.id}`, () => handleGrantAdminAccess(userItem.id, userItem.email))}
                        disabled={!!busyActionKey}
                      >
                        {busyActionKey === `grantadmin-${userItem.id}` ? 'Working…' : <><FaUserShield /> Grant Admin</>}
                      </button>
                    )}
                    <button 
                      className="action-btn revoke-access-btn"
                      onClick={() => withBusyAction(`revoke-${userItem.id}`, () => handleRevokeCommunityAccess(userItem.id, userItem.email))}
                      disabled={!!busyActionKey}
                    >
                      {busyActionKey === `revoke-${userItem.id}` ? 'Working…' : 'Revoke'}
                    </button>
                    <button 
                      className="action-btn delete-btn"
                      onClick={() => handleDeleteUser(userItem.id, userItem.email)}
                      disabled={!!busyActionKey}
                    >
                      Delete
                    </button>
                    <button
                      className="action-btn plan-btn"
                      type="button"
                      onClick={() => openChangePlanModal(userItem)}
                      disabled={!!busyActionKey}
                    >
                      Change plan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'channels' && (
        <>
          {channelsLoading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div className="loading-text">Loading channels...</div>
            </div>
          ) : channels.length === 0 ? (
            <div className="no-channels-message">
              <p>No channels found.</p>
              <button onClick={fetchChannels} className="retry-btn" disabled={channelsRefreshing}>
                {channelsRefreshing ? 'Refreshing…' : 'Retry'}
              </button>
            </div>
          ) : (
            <div className="users-grid">
              {channels.map(channel => (
                <div key={channel.id} className="channel-card">
                  <div className="channel-info">
                    <div className="channel-name">
                      {channel.displayName || channel.name}
                    </div>
                    <div className="channel-category">
                      {channel.category || 'general'}
                    </div>
                    <div className="channel-description">
                      {channel.description || 'No description'}
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '10px', color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Access Level:
                      </label>
                      <select
                        id={`access-${channel.id}`}
                        value={channel.accessLevel || 'open'}
                        onChange={(e) => withBusyAction(`channel-access-${channel.id}`, () => handleUpdateChannelAccess(channel.id, e.target.value))}
                        className="access-level-select"
                        disabled={!!busyActionKey}
                      >
                        <option value="open">Open/Free - Everyone can view and post</option>
                        <option value="free">Free - Everyone can view and post</option>
                        <option value="read-only">Read-Only - Everyone can view, only admins can post</option>
                        <option value="admin-only">Admin-Only - Only admins can view and post</option>
                        <option value="premium">Premium - Premium and A7FX subscribers</option>
                        <option value="a7fx">A7FX Elite - Only A7FX Elite subscribers</option>
                        <option value="elite">Elite - Only A7FX Elite subscribers</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'referral-payouts' && (
        <>
          <div className="search-container payout-reverse-box">
            <div className="payout-reverse-title">Manual referral reversal</div>
            <div className="payout-reverse-grid">
              <select
                className="access-level-select"
                value={reverseSourceTable}
                onChange={(e) => setReverseSourceTable(e.target.value)}
              >
                <option value="stripe_checkout_session">stripe_checkout_session</option>
                <option value="stripe_invoice">stripe_invoice</option>
                <option value="stripe_charge">stripe_charge</option>
                <option value="stripe_payment_intent">stripe_payment_intent</option>
                <option value="stripe_subscription">stripe_subscription</option>
                <option value="payments_complete">payments_complete</option>
              </select>
              <input
                className="search-input"
                placeholder="Source id (session/invoice/charge/payment intent id)"
                value={reverseSourceId}
                onChange={(e) => setReverseSourceId(e.target.value)}
              />
              <input
                className="search-input"
                placeholder="Reason (optional)"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
              />
              <button
                className="action-btn revoke-access-btn"
                type="button"
                onClick={handleReverseReferralEvent}
                disabled={reversingEvent}
              >
                {reversingEvent ? 'Reversing…' : 'Reverse event'}
              </button>
            </div>
            <div className="payout-reverse-history">
              <div className="payout-reverse-history__head">
                <div className="payout-reverse-history__title">Recent reversals</div>
                <select
                  className="access-level-select payout-reverse-history__filter"
                  value={reversalSourceFilter}
                  onChange={(e) => setReversalSourceFilter(e.target.value)}
                >
                  <option value="">All sources</option>
                  <option value="stripe_checkout_session">stripe_checkout_session</option>
                  <option value="stripe_invoice">stripe_invoice</option>
                  <option value="stripe_charge">stripe_charge</option>
                  <option value="stripe_payment_intent">stripe_payment_intent</option>
                  <option value="stripe_subscription">stripe_subscription</option>
                  <option value="payments_complete">payments_complete</option>
                </select>
                <select
                  className="access-level-select payout-reverse-history__filter payout-reverse-history__window"
                  value={reversalWindowDays}
                  onChange={(e) => setReversalWindowDays(e.target.value)}
                >
                  <option value="1">Last 24h</option>
                  <option value="7">Last 7d</option>
                  <option value="30">Last 30d</option>
                  <option value="0">All time</option>
                </select>
              </div>
              {recentReversals.length === 0 ? (
                <div className="payout-reverse-history__empty">No reversals logged yet.</div>
              ) : (
                <div className="payout-reverse-history__list">
                  {recentReversals.map((r) => (
                    <div key={r.id} className="payout-reverse-history__item">
                      <span>#{r.id} · {r.referee} {r.sourceTable ? `(${r.sourceTable})` : ''}</span>
                      <span>{new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' }).format((Number(r.amountPence) || 0) / 100)}</span>
                      <span>{r.occurredAt ? new Date(r.occurredAt).toLocaleString() : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {referralPayoutsLoading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div className="loading-text">Loading payouts...</div>
            </div>
          ) : referralPayouts.length === 0 ? (
            <div className="no-channels-message">
              <p>No payout requests found for this filter.</p>
              <button onClick={fetchReferralPayouts} className="retry-btn">Refresh</button>
            </div>
          ) : (
            <div className="users-grid">
              {referralPayouts.map((p) => (
                <div key={p.id} className="channel-card payout-card">
                  <div className="channel-info">
                    <div className="channel-name">Payout #{p.id}</div>
                    <div className="channel-category">{p.user}</div>
                    <div className="payout-row">
                      <span className="payout-label">Amount</span>
                      <strong>{new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' }).format((Number(p.amountPence) || 0) / 100)}</strong>
                    </div>
                    <div className="payout-row">
                      <span className="payout-label">Method</span>
                      <span>{p.payoutMethod || 'manual'}</span>
                    </div>
                    <div className="payout-row">
                      <span className="payout-label">Destination</span>
                      <span>{p.destinationMasked || 'masked'}</span>
                    </div>
                    <div className="payout-row">
                      <span className="payout-label">Status</span>
                      <span className={`payout-status payout-status--${String(p.status || '').toLowerCase()}`}>{p.status}</span>
                    </div>
                    <div className="payout-row">
                      <span className="payout-label">Requested</span>
                      <span>{p.requestedAt ? new Date(p.requestedAt).toLocaleString() : '—'}</span>
                    </div>
                  </div>
                  <div className="user-actions">
                    <button
                      className="action-btn grant-access-btn"
                      disabled={payoutActionBusyId === p.id || p.status !== 'requested'}
                      onClick={() => handlePayoutAction(p.id, 'process')}
                    >
                      {payoutActionBusyId === p.id ? 'Working…' : 'Mark processing'}
                    </button>
                    <button
                      className="action-btn plan-btn"
                      disabled={payoutActionBusyId === p.id || (p.status !== 'requested' && p.status !== 'processing')}
                      onClick={() => handlePayoutAction(p.id, 'paid')}
                    >
                      Mark paid
                    </button>
                    <button
                      className="action-btn revoke-access-btn"
                      disabled={payoutActionBusyId === p.id || (p.status !== 'requested' && p.status !== 'processing')}
                      onClick={() => handlePayoutAction(p.id, 'fail')}
                    >
                      Mark failed
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'market-decoder-feeds' && (
        <section className="admin-feed-diagnostics" style={{ padding: '0 1rem 2rem' }}>
          <div
            className="journal-glass-panel journal-glass-panel--pad"
            style={{ marginBottom: 24, padding: '14px 16px', borderRadius: 12 }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontSize: '0.95rem' }}>Trader Desk automation</strong>
              <button type="button" className="refresh-btn" onClick={fetchTraderDeskAutomationStatus} disabled={tdAutoStatusLoading}>
                {tdAutoStatusLoading ? 'Loading…' : '↻ Refresh'}
              </button>
            </div>
            <p className="brief-template-help" style={{ margin: '0 0 10px' }}>
              Brief / outlook cron ledger: last successful daily outlook, recent run rows, and stored brief kind counts by date (last 14 days).
            </p>
            {tdAutoStatusErr ? (
              <div className="tdna-warn-banner tdna-warn-banner--strong" role="alert">
                {tdAutoStatusErr}
              </div>
            ) : null}
            {tdAutoStatus?.success && (
              <div className="md-decoder-small" style={{ opacity: 0.95 }}>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>Last daily outlook (success):</strong>{' '}
                  {tdAutoStatus.lastDailyOutlookSuccess?.run_key || '—'}
                  {tdAutoStatus.lastDailyOutlookSuccess?.updated_at
                    ? ` · ${new Date(tdAutoStatus.lastDailyOutlookSuccess.updated_at).toLocaleString()}`
                    : ''}
                </p>
                {Array.isArray(tdAutoStatus.briefKindCoverageByDate) && tdAutoStatus.briefKindCoverageByDate.length > 0 ? (
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Brief kinds stored (by date):</strong>{' '}
                    {tdAutoStatus.briefKindCoverageByDate
                      .slice(0, 10)
                      .map((r) => `${r.date} ${r.period} (${r.kinds})`)
                      .join(' · ')}
                  </p>
                ) : (
                  <p style={{ margin: '0 0 6px' }}>No brief kind coverage rows in the last window (empty table or DB).</p>
                )}
                {Array.isArray(tdAutoStatus.recentRuns) && tdAutoStatus.recentRuns.length > 0 ? (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer' }}>Recent run rows ({tdAutoStatus.recentRuns.length})</summary>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, maxHeight: 200, overflow: 'auto' }}>
                      {tdAutoStatus.recentRuns.map((r) => (
                        <li key={`${r.run_key}-${r.updated_at}`} style={{ marginBottom: 4 }}>
                          {r.run_key} · {r.status}
                          {r.brief_date ? ` · ${r.brief_date}` : ''}
                          {r.updated_at ? ` · ${new Date(r.updated_at).toLocaleString()}` : ''}
                          {r.error_message ? ` — ${r.error_message}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            )}
          </div>
          <p className="brief-template-help" style={{ marginBottom: 16 }}>
            Runs a live Market Decoder pass for the symbol below and returns provider-level status, rules-engine scores, and
            mapping keys. Traders no longer see this on the public Market Decoder page.
          </p>
          <div className="search-container" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <label htmlFor="feed-diag-symbol" className="ap-modal__label" style={{ margin: 0 }}>
              Symbol
            </label>
            <input
              id="feed-diag-symbol"
              className="search-input"
              style={{ maxWidth: 140 }}
              value={feedDiagSymbol}
              onChange={(e) => setFeedDiagSymbol(e.target.value.toUpperCase())}
              placeholder="EURUSD"
              autoComplete="off"
            />
            <button type="button" className="refresh-btn" onClick={runFeedDiagnostics} disabled={feedDiagLoading}>
              {feedDiagLoading ? 'Running…' : 'Run diagnostics'}
            </button>
          </div>
          {feedDiagErr && (
            <div className="tdna-warn-banner tdna-warn-banner--strong" role="alert">
              {feedDiagErr}
            </div>
          )}
          {feedDiagResult?.success && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                {feedDiagResult.symbol}
                {feedDiagResult.generatedAt ? (
                  <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 8 }}>
                    · {new Date(feedDiagResult.generatedAt).toLocaleString()}
                  </span>
                ) : null}
              </p>
              {feedDiagResult.rulesEngine && (
                <p className="md-decoder-small" style={{ margin: '0 0 12px' }}>
                  Rules engine: bull {feedDiagResult.rulesEngine.bullScore ?? '—'} · bear{' '}
                  {feedDiagResult.rulesEngine.bearScore ?? '—'} · net {feedDiagResult.rulesEngine.netScore ?? '—'}
                </p>
              )}
              {(feedDiagResult.internalSymbolKey || feedDiagResult.canonicalSymbol) && (
                <p className="md-decoder-small" style={{ margin: '0 0 12px', opacity: 0.9 }}>
                  {feedDiagResult.canonicalSymbol ? <>Canonical: {feedDiagResult.canonicalSymbol}</> : null}
                  {feedDiagResult.internalSymbolKey ? (
                    <>
                      {feedDiagResult.canonicalSymbol ? ' · ' : null}
                      Internal quote key: {feedDiagResult.internalSymbolKey}
                    </>
                  ) : null}
                </p>
              )}
              {feedDiagResult.dataHealth?.summary && (
                <p style={{ margin: '0 0 8px' }}>
                  <strong>Summary:</strong> {feedDiagResult.dataHealth.summary}
                  {feedDiagResult.dataHealth.sparseSeries ? ' · Sparse series mode' : ''}
                </p>
              )}
              {Array.isArray(feedDiagResult.dataHealth?.providerLog) && feedDiagResult.dataHealth.providerLog.length > 0 ? (
                <table className="admin-feed-diagnostics__table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                      <th style={{ padding: '8px 6px' }}>Feed step</th>
                      <th style={{ padding: '8px 6px' }}>Status</th>
                      <th style={{ padding: '8px 6px' }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedDiagResult.dataHealth.providerLog.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>{p.name || '—'}</td>
                        <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>{p.status || '—'}</td>
                        <td style={{ padding: '8px 6px', verticalAlign: 'top', wordBreak: 'break-word' }}>{p.detail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                !feedDiagErr && <p className="md-decoder-small">No provider log entries returned.</p>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'brief-templates' && isSuperAdminUser && briefToolsUnlocked && (
        <section className="brief-template-panel">
          <div className="brief-template-row">
            <label htmlFor="brief-template-period">Period</label>
            <select
              id="brief-template-period"
              className="access-level-select"
              value={templatePeriod}
              onChange={(e) => setTemplatePeriod(e.target.value)}
              disabled={templateLoading || templateSaving}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button
              type="button"
              className="refresh-btn"
              onClick={() => loadTemplate(templatePeriod)}
              disabled={templateLoading || templateSaving}
            >
              {templateLoading ? 'Loading…' : 'Reload'}
            </button>
          </div>
          <p className="brief-template-help">
            Super-admin only. This controls section order, headings, and instrument flow used by automated briefs. Sources are never shown in generated briefs.
          </p>
          <textarea
            className="brief-template-textarea"
            value={templateDraft}
            onChange={(e) => {
              const next = e.target.value;
              setTemplateDraft(next);
              setTemplatePreview(analyzeTemplateDraft(next, templatePeriod));
            }}
            placeholder="Paste your template structure here..."
            disabled={templateLoading || templateSaving}
          />
          <div className="brief-template-actions">
            <button
              type="button"
              className="action-btn reset-xp-btn"
              onClick={handleImproveTemplate}
              disabled={templateSaving || templateLoading}
            >
              Improve template
            </button>
            <button
              type="button"
              className="action-btn grant-access-btn"
              onClick={handleSaveTemplate}
              disabled={templateSaving || templateLoading}
            >
              {templateSaving ? 'Saving…' : `Save ${templatePeriod} template`}
            </button>
          </div>
          {templatePreview.issues.length > 0 && (
            <div className="brief-template-error-box" role="alert">
              <strong>What went wrong</strong>
              <ul>
                {templatePreview.issues.map((issue, idx) => (
                  <li key={`${issue}-${idx}`}>{issue}</li>
                ))}
              </ul>
              <p>Use "Improve template" to auto-fix structure, then save again.</p>
            </div>
          )}
          <div className="brief-template-preview">
            <h3>Preview check</h3>
            <p>Sections ({templatePreview.sections.length || 0}): {templatePreview.sections.join(' | ') || 'None yet'}</p>
            <p>Instruments ({templatePreview.instruments.length || 0}): {templatePreview.instruments.join(', ') || 'None yet'}</p>
            {templatePreview.issues.length === 0 && templatePreview.sections.length > 0 && templatePreview.instruments.length > 0 && (
              <p className="brief-template-preview-ok">Template structure passes validation and is ready for generation.</p>
            )}
          </div>
          {templateStatus && <p className="brief-template-status">{templateStatus}</p>}
        </section>
      )}
    </div>

    <SubscriptionAccessModal
      open={accessModal.open}
      title={accessModal.title}
      userEmail={accessModal.userEmail}
      initialPlan={accessModal.initialPlan}
      includeStaffRoles={isSuperAdminUser}
      onClose={closeAccessModal}
      onConfirm={submitAccessModal}
      submitting={accessSubmitting}
    />

    <ConfirmationModal
      isOpen={deleteModal.isOpen}
      onClose={() => setDeleteModal({ isOpen: false, userId: null, userEmail: null })}
      onConfirm={confirmDeleteUser}
      title="Delete User"
      message={`Are you sure you want to delete ${deleteModal.userEmail || 'this user'}? This action cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      type="danger"
    />
  </div>
  </AuraTerminalThemeShell>
);
};

export default AdminPanel;
