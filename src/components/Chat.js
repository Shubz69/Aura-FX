import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, Button, Paper, Avatar, Divider, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import WebSocketService from '../services/WebSocketService';
import { useAuth } from '../context/AuthContext';

/**
 * Chat component for real-time messaging
 */
const Chat = ({ channelId, channelName }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const { user } = useAuth();
  
  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    // Connect to WebSocket
    WebSocketService.connect(undefined, () => {
      // Ensure we unsubscribe first to prevent duplicate subscriptions
      WebSocketService.unsubscribe(`/topic/chat/${channelId}`);
      
      // Subscribe to channel messages
      WebSocketService.subscribe(`/topic/chat/${channelId}`, (newMessage) => {
        console.log('Message received:', newMessage);
        setMessages(prevMessages => {
          // Check for duplicates by comparing content and timestamp
          const isDuplicate = prevMessages.some(
            msg => msg.content === newMessage.content && 
                  msg.sender === newMessage.sender &&
                  Math.abs(msg.timestamp - newMessage.timestamp) < 1000
          );
          if (isDuplicate) {
            return prevMessages;
          }
          return [...prevMessages, newMessage];
        });
        scrollToBottom();
      });
      
      // Join the channel
      WebSocketService.send('/app/chat/' + channelId, {
        sender: user.username,
        channelId: channelId,
        type: 'JOIN'
      });
      
      setLoading(false);
    });
    
    // Cleanup on unmount
    return () => {
      WebSocketService.unsubscribe(`/topic/chat/${channelId}`);
    };
  }, [channelId, user.username]);
  
  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (message.trim() !== '') {
      const chatMessage = {
        content: message,
        sender: user.username,
        channelId: channelId,
        timestamp: Date.now(),
        type: 'CHAT'
      };
      
      WebSocketService.send('/app/chat/' + channelId, chatMessage);
      setMessage('');
    }
  };
  
  // Format timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Get user initials for avatar
  const getUserInitials = (username) => {
    return username ? username.substring(0, 2).toUpperCase() : '?';
  };
  
  // Get message style based on sender
  const getMessageStyle = (sender) => {
    const isCurrentUser = sender === user.username;
    
    return {
      display: 'flex',
      justifyContent: isCurrentUser ? 'flex-end' : 'flex-start',
      mb: 2
    };
  };
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Channel Header */}
      <Paper elevation={2} sx={{ 
        p: 2, 
        mb: 2, 
        bgcolor: '#000',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <Typography variant="h6" fontWeight="bold">
          #{channelName}
        </Typography>
      </Paper>
      
      {/* Messages Area */}
      <Box sx={{ 
        flexGrow: 1, 
        overflowY: 'auto', 
        p: 2, 
        display: 'flex', 
        flexDirection: 'column',
        bgcolor: '#000',
        minHeight: '400px',
        maxHeight: '500px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 1
      }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress sx={{ color: '#fff' }} />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography color="#ccc">
              No messages yet. Be the first to send a message!
            </Typography>
          </Box>
        ) : (
          messages.map((msg, index) => {
            if (msg.type === 'JOIN' || msg.type === 'LEAVE') {
              return (
                <Box key={index} sx={{ textAlign: 'center', my: 1 }}>
                  <Typography variant="caption" color="#999">
                    {msg.sender} has {msg.type === 'JOIN' ? 'joined' : 'left'} the channel
                  </Typography>
                </Box>
              );
            }
            
            const isCurrentUser = msg.sender === user.username;
            
            return (
              <Box key={index} sx={getMessageStyle(msg.sender)}>
                {!isCurrentUser && (
                  <Avatar 
                    sx={{ 
                      bgcolor: '#fff', 
                      color: '#000',
                      width: 32, 
                      height: 32, 
                      mr: 1, 
                      fontSize: '0.875rem' 
                    }}
                  >
                    {getUserInitials(msg.sender)}
                  </Avatar>
                )}
                
                <Box sx={{ maxWidth: '70%' }}>
                  {!isCurrentUser && (
                    <Typography variant="caption" color="#ccc">
                      {msg.sender}
                    </Typography>
                  )}
                  
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 1.5, 
                      borderRadius: 2,
                      bgcolor: isCurrentUser ? '#fff' : 'rgba(255, 255, 255, 0.1)',
                      color: isCurrentUser ? '#000' : '#fff',
                      border: isCurrentUser ? 'none' : '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    <Typography variant="body1">{msg.content}</Typography>
                    <Typography variant="caption" color={isCurrentUser ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'} sx={{ display: 'block', textAlign: 'right', mt: 0.5 }}>
                      {formatTime(msg.timestamp)}
                    </Typography>
                  </Paper>
                </Box>
                
                {isCurrentUser && (
                  <Avatar 
                    sx={{ 
                      bgcolor: '#fff', 
                      color: '#000',
                      width: 32, 
                      height: 32, 
                      ml: 1, 
                      fontSize: '0.875rem' 
                    }}
                  >
                    {getUserInitials(msg.sender)}
                  </Avatar>
                )}
              </Box>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>
      
      <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)' }} />
      
      {/* Message Input */}
      <Box sx={{ p: 2, bgcolor: '#000' }}>
        <form onSubmit={handleSendMessage} style={{ display: 'flex' }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#fff',
                '& fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#fff',
                },
                '& input::placeholder': {
                  color: 'rgba(255, 255, 255, 0.7)',
                  opacity: 1,
                },
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
              },
            }}
          />
          <Button 
            type="submit" 
            variant="contained" 
            sx={{ 
              ml: 1,
              bgcolor: '#fff',
              color: '#000',
              '&:hover': {
                bgcolor: '#ccc',
              }
            }}
            disabled={message.trim() === ''}
          >
            <SendIcon />
          </Button>
        </form>
      </Box>
    </Box>
  );
};

export default Chat; 