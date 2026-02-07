/**
 * WebSocketContext - Provider-level singleton STOMP connection
 *
 * - Connects ONLY when (isAuthenticated && token) changes; never on channel/route
 * - Channel switching: unsubscribe old topic, subscribe new topic (no client recreation)
 * - Guards: clientRef + connectingRef prevent duplicate connects
 * - Heartbeats enabled; exponential backoff 1s/2s/4s/8s/16s then stop + UI banner
 * - Production: wss:// via REACT_APP_WS_URL or NEXT_PUBLIC_WS_URL
 * - Backend is raw WebSocket (no SockJS) - client uses native WebSocket only
 */

import React, { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react';
import { Client } from '@stomp/stompjs';
import { useAuth } from './AuthContext';

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];
const MAX_ATTEMPTS = BACKOFF_MS.length;

function backoffWithJitter(baseMs) {
  const jitter = Math.random() * Math.min(500, baseMs * 0.25);
  return baseMs + jitter;
}

function resolveWsBaseUrl() {
  const configured =
    (typeof process !== 'undefined' && process.env?.REACT_APP_WS_URL) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WS_URL);
  if (configured === 'window-origin' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location ?? {};
    if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
    const wsHost = process.env.REACT_APP_WS_HOST || 'https://aura-fx-production.up.railway.app';
    if (hostname && (hostname.includes('vercel.app') || hostname.includes('aurafx.com'))) {
      return wsHost;
    }
    return wsHost;
  }
  return process.env.REACT_APP_WS_HOST || 'https://aura-fx-production.up.railway.app';
}

function getWsUrl() {
  const base = resolveWsBaseUrl();
  return base.replace(/^http/i, 'ws') + '/ws';
}

const WebSocketContext = createContext(null);

export const useWebSocketContext = () => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocketContext must be used within WebSocketProvider');
  return ctx;
};

const ENV_ENABLE =
  typeof process !== 'undefined'
    ? process.env?.REACT_APP_ENABLE_WEBSOCKETS ?? process.env?.NEXT_PUBLIC_WS_ENABLE
    : undefined;
const ENABLED = ENV_ENABLE === 'false' ? false : true;

