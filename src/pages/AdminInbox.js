import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, List, ListItemButton, ListItemText, Paper, Divider, TextField, Button, IconButton } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SendIcon from '@mui/icons-material/Send';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import WebSocketService from '../services/WebSocketService';
import CosmicBackground from '../components/CosmicBackground';

const AdminInbox = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadFromUrl = searchParams.get('thread');
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(threadFromUrl ? parseInt(threadFromUrl, 10) : null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const endRef = useRef(null);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });
  const activeThread = useMemo(() => threads.find(t => t.id === activeThreadId), [threads, activeThreadId]);

  useEffect(() => {
    const role = (user?.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return;
    let mounted = true;
    const load = async () => {
      try {
        const resp = await Api.listThreads();
        if (!mounted) return;
        const list = resp.data.threads || [];
        setThreads(list);
        const targetId = threadFromUrl ? parseInt(threadFromUrl, 10) : (activeThreadId || list[0]?.id);
        if (list.length) {
          const exists = list.some(t => t.id === targetId);
          setActiveThreadId(exists ? targetId : list[0].id);
          if (threadFromUrl && exists) setSearchParams({}, { replace: true });
        }
      } catch (e) {
        console.error('List threads failed', e);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user, threadFromUrl]);

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
      WebSocketService.onThreadRead(({ threadId: tId, thread }) => {
        if (!mounted) return;
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? thread : t));
        if (tId === activeThreadId) {
          // no-op; UI already shows messages
        }
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

  return (
    <>
      <CosmicBackground />
      <Box sx={{ display: 'flex', height: 'calc(100vh - 160px)', p: 2 }}>
        <Paper sx={{ width: 320, mr: 2, overflowY: 'auto' }}>
        <Typography variant="h6" sx={{ p: 2 }}>Inbox</Typography>
        <Divider />
        <List>
          {threads.length === 0 ? (
            <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
              No user messages yet. Users will appear here when they send a message.
            </Typography>
          ) : (
            threads.map(t => (
              <ListItemButton key={t.id} selected={t.id === activeThreadId} onClick={() => setActiveThreadId(t.id)}>
                <ListItemText 
                  primary={t.username || t.name || t.email || `User ${t.userId}`} 
                  secondary={t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString() : 'No messages'} 
                />
              </ListItemButton>
            ))
          )}
        </List>
      </Paper>

      <Paper sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {activeThread ? `Conversation with ${activeThread.username || activeThread.name || activeThread.email || `User ${activeThread.userId}`}` : 'Select a user to message'}
        </Typography>
        <Paper sx={{ p: 2, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {messages.map(m => (
            <Box key={m.id} sx={{ display: 'flex', justifyContent: isOwn(m) ? 'flex-end' : 'flex-start', mb: 1 }}>
              <Paper sx={{ p: 1.25, bgcolor: isOwn(m) ? '#fff' : 'rgba(255,255,255,0.08)', color: isOwn(m) ? '#000' : '#fff' }}>
                <Typography variant="body1">{m.body}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', textAlign: 'right' }}>{formatTime(m.createdAt)}</Typography>
              </Paper>
            </Box>
          ))}
          <div ref={endRef} />
        </Paper>
        <Divider sx={{ my: 2 }} />
        <form onSubmit={handleSend}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton component="label" sx={{ mr: 1 }} disabled={!activeThreadId}>
              <AttachFileIcon />
              <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </IconButton>
            <TextField fullWidth value={input} onChange={(e) => setInput(e.target.value)} placeholder={activeThreadId ? 'Type a message…' : 'Select a user first'} disabled={!activeThreadId} />
            <Button type="submit" disabled={(!input.trim() && !file) || !activeThreadId} sx={{ ml: 1 }} variant="contained"><SendIcon /></Button>
          </Box>
        </form>
      </Paper>
      </Box>
    </>
  );
};

export default AdminInbox;


