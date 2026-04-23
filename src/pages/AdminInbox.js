import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaPaperclip, FaPaperPlane, FaSearch } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import WebSocketService from '../services/WebSocketService';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import { FriendsUpgradeRequired } from '../components/RouteGuards';
import { isAdmin, isSuperAdmin, isPremium } from '../utils/roles';
import '../styles/AdminInbox.css';
import { logClassifiedError } from '../utils/apiObservability';

const API_BASE = () => (Api.getBaseUrl() || '');

/* â”€â”€ Avatar initials helper â”€â”€ */
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

/** Friends DMs: legacy DB roles or USER + paid plan from /api/me sync (subscription_plan on user). */
const isFriendsAllowed = (u) =>
  isAdmin(u) || isSuperAdmin(u) || isPremium(u);
const isAdminRole = (role) => ((role || '').toUpperCase() === 'ADMIN' || (role || '').toUpperCase() === 'SUPER_ADMIN');

const AdminInbox = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadFromUrl = searchParams.get('thread');
  const userIdFromUrl = searchParams.get('user');
  const [activeTab, setActiveTab] = useState('admin');
  const [users, setUsers] = useState([]);
  const [threads, setThreads] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState(threadFromUrl ? parseInt(threadFromUrl, 10) : null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [ensuringThread, setEnsuringThread] = useState(false);
  const [userSupportThreadId, setUserSupportThreadId] = useState(null);
  
  const endRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isFirstLoad = useRef(true);
  const isThreadChanging = useRef(false);
  const shouldScrollToBottom = useRef(false);
  const prevMessagesLength = useRef(0);
  const loadMessagesInFlightRef = useRef(false);
  const usersLoadSeqRef = useRef(0);
  const supportLoadSeqRef = useRef(0);
  const messagesLoadSeqRef = useRef(0);
  const threadsRef = useRef(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  // Scroll to bottom function - only called when explicitly needed
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    if (messages.length > 0 && shouldScrollToBottom.current) {
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior });
      }, 100);
    }
  }, [messages.length]);

  // Reset scroll flags when thread changes
  useEffect(() => {
    if (activeThreadId) {
      isThreadChanging.current = true;
      shouldScrollToBottom.current = false;
      
      // Reset scroll position to top when switching threads
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = 0;
      }
    }
  }, [activeThreadId]);

  // Handle message updates - ONLY auto-scroll for new messages from user or when user is at bottom
  useEffect(() => {
    // Skip on first load
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }

    // Skip if thread is changing
    if (isThreadChanging.current) {
      isThreadChanging.current = false;
      return;
    }

    // Check if we have new messages
    const hasNewMessages = messages.length > prevMessagesLength.current;
    
    if (hasNewMessages && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
      
      // Get the last message
      const lastMessage = messages[messages.length - 1];
      const isOwnMessage = lastMessage && String(lastMessage.senderId) === String(user?.id);
      
      // Only auto-scroll if:
      // 1. The new message is from the current user (optimistic update), OR
      // 2. User was already at the bottom when message arrived
      if (isOwnMessage || isAtBottom) {
        shouldScrollToBottom.current = true;
        scrollToBottom('smooth');
      }
    }
    
    prevMessagesLength.current = messages.length;
  }, [messages, user?.id, scrollToBottom]);

  const activeThread = useMemo(() => threads.find(t => t.id === activeThreadId), [threads, activeThreadId]);
  const activeUser = useMemo(() => {
    if (activeTab === 'friends' && selectedUserId) {
      const f = friends.find(fr => fr.id === selectedUserId);
      return f ? { id: f.id, username: f.username, name: f.username, email: f.email } : null;
    }
    if (activeThread) return { id: activeThread.userId, username: activeThread.username, name: activeThread.name, email: activeThread.email };
    return users.find(u => u.id === selectedUserId) || null;
  }, [activeTab, activeThread, selectedUserId, users, friends]);

 /* â”€â”€ Load users + threads (Admin tab, admins only) â”€â”€ */
