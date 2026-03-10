import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaPaperclip, FaPaperPlane, FaSearch } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import WebSocketService from '../services/WebSocketService';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/AdminInbox.css';

const API_BASE = () => (typeof window !== 'undefined' ? window.location.origin : '');

/* ── Avatar initials helper ── */
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

const ALLOWED_FRIENDS_ROLES = ['premium', 'elite', 'a7fx', 'admin', 'super_admin'];
const isFriendsAllowed = (role) => ALLOWED_FRIENDS_ROLES.includes((role || '').toLowerCase());
const isAdminRole = (role) => ((role || '').toUpperCase() === 'ADMIN' || (role || '').toUpperCase() === 'SUPER_ADMIN');

const AdminInbox = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadFromUrl = searchParams.get('thread');
  const [activeTab, setActiveTab] = useState('admin'); // 'admin' | 'friends'
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
  const [ensuringThread, setEnsuringThread] = useState(false);
  const endRef = useRef(null);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  const activeThread = useMemo(() => threads.find(t => t.id === activeThreadId), [threads, activeThreadId]);
  const activeUser = useMemo(() => {
    if (activeTab === 'friends' && selectedUserId) {
      const f = friends.find(fr => fr.id === selectedUserId);
      return f ? { id: f.id, username: f.username, name: f.username, email: f.email } : null;
    }
    if (activeThread) return { id: activeThread.userId, username: activeThread.username, name: activeThread.name, email: activeThread.email };
    return users.find(u => u.id === selectedUserId) || null;
  }, [activeTab, activeThread, selectedUserId, users, friends]);

 /* ── Load users + threads (Admin tab only) ── */
