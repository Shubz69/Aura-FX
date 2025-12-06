import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, TextField, Button, Paper, Divider, IconButton } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SendIcon from '@mui/icons-material/Send';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import WebSocketService from '../services/WebSocketService';
import BinaryBackground from '../components/BinaryBackground';

const SupportInbox = () => {
  const { user } = useAuth();
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const endRef = useRef(null);

  const threadId = useMemo(() => thread?.id, [thread]);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      try {
        const ensured = await Api.ensureAdminThread();
        if (!mounted) return;
        setThread(ensured.data.thread);
      } catch (e) {
        console.error('Failed to ensure thread', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!threadId || !user) return;
    let mounted = true;
    WebSocketService.connect({ userId: user.id, role: user.role }, async () => {
      WebSocketService.offThreadEvents();
      WebSocketService.joinThread(threadId);
      WebSocketService.onThreadMessage(({ threadId: incomingThreadId, message, thread }) => {
        if (!mounted || incomingThreadId !== threadId) return;
        setMessages(prev => {
          const exists = prev.some(m => m.id === message.id);
          return exists ? prev : [...prev, message];
        });
        if (thread) setThread(thread);
        scrollToBottom();
      });
      WebSocketService.onThreadRead(({ thread }) => { if (thread) setThread(thread); });

      try {
        const resp = await Api.getThreadMessages(threadId, { limit: 50 });
        if (!mounted) return;
        setMessages(resp.data.messages || []);
        await Api.markThreadRead(threadId);
      } catch (e) {
        console.error('Load thread messages failed', e);
      }
    });

    return () => {
      WebSocketService.offThreadEvents();
      mounted = false;
    };
  }, [threadId, user]);

  const handleSend = async (e) => {
    e.preventDefault();
    const body = input.trim();
    if ((!body && !file) || !threadId) return;
    const optimistic = {
      id: `tmp_${Date.now()}`,
      threadId,
      senderId: String(user.id),
      recipientId: 'ADMIN',
      body: body || (file ? `[file] ${file.name}` : ''),
      createdAt: Date.now(),
      status: 'sending'
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setFile(null);
    try {
      // For now, only text is persisted; file upload can be added later via multipart endpoint
      if (body) await Api.sendThreadMessage(threadId, body);
    } catch (e) {
      console.error('Send thread message failed', e);
    }
  };

  const isOwn = (m) => String(m.senderId) === String(user?.id);
  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <BinaryBackground />
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Support</Typography>
      <Paper sx={{ p: 2, minHeight: 360, maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <Typography>Loading…</Typography>
        ) : messages.length === 0 ? (
          <Typography color="text.secondary">Say hello to Admin to start the conversation.</Typography>
        ) : (
          messages.map(m => (
            <Box key={m.id} sx={{ display: 'flex', justifyContent: isOwn(m) ? 'flex-end' : 'flex-start', mb: 1 }}>
              <Paper sx={{ p: 1.25, bgcolor: isOwn(m) ? '#fff' : 'rgba(255,255,255,0.08)', color: isOwn(m) ? '#000' : '#fff' }}>
                <Typography variant="body1">{m.body}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', textAlign: 'right' }}>{formatTime(m.createdAt)}</Typography>
              </Paper>
            </Box>
          ))
        )}
        <div ref={endRef} />
      </Paper>
      <Divider sx={{ my: 2 }} />
      <form onSubmit={handleSend}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton component="label" sx={{ mr: 1 }}>
            <AttachFileIcon />
            <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </IconButton>
          <TextField fullWidth value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" />
          <Button type="submit" disabled={!input.trim() && !file} sx={{ ml: 1 }} variant="contained"><SendIcon /></Button>
        </Box>
      </form>
      </Box>
    </>
  );
};

export default SupportInbox;


