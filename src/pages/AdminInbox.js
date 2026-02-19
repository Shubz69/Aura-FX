import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaPaperclip, FaPaperPlane, FaSearch } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import WebSocketService from '../services/WebSocketService';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/AdminInbox.css';

const API_BASE = () => (typeof window !== 'undefined' ? window.location.origin : '');

const AdminInbox = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadFromUrl = searchParams.get('thread');
  const [users, setUsers] = useState([]);
  const [threads, setThreads] = useState([]);
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
    if (activeThread) return { id: activeThread.userId, username: activeThread.username, name: activeThread.name, email: activeThread.email };
    return users.find(u => u.id === selectedUserId) || null;
  }, [activeThread, selectedUserId, users]);

  // Fetch all users and existing threads (with unread counts); refresh list periodically so new messages show
  useEffect(() => {
    const role = (user?.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return;
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
      Api.listThreads().then((threadsRes) => {
        if (!mounted) return;
        const threadsList = (threadsRes.data?.threads || []).filter(t => t.userId !== user?.id);
        setThreads(threadsList);
      }).catch(() => {});
    }, 15000);
    return () => { clearInterval(refreshList); mounted = false; };
  }, [user]);

  // When user selects someone from the list: ensure thread, then set active
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

  // Load messages when active thread changes + poll so new user messages show up in time
  useEffect(() => {
    const role = (user?.role || '').toUpperCase();
    if ((role !== 'ADMIN' && role !== 'SUPER_ADMIN') || !activeThreadId) return;
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
  }, [user, activeThreadId]);

  const handleSend = async (e) => {
    e.preventDefault();
    const hasText = input.trim().length > 0;
    if (!hasText && !file) return;
    const body = hasText ? input.trim() : `[file] ${file?.name || ''}`;
    const optimistic = { id: `tmp_${Date.now()}`, threadId: activeThreadId, senderId: String(user.id), recipientId: String(activeThread?.userId), body, createdAt: new Date().toISOString(), status: 'sending' };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setFile(null);
    try {
      if (hasText) {
        const resp = await Api.sendThreadMessage(activeThreadId, body);
        const created = resp.data?.created;
        if (created) {
          setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...created, senderId: String(created.senderId), createdAt: created.createdAt || created.created_at } : m));
        }
      }
    } catch (e) { console.error('Send failed', e); }
  };

  const formatTime = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const isOwn = (m) => String(m.senderId) === String(user?.id);

  // Build inbox list: users with threads first (by lastMessageAt), then users without; include unread count
  const inboxList = useMemo(() => {
    const q = (searchTerm || '').toLowerCase().trim();
    const match = (u) => {
      if (!q) return true;
      const name = (u.username || u.name || u.email || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    };
    const withThreads = users.filter(u => {
      if (!match(u)) return false;
      return threads.some(t => t.userId === u.id);
    }).map(u => {
      const thread = threads.find(t => t.userId === u.id);
      return {
        ...u,
        thread,
        lastMessageAt: thread?.lastMessageAt || 0,
        adminUnreadCount: thread?.adminUnreadCount ?? 0
      };
    }).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    const withoutThreads = users.filter(u => {
      if (!match(u)) return false;
      return !threads.some(t => t.userId === u.id);
    }).sort((a, b) => ((a.username || a.email || '').toLowerCase()).localeCompare((b.username || b.email || '').toLowerCase()));

    return [...withThreads, ...withoutThreads];
  }, [users, threads, searchTerm]);

  const displayName = (u) => u.username || u.name || u.email || `User ${u.id}`;

  return (
    <>
      <CosmicBackground />
      <div className="admin-inbox-page">
        <div className="admin-inbox-layout">
          {/* Left: user list with scroll on the right */}
          <aside className="admin-inbox-sidebar">
            <h2 className="admin-inbox-sidebar-title">Inbox</h2>
            <div className="admin-inbox-sidebar-search">
              <FaSearch className="search-icon" aria-hidden />
              <input
                type="text"
                placeholder="Search users…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search users"
              />
            </div>
            <div className="admin-inbox-user-list">
              {loadingUsers ? (
                <div className="admin-inbox-loading">Loading users…</div>
              ) : inboxList.length === 0 ? (
                <div className="admin-inbox-empty-list">
                  {searchTerm ? 'No users match your search.' : 'No users found. Users will appear here once they message support.'}
                </div>
              ) : (
                inboxList.map((u) => {
                  const thread = u.thread || threads.find(t => t.userId === u.id);
                  const isSelected = (activeThreadId && thread?.id === activeThreadId) || selectedUserId === u.id;
                  const unread = u.adminUnreadCount ?? thread?.adminUnreadCount ?? 0;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`admin-inbox-user-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectUser(u)}
                      disabled={ensuringThread}
                    >
                      <div className="admin-inbox-user-name">
                        {displayName(u)}
                        {unread > 0 && (
                          <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
                        )}
                      </div>
                      <div className="admin-inbox-user-meta">
                        {thread?.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : 'No messages yet'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right: conversation */}
          <main className="admin-inbox-main">
            <h2 className="admin-inbox-main-title">
              {activeUser ? `Conversation with ${displayName(activeUser)}` : 'Select a user to message'}
            </h2>
            <div className="admin-inbox-messages-wrap">
              {ensuringThread && selectedUserId && !activeThreadId ? (
                <div className="admin-inbox-empty-list">Starting conversation…</div>
              ) : (
                <>
                  {messages.map((m) => (
                    <div
                      key={m.id || `msg-${m.createdAt}-${(m.body || '').slice(0, 10)}`}
                      className={`admin-inbox-message-row ${isOwn(m) ? 'own' : 'other'}`}
                    >
                      <div className="admin-inbox-message-bubble">
                        <div>{m.body}</div>
                        <div className="admin-inbox-message-time">{formatTime(m.createdAt ?? m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </>
              )}
            </div>
            <div className="admin-inbox-form-wrap">
              <form onSubmit={handleSend} className="admin-inbox-form-row">
                <label className="admin-inbox-attach-btn" style={{ cursor: activeThreadId ? 'pointer' : 'not-allowed' }}>
                  <FaPaperclip size={18} />
                  <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={!activeThreadId} />
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={activeThreadId ? 'Type a message…' : 'Select a user first'}
                  disabled={!activeThreadId}
                  aria-label="Message input"
                />
                <button type="submit" disabled={(!input.trim() && !file) || !activeThreadId}>
                  <FaPaperPlane size={18} />
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