export const WebSocketProvider = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const clientRef = useRef(null);
  const connectingRef = useRef(false);
  const subscriptionRef = useRef(null);
  const currentChannelRef = useRef(null);
  const onMessageRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const reconnectListenersRef = useRef(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [reconnectBanner, setReconnectBanner] = useState(false);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (e) {
        // ignore
      }
      subscriptionRef.current = null;
    }
    currentChannelRef.current = null;
    onMessageRef.current = null;
    if (clientRef.current) {
      try {
        clientRef.current.deactivate();
      } catch (e) {
        // ignore
      }
      clientRef.current = null;
    }
    connectingRef.current = false;
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!ENABLED || !isAuthenticated || !token) return;
    if (clientRef.current?.connected) return;
    if (connectingRef.current) return;
    if (reconnectAttemptRef.current >= MAX_ATTEMPTS) {
      setReconnectBanner(true);
      return;
    }

    connectingRef.current = true;
    setConnectionError(null);
    const wsUrl = getWsUrl();

    const client = new Client({
      brokerURL: wsUrl,
      connectHeaders: { Authorization: `Bearer ${token}` },
      debug: (str) => {
        if (process.env.NODE_ENV === 'development') console.log(`STOMP: ${str}`);
      },
      reconnectDelay: 0,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
    });

    client.onConnect = () => {
      const wasReconnect = reconnectAttemptRef.current > 0;
      connectingRef.current = false;
      clientRef.current = client;
      reconnectAttemptRef.current = 0;
      setReconnectBanner(false);
      setIsConnected(true);
      setConnectionError(null);
      const channelId = currentChannelRef.current;
      const onMessage = onMessageRef.current;
      if (channelId && onMessage) {
        subscriptionRef.current = client.subscribe(`/topic/chat/${channelId}`, (msg) => {
          try {
            if (msg.body && (msg.body.trim().startsWith('{') || msg.body.trim().startsWith('['))) {
              const data = JSON.parse(msg.body);
              onMessage(data);
            }
          } catch (e) {
            if (process.env.NODE_ENV === 'development') console.warn('WS parse', e);
          }
        });
      }
      client.subscribe('/topic/online-users', () => {});
      client.subscribe('/topic/account-deleted', (message) => {
        try {
          if (message.body) {
            const data = JSON.parse(message.body);
            if (data.type === 'ACCOUNT_DELETED' && typeof window !== 'undefined') {
              localStorage.clear();
              window.location.href = '/login?deleted=true';
            }
          }
        } catch (e) {
          // ignore
        }
      });
      if (wasReconnect && reconnectListenersRef.current.size > 0) {
        reconnectListenersRef.current.forEach((cb) => { try { cb(); } catch (e) { console.warn('Reconnect listener error', e); } });
      }
    };

    function scheduleReconnect() {
      if (reconnectTimeoutRef.current) return;
      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_ATTEMPTS) {
        setReconnectBanner(true);
        return;
      }
      const delay = backoffWithJitter(BACKOFF_MS[attempt]);
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        if (!clientRef.current?.connected && connectingRef.current === false) connect();
      }, delay);
    }

    client.onStompError = (frame) => {
      connectingRef.current = false;
      clientRef.current = null;
      setConnectionError(frame.headers?.message || 'STOMP error');
      setIsConnected(false);
      if (reconnectAttemptRef.current < MAX_ATTEMPTS) scheduleReconnect();
      else setReconnectBanner(true);
    };

    client.onWebSocketError = () => {
      connectingRef.current = false;
      clientRef.current = null;
      setConnectionError('Connection failed');
      setIsConnected(false);
      if (reconnectAttemptRef.current < MAX_ATTEMPTS) scheduleReconnect();
      else setReconnectBanner(true);
    };

    client.onDisconnect = () => {
      clientRef.current = null;
      setIsConnected(false);
    };

    client.activate();
  }, [isAuthenticated, token]);

  // Connect only when auth changes
  useEffect(() => {
    if (!ENABLED) return;
    if (isAuthenticated && token) {
      disconnect();
      reconnectAttemptRef.current = 0;
      setReconnectBanner(false);
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isAuthenticated, token, connect, disconnect]);

  const subscribeChannel = useCallback((channelId, onMessage) => {
    onMessageRef.current = onMessage;
    currentChannelRef.current = channelId;
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (e) {
        // ignore
      }
      subscriptionRef.current = null;
    }
    const client = clientRef.current;
    if (!client?.connected || !channelId) return;
    subscriptionRef.current = client.subscribe(`/topic/chat/${channelId}`, (msg) => {
      try {
        if (msg.body && (msg.body.trim().startsWith('{') || msg.body.trim().startsWith('['))) {
          const data = JSON.parse(msg.body);
          onMessage(data);
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.warn('WS parse', e);
      }
    });
  }, []);

  const unsubscribeChannel = useCallback(() => {
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (e) {
        // ignore
      }
      subscriptionRef.current = null;
    }
    currentChannelRef.current = null;
    onMessageRef.current = null;
  }, []);

  const sendMessage = useCallback((channelId, message) => {
    const client = clientRef.current;
    if (!ENABLED || !client?.connected || !channelId || !token) return false;
    try {
      client.publish({
        destination: `/app/chat/${channelId}`,
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...message, channelId }),
      });
      return true;
    } catch (e) {
      return false;
    }
  }, [token]);

  const retry = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setReconnectBanner(false);
    setConnectionError(null);
    if (!connectingRef.current && !clientRef.current?.connected) connect();
  }, [connect]);

  const addReconnectListener = useCallback((callback) => {
    reconnectListenersRef.current.add(callback);
    return () => reconnectListenersRef.current.delete(callback);
  }, []);

  const value = {
    isConnected,
    connectionError,
    reconnectBanner,
    subscribeChannel,
    unsubscribeChannel,
    sendMessage,
    connect,
    disconnect,
    retry,
    addReconnectListener,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;