useEffect(() => {
  if (!isAdminRole(user?.role)) return;
  let mounted = true;
  const loadSeq = ++usersLoadSeqRef.current;
  const usersAbort = new AbortController();
  const load = async () => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('token');
      const [usersRes, threadsRes] = await Promise.all([
        fetch(`${API_BASE()}/api/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: usersAbort.signal,
        }),
        Api.listThreads()
      ]);
      if (!mounted || loadSeq !== usersLoadSeqRef.current) return;
      const usersData = usersRes.ok ? await usersRes.json() : [];
      const usersList = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
      const filteredUsers = usersList.filter(u => u.id !== user?.id);
      setUsers(filteredUsers);
      const threadsList = (threadsRes.data?.threads || []).filter(t => t.userId !== user?.id);
      setThreads(threadsList);
      const targetId = threadFromUrl ? parseInt(threadFromUrl, 10) : null;
      if (targetId && threadsList.some(t => t.id === targetId)) {
        setActiveThreadId(targetId);
        setSelectedUserId(threadsList.find(t => t.id === targetId)?.userId ?? null);
        setSearchParams({}, { replace: true });
      } else if (threadsList.length && !activeThreadId) {
        setActiveThreadId(threadsList[0].id);
        setSelectedUserId(threadsList[0].userId);
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      logClassifiedError('admin_inbox.load_users_threads', e, { userId: user?.id || null });
    } finally {
      if (mounted && loadSeq === usersLoadSeqRef.current) setLoadingUsers(false);
    }
  };
  load();
  const refreshList = setInterval(() => {
    if (!mounted) return;
    Api.listThreads().then((res) => {
      if (!mounted) return;
      setThreads((res.data?.threads || []).filter(t => t.userId !== user?.id));
    }).catch(() => {});
  }, 15000);
  return () => {
    clearInterval(refreshList);
    usersAbort.abort();
    mounted = false;
  };
}, [user, activeThreadId, threadFromUrl, setSearchParams]);

  /* â”€â”€ Load current user's support thread (Admin tab, non-admin only) â”€â”€ */
  useEffect(() => {
    if (isAdminRole(user?.role) || !user?.id) return;
    let mounted = true;
    const loadSeq = ++supportLoadSeqRef.current;
    const load = async () => {
      setLoadingUsers(true);
      try {
        const resp = await Api.ensureAdminThread();
        if (!mounted || loadSeq !== supportLoadSeqRef.current) return;
        const thread = resp.data?.thread;
        if (thread) {
          const supportThread = {
            ...thread,
            username: 'Support',
            name: 'AURA TERMINAL™ Support',
            email: ''
          };
          setThreads([supportThread]);
          setActiveThreadId(thread.id);
          setUserSupportThreadId(thread.id);
        }
      } catch (e) {
        if (mounted) logClassifiedError('admin_inbox.load_support_thread', e, { userId: user?.id || null });
      } finally {
        if (mounted && loadSeq === supportLoadSeqRef.current) setLoadingUsers(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!activeThreadId) return;
    const active = threads.find((t) => t.id === activeThreadId);
    if (active?.userId && active.userId !== selectedUserId) {
      setSelectedUserId(active.userId);
    }
  }, [threads, activeThreadId, selectedUserId]);

  /* â”€â”€ Default to Friends tab when user is Premium but not Admin â”€â”€ */
  useEffect(() => {
    if (!user?.role) return;
    if (isFriendsAllowed(user) && !isAdminRole(user.role)) setActiveTab('friends');
  }, [user?.role]);

  /* â”€â”€ Load friends (Friends tab only) â”€â”€ */
  useEffect(() => {
    if (activeTab !== 'friends' || !isFriendsAllowed(user) || !user?.id) return;
    let mounted = true;
    const load = async () => {
      setLoadingFriends(true);
      try {
        const res = await fetch(`${API_BASE()}/api/friends/list?refresh=1`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (!mounted) return;
        const data = res.ok ? await res.json() : {};
        setFriends(data.friends || []);
      } catch (e) {
        if (mounted) console.error('Load friends failed', e);
      } finally {
        if (mounted) setLoadingFriends(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [activeTab, user?.id, user?.role]);

  /* â”€â”€ Select user (Admin tab) â”€â”€ */
  const handleSelectUser = async (u) => {
    const existing = threads.find(t => t.userId === u.id);
    if (existing) {
      setSelectedUserId(u.id);
      setActiveThreadId(existing.id);
      return;
    }
    setSelectedUserId(u.id);
    setEnsuringThread(true);
    try {
      const resp = await Api.ensureAdminThreadForUser(u.id);
      const thread = resp.data?.thread;
      if (thread) {
        setThreads(prev => {
          const merged = { ...thread, username: u.username, name: u.name, email: u.email };
          if (prev.some(t => t.id === thread.id)) return prev.map(t => t.id === thread.id ? merged : t);
          return [merged, ...prev];
        });
        setActiveThreadId(thread.id);
      }
    } catch (e) {
      logClassifiedError('admin_inbox.ensure_thread', e, { targetUserId: u?.id || null });
    } finally {
      setEnsuringThread(false);
    }
  };

  /* â”€â”€ Deep-link from contact submissions: ?user=<id> â”€â”€ */
  useEffect(() => {
    if (!isAdminRole(user?.role) || !userIdFromUrl || loadingUsers) return;
    const targetId = parseInt(userIdFromUrl, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev);
        n.delete('user');
        return n;
      }, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      setActiveTab('admin');
      const match = users.find((u) => Number(u.id) === targetId);
      const stub = {
        id: targetId,
        username: match?.username || '',
        name: match?.name || match?.username || 'User',
        email: match?.email || '',
      };
      const existing = threadsRef.current.find((t) => Number(t.userId) === targetId);
      try {
        if (existing) {
          if (!cancelled) {
            setSelectedUserId(targetId);
            setActiveThreadId(existing.id);
          }
        } else {
          setSelectedUserId(targetId);
          setEnsuringThread(true);
          const resp = await Api.ensureAdminThreadForUser(targetId);
          const thread = resp.data?.thread;
          if (!cancelled && thread) {
            setThreads((prev) => {
              const merged = {
                ...thread,
                username: stub.username || stub.name || `User ${targetId}`,
                name: stub.name || stub.username || `User ${targetId}`,
                email: stub.email || '',
              };
              if (prev.some((t) => t.id === thread.id)) {
                return prev.map((t) => (t.id === thread.id ? merged : t));
              }
              return [merged, ...prev];
            });
            setActiveThreadId(thread.id);
          }
        }
      } catch (e) {
        logClassifiedError('admin_inbox.open_linked_user', e, { targetId });
      } finally {
        if (!cancelled) setEnsuringThread(false);
        setSearchParams((prev) => {
          const n = new URLSearchParams(prev);
          n.delete('user');
          return n;
        }, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role, userIdFromUrl, loadingUsers, users, setSearchParams]);

  /* â”€â”€ Select friend (Friends tab) â”€â”€ */
  const handleSelectFriend = async (friend) => {
    setSelectedUserId(friend.id);
    setEnsuringThread(true);
    try {
      const resp = await Api.ensureUserThread(friend.id);
      const thread = resp.data?.thread;
      if (thread) {
        setActiveThreadId(thread.id);
      }
    } catch (e) {
      logClassifiedError('admin_inbox.ensure_friend_thread', e, { friendUserId: friend?.id || null });
    } finally {
      setEnsuringThread(false);
    }
  };

  /* â”€â”€ Load messages + WS â”€â”€ */
  useEffect(() => {
    const adminCanLoad = activeTab === 'admin' && (isAdminRole(user?.role) || userSupportThreadId);
    const friendsCanLoad = activeTab === 'friends' && isFriendsAllowed(user);
    const canLoad = adminCanLoad || friendsCanLoad;
    if (!canLoad || !activeThreadId) return;
    let mounted = true;
    
    // Mark that thread is changing
    isThreadChanging.current = true;
    shouldScrollToBottom.current = false;
    
    const loadMessages = async () => {
      if (loadMessagesInFlightRef.current) return;
      const loadSeq = ++messagesLoadSeqRef.current;
      setLoadingMessages(true);
      loadMessagesInFlightRef.current = true;
      try {
        const resp = await Api.getThreadMessages(activeThreadId, { limit: 50, _sync: Date.now() });
        if (!mounted || loadSeq !== messagesLoadSeqRef.current) return;
        setMessages(resp.data.messages || []);
        await Api.markThreadRead(activeThreadId);
        setThreads(prev => prev.map(t => t.id === activeThreadId ? { ...t, adminUnreadCount: 0 } : t));
      } catch (e) {
        if (mounted) logClassifiedError('admin_inbox.load_messages', e, { activeThreadId });
      } finally {
        if (mounted && loadSeq === messagesLoadSeqRef.current) setLoadingMessages(false);
        loadMessagesInFlightRef.current = false;
      }
    };
    
    WebSocketService.connect({ userId: user.id, role: user.role }, async () => {
      WebSocketService.offThreadEvents();
      WebSocketService.joinThread(activeThreadId);
      WebSocketService.onThreadMessage(({ threadId, message, thread }) => {
        if (!mounted || String(threadId) !== String(activeThreadId)) return;
        const mid = message?.id != null ? message.id : `rt_${Date.now()}`;
        setMessages((prev) =>
          prev.some((m) => String(m.id) === String(mid)) ? prev : [...prev, { ...message, id: mid }],
        );
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, ...thread, adminUnreadCount: 0 } : t));
      });
      WebSocketService.onThreadRead(({ thread }) => {
        if (!mounted) return;
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, ...thread } : t));
      });
      await loadMessages();
    });
    
    const pollInterval = setInterval(() => {
      if (!mounted || !activeThreadId) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (loadMessagesInFlightRef.current) return;
      Api.getThreadMessages(activeThreadId, { limit: 50, _sync: Date.now() })
        .then((resp) => {
          if (!mounted) return;
          setMessages(resp.data.messages || []);
        })
        .catch(() => {});
    }, 1500);
    
    return () => { 
      clearInterval(pollInterval); 
      WebSocketService.offThreadEvents(); 
      mounted = false; 
    };
  }, [user, activeThreadId, activeTab, userSupportThreadId]);

  /* â”€â”€ Send message â”€â”€ */
  const handleSend = async (e) => {
    e.preventDefault();
    if (ensuringThread || loadingMessages) return;
    const hasText = input.trim().length > 0;
    if (!hasText && !file) return;
    const body = hasText ? input.trim() : `[file] ${file?.name || ''}`;
    const optimistic = {
      id: `tmp_${Date.now()}`,
      threadId: activeThreadId,
      senderId: String(user.id),
      recipientId: String(activeThread?.userId),
      body,
      createdAt: new Date().toISOString(),
      status: 'sending'
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setFile(null);
    
    // Force scroll for own messages immediately
    shouldScrollToBottom.current = true;
    scrollToBottom('smooth');
    
    try {
      if (hasText) {
        const resp = await Api.sendThreadMessage(activeThreadId, body);
        const created = resp.data?.created;
        if (created) {
          setMessages(prev => prev.map(m =>
            m.id === optimistic.id
              ? { ...created, senderId: String(created.senderId), createdAt: created.createdAt || created.created_at }
              : m
          ));
        }
      }
    } catch (e) {
      logClassifiedError('admin_inbox.send_message', e, { activeThreadId });
    }
  };

  const formatTime = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  const isOwn = (m) => String(m.senderId) === String(user?.id);

  /* â”€â”€ Build inbox list (admins) or single support thread (non-admin) â”€â”€ */
  const inboxList = useMemo(() => {
    if (!isAdminRole(user?.role)) {
      return threads.length ? threads.map(t => ({ ...t, id: t.userId, thread: t })) : [];
    }
    const q = (searchTerm || '').toLowerCase().trim();
    const match = (u) => {
      if (!q) return true;
      return (u.username || u.name || u.email || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q);
    };
    const withThreads = users
      .filter(u => match(u) && threads.some(t => t.userId === u.id))
      .map(u => {
        const thread = threads.find(t => t.userId === u.id);
        return { ...u, thread, lastMessageAt: thread?.lastMessageAt || 0, adminUnreadCount: thread?.adminUnreadCount ?? 0 };
      })
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    const withoutThreads = users
      .filter(u => match(u) && !threads.some(t => t.userId === u.id))
      .sort((a, b) => ((a.username || a.email || '').toLowerCase()).localeCompare((b.username || b.email || '').toLowerCase()));
    return [...withThreads, ...withoutThreads];
  }, [user?.role, users, threads, searchTerm]);

  /* â”€â”€ Build friends list (filtered by search) â”€â”€ */
  const friendsList = useMemo(() => {
    const q = (searchTerm || '').toLowerCase().trim();
    const list = friends.filter(f => !q || (f.username || '').toLowerCase().includes(q));
    return list.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  }, [friends, searchTerm]);

  const showAdminTab = true;
  const showFriendsTab = true;
  const canUseFriendsTab = isFriendsAllowed(user);
  
  const onTabChange = (tab) => {
    setActiveTab(tab);
    setActiveThreadId(null);
    setSelectedUserId(null);
    setMessages([]);
    // Reset all scroll flags
    isFirstLoad.current = true;
    isThreadChanging.current = false;
    shouldScrollToBottom.current = false;
    prevMessagesLength.current = 0;
    
    // Scroll to top
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
    }
  };

  const displayName = (u) => u?.username || u?.name || u?.email || `User ${u?.id}`;

  /* â”€â”€ Group messages by date â”€â”€ */
  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = null;
    messages.forEach((m) => {
      const d = formatDate(m.createdAt ?? m.created_at);
      if (d !== lastDate) {
        groups.push({ type: 'date', label: d });
        lastDate = d;
      }
      groups.push({ type: 'message', data: m });
    });
    return groups;
  }, [messages]);

  const totalUnread = useMemo(() =>
    threads.reduce((sum, t) => sum + (t.adminUnreadCount || 0), 0),
    [threads]
  );

  return (
    <AuraTerminalThemeShell>
      <div className="admin-inbox-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
        <div className="admin-inbox-layout">

          {/* â”€â”€ Sidebar â”€â”€ */}
          <aside className="admin-inbox-sidebar">
            {/* Tabs: Admin | Friends */}
            <div className="admin-inbox-tabs">
              {showAdminTab && (
                <button
                  type="button"
                  className={`admin-inbox-tab${activeTab === 'admin' ? ' active' : ''}`}
                  onClick={() => onTabChange('admin')}
                >
                  Admin
                </button>
              )}
              {showFriendsTab && (
                <button
                  type="button"
                  className={`admin-inbox-tab${activeTab === 'friends' ? ' active' : ''}`}
                  onClick={() => onTabChange('friends')}
                >
                  Friends
                </button>
              )}
            </div>

            <div className="admin-inbox-sidebar-header">
              <span className="admin-inbox-sidebar-title">
                {activeTab === 'friends' ? 'Friends' : (isAdminRole(user?.role) ? 'Inbox' : 'Support')}
              </span>
              <span className="admin-inbox-sidebar-count">
                {activeTab === 'friends'
                  ? (loadingFriends ? '—' : canUseFriendsTab ? friendsList.length : '—')
                  : (loadingUsers ? '—' : inboxList.length)}
                {activeTab === 'admin' && isAdminRole(user?.role) && totalUnread > 0 && (
                  <span className="unread-badge" style={{ marginLeft: 10, fontSize: '0.7rem', verticalAlign: 'middle' }}>
                    {totalUnread > 99 ? '99+' : totalUnread} new
                  </span>
                )}
              </span>
            </div>

            {activeTab === 'friends' && canUseFriendsTab && (
              <div className="admin-inbox-sidebar-search">
                <FaSearch className="admin-inbox-search-icon" aria-hidden />
                <input
                  type="text"
                  placeholder="Search friends…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search friends"
                />
              </div>
            )}
            {activeTab === 'admin' && isAdminRole(user?.role) && (
              <div className="admin-inbox-sidebar-search">
                <FaSearch className="admin-inbox-search-icon" aria-hidden />
                <input
                  type="text"
                  placeholder="Search users…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search users"
                />
              </div>
            )}

            <div className="admin-inbox-sidebar-divider" />

            <div className="admin-inbox-user-list">
              {activeTab === 'admin' && (
                <>
                  {loadingUsers ? (
                    <div className="admin-inbox-loading">
                      {isAdminRole(user?.role) ? 'Loading users…' : 'Loading…'}
                    </div>
                  ) : inboxList.length === 0 ? (
                    <div className="admin-inbox-empty-list">
                      {searchTerm
                        ? 'No users match your search.'
                        : isAdminRole(user?.role)
                          ? 'Users will appear here once they message support.'
                          : 'Starting your support thread…'}
                    </div>
                  ) : (
                    inboxList.map((u) => {
                      const thread = u.thread || threads.find(t => t.userId === u.id);
                      const isSelected = (activeThreadId && thread?.id === activeThreadId) || selectedUserId === u.id;
                      const unread = u.adminUnreadCount ?? thread?.adminUnreadCount ?? 0;
                      const name = displayName(u);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className={`admin-inbox-user-item${isSelected ? ' selected' : ''}`}
                          onClick={() => isAdminRole(user?.role) && handleSelectUser(u)}
                          disabled={ensuringThread}
                        >
                          <div className="admin-inbox-user-row">
                            <div className="admin-inbox-avatar">{getInitials(name)}</div>
                            <div className="admin-inbox-user-info">
                              <div className="admin-inbox-user-name">
                                {name}
                                {unread > 0 && (
                                  <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
                                )}
                              </div>
                              <div className="admin-inbox-user-meta">
                                {thread?.lastMessageAt
                                  ? new Date(thread.lastMessageAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : 'No messages yet'}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </>
              )}
              {activeTab === 'friends' && (
                <>
                  {!canUseFriendsTab ? (
                    <div className="admin-inbox-empty-list">
                      Upgrade to Premium or Elite to message friends.
                    </div>
                  ) : loadingFriends ? (
                    <div className="admin-inbox-loading">Loading friends…</div>
                  ) : friendsList.length === 0 ? (
                    <div className="admin-inbox-empty-list">
                      {searchTerm
                        ? 'No friends match your search.'
                        : 'Add friends to message them here.'}
                    </div>
                  ) : (
                    friendsList.map((f) => {
                      const name = f.username || `User ${f.id}`;
                      const isSelected = selectedUserId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={`admin-inbox-user-item${isSelected ? ' selected' : ''}`}
                          onClick={() => handleSelectFriend(f)}
                          disabled={ensuringThread}
                        >
                          <div className="admin-inbox-user-row">
                            <div className="admin-inbox-avatar">{getInitials(name)}</div>
                            <div className="admin-inbox-user-info">
                              <div className="admin-inbox-user-name">{name}</div>
                              <div className="admin-inbox-user-meta">
                                {f.isOnline ? 'Online' : (f.lastSeen ? `Last seen ${f.lastSeen}` : 'Friend')}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </aside>

          {/* â”€â”€ Main conversation panel â”€â”€ */}
          <main className="admin-inbox-main">
            {activeTab === 'friends' && !canUseFriendsTab ? (
              <FriendsUpgradeRequired />
            ) : (
              <>
            {/* Header */}
            <div className="admin-inbox-main-header">
              {activeUser ? (
                <>
                  <div className="admin-inbox-main-avatar">{getInitials(displayName(activeUser))}</div>
                  <div className="admin-inbox-main-title-wrap">
                    <span className="admin-inbox-main-title">{displayName(activeUser)}</span>
                    <span className="admin-inbox-main-subtitle">{activeTab === 'friends' ? 'Friends' : 'Support Thread'}</span>
                  </div>
                  <div className="admin-inbox-status-dot" title="Active" />
                </>
              ) : (
                <div className="admin-inbox-main-title-wrap">
                  <span className="admin-inbox-main-title" style={{ color: 'rgba(255,255,255,0.4)', textTransform: 'none', letterSpacing: '0.06em', fontWeight: 300, fontSize: '0.9rem' }}>
                    {activeTab === 'admin' && !isAdminRole(user?.role) ? 'Your support conversation' : 'Select a user to open conversation'}
                  </span>
                </div>
              )}
            </div>

            {/* Messages */}
            <div 
              className="admin-inbox-messages-wrap" 
              ref={messagesContainerRef}
            >
              {ensuringThread && selectedUserId && !activeThreadId ? (
                <div className="admin-inbox-conversation-empty">
                  <div className="admin-inbox-conversation-empty-icon">âœ¦</div>
                  <p>Starting conversation…</p>
                </div>
              ) : loadingMessages && activeThreadId ? (
                <div className="admin-inbox-conversation-empty">
                  <div className="admin-inbox-conversation-empty-icon">âœ¦</div>
                  <p>Loading messages…</p>
                </div>
              ) : messages.length === 0 && activeThreadId ? (
                <div className="admin-inbox-conversation-empty">
                  <div className="admin-inbox-conversation-empty-icon">
                    <FaPaperPlane size={22} />
                  </div>
                  <p>No messages yet — say hello</p>
                </div>
              ) : !activeThreadId ? (
                <div className="admin-inbox-conversation-empty">
                  <div className="admin-inbox-conversation-empty-icon">
                    <FaSearch size={20} />
                  </div>
                  <p>Select a user from the sidebar</p>
                </div>
              ) : (
                groupedMessages.map((item, idx) => {
                  if (item.type === 'date') {
                    return (
                      <div key={`date-${idx}`} className="admin-inbox-date-divider">
                        <span>{item.label}</span>
                      </div>
                    );
                  }
                  const m = item.data;
                  return (
                    <div
                      key={m.id || `msg-${m.createdAt}-${(m.body || '').slice(0, 10)}`}
                      className={`admin-inbox-message-row ${isOwn(m) ? 'own' : 'other'}`}
                    >
                      <div
                        className="admin-inbox-message-bubble"
                        data-status={m.status || 'sent'}
                      >
                        <div className="admin-inbox-message-text">{m.body}</div>
                        <div className="admin-inbox-message-time">
                          {formatTime(m.createdAt ?? m.created_at)}
                          {m.status === 'sending' && ' · sending…'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Input form */}
            <div className="admin-inbox-form-wrap">
              <form onSubmit={handleSend} className="admin-inbox-form-row">
                <label
                  className="admin-inbox-attach-btn"
                  style={{ cursor: activeThreadId ? 'pointer' : 'not-allowed' }}
                  title="Attach file"
                >
                  <FaPaperclip size={16} />
                  <input
                    type="file"
                    hidden
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    disabled={!activeThreadId}
                  />
                </label>

                {file && (
                  <div className="admin-inbox-file-chip" title={file.name}>
                    ðŸ“Ž {file.name}
                  </div>
                )}

                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={activeThreadId ? 'Type a message…' : 'Select a user first'}
                  disabled={!activeThreadId}
                  aria-label="Message input"
                />

                <button
                  type="submit"
                  className="admin-inbox-send-btn"
                  disabled={(!input.trim() && !file) || !activeThreadId || ensuringThread || loadingMessages}
                >
                  <FaPaperPlane size={14} />
                  <span>Send</span>
                </button>
              </form>
            </div>
              </>
            )}
          </main>

        </div>
      </div>
    </AuraTerminalThemeShell>
  );
};

export default AdminInbox;