useEffect(() => {
  if (!isAdminRole(user?.role)) return;
  let mounted = true;
  const load = async () => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('token');
      const [usersRes, threadsRes] = await Promise.all([
        fetch(`${API_BASE()}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        Api.listThreads()
      ]);
      if (!mounted) return;
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
      console.error('Load users/threads failed', e);
    } finally {
      if (mounted) setLoadingUsers(false);
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
  return () => { clearInterval(refreshList); mounted = false; };
}, [user, activeThreadId, threadFromUrl, setSearchParams]);

  /* ── Default to Friends tab when user is Premium but not Admin ── */
  useEffect(() => {
    if (!user?.role) return;
    if (isFriendsAllowed(user.role) && !isAdminRole(user.role)) setActiveTab('friends');
  }, [user?.role]);

  /* ── Load friends (Friends tab only) ── */
  useEffect(() => {
    if (activeTab !== 'friends' || !isFriendsAllowed(user?.role) || !user?.id) return;
    let mounted = true;
    const load = async () => {
      setLoadingFriends(true);
      try {
        const res = await fetch(`${API_BASE()}/api/friends/list`, {
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

  /* ── Select user (Admin tab) ── */
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
      console.error('Ensure thread failed', e);
    } finally {
      setEnsuringThread(false);
    }
  };

  /* ── Select friend (Friends tab) ── */
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
      console.error('Ensure friend thread failed', e);
    } finally {
      setEnsuringThread(false);
    }
  };

  /* ── Load messages + WS ── */
  useEffect(() => {
    const canLoad = (activeTab === 'admin' && isAdminRole(user?.role)) || (activeTab === 'friends' && isFriendsAllowed(user?.role));
    if (!canLoad || !activeThreadId) return;
    let mounted = true;
    const loadMessages = async () => {
      try {
        const resp = await Api.getThreadMessages(activeThreadId, { limit: 50 });
        if (!mounted) return;
        setMessages(resp.data.messages || []);
        await Api.markThreadRead(activeThreadId);
        setThreads(prev => prev.map(t => t.id === activeThreadId ? { ...t, adminUnreadCount: 0 } : t));
      } catch (e) {
        if (mounted) console.error('Load messages failed', e);
      }
    };
    WebSocketService.connect({ userId: user.id, role: user.role }, async () => {
      WebSocketService.offThreadEvents();
      WebSocketService.joinThread(activeThreadId);
      WebSocketService.onThreadMessage(({ threadId, message, thread }) => {
        if (!mounted || threadId !== activeThreadId) return;
        setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, ...thread, adminUnreadCount: 0 } : t));
        scrollToBottom();
      });
      WebSocketService.onThreadRead(({ thread }) => {
        if (!mounted) return;
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, ...thread } : t));
      });
      await loadMessages();
    });
    const pollInterval = setInterval(() => {
      if (!mounted || !activeThreadId) return;
      Api.getThreadMessages(activeThreadId, { limit: 50 }).then((resp) => {
        if (!mounted) return;
        setMessages(resp.data.messages || []);
      }).catch(() => {});
    }, 8000);
    return () => { clearInterval(pollInterval); WebSocketService.offThreadEvents(); mounted = false; };
  }, [user, activeThreadId, activeTab]);

  /* ── Send message ── */
  const handleSend = async (e) => {
    e.preventDefault();
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
    scrollToBottom();
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
      console.error('Send failed', e);
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

  /* ── Build inbox list ── */
  const inboxList = useMemo(() => {
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
  }, [users, threads, searchTerm]);

  /* ── Build friends list (filtered by search) ── */
  const friendsList = useMemo(() => {
    const q = (searchTerm || '').toLowerCase().trim();
    const list = friends.filter(f => !q || (f.username || '').toLowerCase().includes(q));
    return list.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  }, [friends, searchTerm]);

  const showAdminTab = isAdminRole(user?.role);
  const showFriendsTab = isFriendsAllowed(user?.role);
  const onTabChange = (tab) => {
    setActiveTab(tab);
    setActiveThreadId(null);
    setSelectedUserId(null);
    setMessages([]);
  };

  const displayName = (u) => u?.username || u?.name || u?.email || `User ${u?.id}`;

  /* ── Group messages by date ── */
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

  /* ── Scroll on new message ── */
  useEffect(() => { scrollToBottom(); }, [messages.length]);

  return (
    <>
      <CosmicBackground />
      <div className="admin-inbox-page">
        <div className="admin-inbox-layout">

          {/* ── Sidebar ── */}
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
                {activeTab === 'friends' ? 'Friends' : 'Inbox'}
              </span>
              <span className="admin-inbox-sidebar-count">
                {activeTab === 'friends'
                  ? (loadingFriends ? '—' : friendsList.length)
                  : (loadingUsers ? '—' : inboxList.length)}
                {activeTab === 'admin' && totalUnread > 0 && (
                  <span className="unread-badge" style={{ marginLeft: 10, fontSize: '0.7rem', verticalAlign: 'middle' }}>
                    {totalUnread > 99 ? '99+' : totalUnread} new
                  </span>
                )}
              </span>
            </div>

            <div className="admin-inbox-sidebar-search">
              <FaSearch className="admin-inbox-search-icon" aria-hidden />
              <input
                type="text"
                placeholder={activeTab === 'friends' ? 'Search friends…' : 'Search users…'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label={activeTab === 'friends' ? 'Search friends' : 'Search users'}
              />
            </div>

            <div className="admin-inbox-sidebar-divider" />

            <div className="admin-inbox-user-list">
              {activeTab === 'admin' && (
                <>
                  {loadingUsers ? (
                    <div className="admin-inbox-loading">Loading users…</div>
                  ) : inboxList.length === 0 ? (
                    <div className="admin-inbox-empty-list">
                      {searchTerm
                        ? 'No users match your search.'
                        : 'Users will appear here once they message support.'}
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
                          onClick={() => handleSelectUser(u)}
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
                  {loadingFriends ? (
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

          {/* ── Main conversation panel ── */}
          <main className="admin-inbox-main">
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
                    Select a user to open conversation
                  </span>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="admin-inbox-messages-wrap">
              {ensuringThread && selectedUserId && !activeThreadId ? (
                <div className="admin-inbox-conversation-empty">
                  <div className="admin-inbox-conversation-empty-icon">✦</div>
                  <p>Starting conversation…</p>
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
                    📎 {file.name}
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
                  disabled={(!input.trim() && !file) || !activeThreadId}
                >
                  <FaPaperPlane size={14} />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </main>

        </div>
      </div>
    </>
  );
};

export default AdminInbox;