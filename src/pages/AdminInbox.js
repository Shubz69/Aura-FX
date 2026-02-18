import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, List, ListItemButton, ListItemText, Paper, Divider, TextField, Button, IconButton, InputAdornment } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import WebSocketService from '../services/WebSocketService';
import CosmicBackground from '../components/CosmicBackground';

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

  // Fetch all users and existing threads
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
    return () => { mounted = false; };
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

  // Load messages when active thread changes
  useEffect(() => {
    const role = (user?.role || '').toUpperCase();
    if ((role !== 'ADMIN' && role !== 'SUPER_ADMIN') || !activeThreadId) return;
    let mounted = true;
    WebSocketService.connect({ userId: user.id, role: user.role }, async () => {
      WebSocketService.offThreadEvents();
      WebSocketService.joinThread(activeThreadId);
      WebSocketService.onThreadMessage(({ threadId, message, thread }) => {
        if (!mounted || threadId !== activeThreadId) return;
        setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? thread : t));
        scrollToBottom();
      });
      WebSocketService.onThreadRead(({ thread }) => {
        if (!mounted) return;
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? thread : t));
      });
      try {
        const resp = await Api.getThreadMessages(activeThreadId, { limit: 50 });
        if (!mounted) return;
        setMessages(resp.data.messages || []);
        await Api.markThreadRead(activeThreadId);
      } catch (e) {
        console.error('Load messages failed', e);
      }
    });
    return () => { WebSocketService.offThreadEvents(); mounted = false; };
  }, [user, activeThreadId]);

  const handleSend = async (e) => {
    e.preventDefault();
    const hasText = input.trim().length > 0;
    if (!hasText && !file) return;
    const body = hasText ? input.trim() : `[file] ${file?.name || ''}`;
    const optimistic = { id: `tmp_${Date.now()}`, threadId: activeThreadId, senderId: String(user.id), recipientId: String(activeThread?.userId), body, createdAt: Date.now(), status: 'sending' };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setFile(null);
    try { if (hasText) await Api.sendThreadMessage(activeThreadId, body); } catch (e) { console.error('Send failed', e); }
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isOwn = (m) => String(m.senderId) === String(user?.id);

  // Build inbox list: users with threads first (by lastMessageAt), then users without
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
    }).map(u => ({
      ...u,
      thread: threads.find(t => t.userId === u.id),
      lastMessageAt: threads.find(t => t.userId === u.id)?.lastMessageAt || 0
    })).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

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
      <Box sx={{ display: 'flex', height: 'calc(100vh - 160px)', p: 2 }}>
        <Paper sx={{ width: 320, mr: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" sx={{ p: 2 }}>Inbox</Typography>
          <TextField
            size="small"
            placeholder="Search users…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ mx: 2, mb: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>
              )
            }}
          />
          <Divider />
          <List sx={{ flex: 1, overflowY: 'auto' }}>
            {loadingUsers ? (
              <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>Loading users…</Typography>
            ) : inboxList.length === 0 ? (
              <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
                {searchTerm ? 'No users match your search.' : 'No users found.'}
              </Typography>
            ) : (
              inboxList.map((u) => {
                const thread = u.thread || threads.find(t => t.userId === u.id);
                const isSelected = activeThreadId && thread?.id === activeThreadId || selectedUserId === u.id;
                return (
                  <ListItemButton
                    key={u.id}
                    selected={isSelected}
                    onClick={() => handleSelectUser(u)}
                    disabled={ensuringThread}
                  >
                    <ListItemText
                      primary={displayName(u)}
                      secondary={thread?.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : 'No messages yet'}
                    />
                  </ListItemButton>
                );
              })
            )}
          </List>
        </Paper>

        <Paper sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {activeUser ? `Conversation with ${displayName(activeUser)}` : 'Select a user to message'}
          </Typography>
          <Paper sx={{ p: 2, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 200 }}>
            {ensuringThread && selectedUserId && !activeThreadId ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Starting conversation…</Typography>
            ) : (
              <>
                {messages.map(m => (
                  <Box key={m.id} sx={{ display: 'flex', justifyContent: isOwn(m) ? 'flex-end' : 'flex-start', mb: 1 }}>
                    <Paper sx={{ p: 1.25, bgcolor: isOwn(m) ? '#fff' : 'rgba(255,255,255,0.08)', color: isOwn(m) ? '#000' : '#fff', maxWidth: '80%' }}>
                      <Typography variant="body1">{m.body}</Typography>
                      <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', textAlign: 'right' }}>{formatTime(m.createdAt)}</Typography>
                    </Paper>
                  </Box>
                ))}
                <div ref={endRef} />
              </>
            )}
          </Paper>
          <Divider sx={{ my: 2 }} />
          <form onSubmit={handleSend}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <IconButton component="label" sx={{ mr: 1 }} disabled={!activeThreadId}>
                <AttachFileIcon />
                <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </IconButton>
              <TextField
                fullWidth
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={activeThreadId ? 'Type a message…' : 'Select a user first'}
                disabled={!activeThreadId}
              />
              <Button type="submit" disabled={(!input.trim() && !file) || !activeThreadId} sx={{ ml: 1 }} variant="contained"><SendIcon /></Button>
            </Box>
          </form>
        </Paper>
      </Box>
    </>
  );
};

export default AdminInbox;
