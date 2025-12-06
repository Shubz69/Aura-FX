import { useState, useEffect, useCallback, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAuth } from '../context/AuthContext';

// Define a fixed API base URL with proper fallback
const resolveWebSocketBaseUrl = () => {
  if (typeof process !== 'undefined' && process.env?.REACT_APP_WS_URL) {
    const configured = process.env.REACT_APP_WS_URL;
    if (configured === 'window-origin') {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
      }
    } else if (configured) {
      return configured;
    }
  }

  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location ?? {};

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return origin;
    }

    // Production fallback when env var is missing
    if (hostname && hostname.includes('theglitch.world')) {
      return 'https://glitch-realtime-production.up.railway.app';
    }
  }

  return 'https://glitch-realtime-production.up.railway.app';
};

const WS_BASE_URL = resolveWebSocketBaseUrl();

const ENV_ENABLE_FLAG = typeof process !== 'undefined' ? process.env?.REACT_APP_ENABLE_WEBSOCKETS : undefined;
const DEFAULT_ENV_ENABLE = ENV_ENABLE_FLAG === 'false' ? false : true;

export const useWebSocket = (channelId, onMessageCallback, shouldConnect = true) => {
  const { token, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const stompClientRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const connectRef = useRef(null);
  const enableConnection = shouldConnect && DEFAULT_ENV_ENABLE;
  const hasLoggedDisabledRef = useRef(false);
  const hasReachedMaxAttempts = useRef(false);
  const wsDisabledRef = useRef(false); // Use ref for immediate updates (no async state delay)
  const reconnectTimeoutRef = useRef(null);
  const hasLoggedSkipRef = useRef(false);

  const preferNativeSocket = useCallback(() => {
    // Try native WebSocket first - Railway should support direct WebSocket connections
    const wsUrl = WS_BASE_URL.replace(/^http/i, 'ws') + '/ws';
    try {
      const ws = new WebSocket(wsUrl);
      // Add error handler to get more details (will be logged in onWebSocketError)
      return ws;
    } catch (error) {
      console.warn('Native WebSocket unavailable, falling back to SockJS:', error?.message || error);
      return null;
    }
  }, []);

  const createSockJsConnection = useCallback(() => {
    // SockJS makes an initial HTTP request that Railway is responding to with 200
    // This suggests the server might not be configured for SockJS
    // Try with WebSocket transport only to avoid the HTTP check
    return new SockJS(`${WS_BASE_URL}/ws`, null, {
      transports: ['websocket'], // Use WebSocket transport only to avoid HTTP 200 responses
      timeout: 5000,
      sessionId: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
    });
  }, []);

  // Get auth headers for WebSocket connection
  const getAuthHeaders = useCallback(() => {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // Handle reconnection logic - define before connect
  const handleReconnect = useCallback(() => {
    // CRITICAL: Check if disabled or max attempts reached BEFORE doing anything
    if (!enableConnection || wsDisabledRef.current || hasReachedMaxAttempts.current) {
      return; // Skip if disabled or max attempts reached
    }
    
    // CRITICAL: Check if we've already reached max attempts BEFORE incrementing
    // This prevents the 6th attempt from happening
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      // Set flags immediately
      hasReachedMaxAttempts.current = true;
      wsDisabledRef.current = true;
      
      console.warn('Max reconnect attempts reached. WebSocket unavailable. Using REST API polling instead.');
      console.warn(`WebSocket server at ${WS_BASE_URL}/ws is not accessible.`);
      console.warn('');
      console.warn('🔧 RAILWAY SERVER CONFIGURATION REQUIRED:');
      console.warn('The Railway service is returning HTTP 200 instead of 101 Switching Protocols.');
      console.warn('This means the server is not handling WebSocket upgrades properly.');
      console.warn('');
      console.warn('To fix this on Railway:');
      console.warn('1. Ensure your WebSocket server listens on Railway\'s PORT environment variable');
      console.warn('2. Verify the server properly handles WebSocket upgrade requests (HTTP 101)');
      console.warn('3. Check Railway service logs for WebSocket-related errors');
      console.warn('4. Ensure the server code uses proper WebSocket upgrade logic');
      console.warn('');
      console.warn('Messages will continue to update via REST API polling every 5 seconds.');
      setConnectionError(null);
      
      // Clear any pending reconnection timeout IMMEDIATELY
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        
        reconnectTimeoutRef.current = null;
      }
      
      // Ensure client is deactivated IMMEDIATELY
      if (stompClientRef.current) {
        try {
          stompClientRef.current.deactivate();
          stompClientRef.current = null;
        } catch (e) {
          stompClientRef.current = null;
        }
      }
      return;
    }
    
    // Only proceed if we haven't reached max attempts yet
    reconnectAttempts.current += 1;
    console.log(`Reconnect attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`);

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Instead of calling connect directly, schedule a reconnection
    reconnectTimeoutRef.current = setTimeout(() => {
      // CRITICAL: Check multiple times before attempting to reconnect
      // First check - if disabled or max attempts reached, abort immediately
      if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
        reconnectTimeoutRef.current = null;
        return; // Don't reconnect if disabled
      }
      
      // Second check - if we've exceeded max attempts, abort
      if (reconnectAttempts.current > maxReconnectAttempts) {
        reconnectTimeoutRef.current = null;
        // Set flags to prevent further attempts
        hasReachedMaxAttempts.current = true;
        wsDisabledRef.current = true;
        return;
      }
      
      // Third check - if we've reached max attempts (not exceeded, but reached), abort
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        reconnectTimeoutRef.current = null;
        // Set flags to prevent further attempts
        hasReachedMaxAttempts.current = true;
        wsDisabledRef.current = true;
        console.warn('Max reconnect attempts reached. WebSocket unavailable. Using REST API polling instead.');
        return;
      }
      
      // Final check before logging and calling connect
      // Only proceed if we haven't reached max attempts yet
      if (!wsDisabledRef.current && !hasReachedMaxAttempts.current && reconnectAttempts.current < maxReconnectAttempts) {
        console.log('Attempting to reconnect...');
        // Final check before calling connect
        if (!wsDisabledRef.current && !hasReachedMaxAttempts.current && typeof connectRef.current === 'function') {
          connectRef.current();
        }
      } else {
        // If we've reached max attempts, set flags and abort
        reconnectTimeoutRef.current = null;
        hasReachedMaxAttempts.current = true;
        wsDisabledRef.current = true;
      }
      reconnectTimeoutRef.current = null;
    }, 2000 * reconnectAttempts.current);
  }, [enableConnection]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't attempt connection if WebSocket is disabled or we've reached max attempts
    // Use ref for immediate check (no async state delay)
    if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
      return;
    }
    
    // Skip connection if not authenticated or missing channelId or shouldConnect is false
    if (!enableConnection || !isAuthenticated || !token || !channelId) {
      if (!enableConnection && !hasLoggedDisabledRef.current) {
        console.info('WebSocket connections disabled for this environment.');
        hasLoggedDisabledRef.current = true;
      } else if ((!isAuthenticated || !token || !channelId) && !hasLoggedSkipRef.current) {
        // Only log once to avoid spam
        hasLoggedSkipRef.current = true;
        // Reset the flag after a delay so it can log again if conditions change
        setTimeout(() => {
          hasLoggedSkipRef.current = false;
        }, 5000);
      }
      return;
    }
    
    // Reset skip log flag when we have all requirements
    hasLoggedSkipRef.current = false;

    try {
      // Final check - if disabled, don't proceed at all
      if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
        return;
      }

      // Only log if we haven't reached max attempts (to reduce spam)
      if (!hasReachedMaxAttempts.current) {
        console.log(`Connecting to WebSocket at ${WS_BASE_URL}/ws`);
      }

      // Clear any previous connection
      if (stompClientRef.current) {
        try {
          // Use deactivate() instead of disconnect() - STOMP Client uses deactivate
          // Check for method existence first, then check if connected
          if (typeof stompClientRef.current.deactivate === 'function') {
            if (stompClientRef.current.connected) {
              stompClientRef.current.deactivate();
            }
          } else if (typeof stompClientRef.current.disconnect === 'function') {
            // Fallback for older API (shouldn't be needed with @stomp/stompjs)
            if (stompClientRef.current.connected) {
              stompClientRef.current.disconnect();
            }
          }
          // Clear the reference after cleanup attempt
          stompClientRef.current = null;
        } catch (e) {
          // Ignore errors when cleaning up old connection
          console.warn('Error cleaning up previous connection:', e);
          // Clear reference even if cleanup failed
          stompClientRef.current = null;
        }
      }

      // CRITICAL: Final check before creating client - prevent client creation if disabled
      if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
        return;
      }

      const wsUrl = WS_BASE_URL.replace(/^http/i, 'ws') + '/ws';
      
      // Try native WebSocket first - Railway should support direct WebSocket
      // SockJS is causing issues because it makes HTTP requests that get 200 instead of 101
      let nativeSocket = null;
      try {
        nativeSocket = preferNativeSocket();
      } catch (error) {
        console.warn('Failed to create native WebSocket, will try SockJS:', error);
      }

      // CRITICAL: Check again right before creating client
      if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
        return;
      }

      const client = new Client({
        // Use brokerURL for native WebSocket, undefined for SockJS
        brokerURL: nativeSocket ? wsUrl : undefined,
        webSocketFactory: () => {
          if (nativeSocket) {
            return nativeSocket;
          }
          // Fallback to SockJS only if native WebSocket fails
          return createSockJsConnection();
        },
        connectHeaders: getAuthHeaders(),
        debug: (str) => {
          if (process.env.NODE_ENV === 'development' && !wsDisabledRef.current) {
            console.log(`STOMP: ${str}`);
          }
        },
        reconnectDelay: 0, // Disable STOMP's automatic reconnection - we handle it manually
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      // Set connection handlers
      client.onConnect = (frame) => {
        // Only process connection if WebSocket is not disabled (use ref for immediate check)
        if (wsDisabledRef.current) {
          try {
            client.deactivate();
          } catch (e) {
            // Ignore
          }
          return;
        }
        
        console.log('WebSocket Connected:', frame);
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        hasReachedMaxAttempts.current = false; // Reset max attempts flag on successful connection
        wsDisabledRef.current = false; // Re-enable WebSocket on successful connection
        reconnectTimeoutRef.current = null; // Clear any pending reconnection

        // Subscribe to channel
        if (channelId) {
          client.subscribe(`/topic/chat/${channelId}`, (message) => {
            console.log('Received message:', message);
            try {
              // Check if message.body exists and is valid JSON
              if (message.body) {
                // Validate if the message is proper JSON before parsing
                if (message.body.trim().startsWith('{') || message.body.trim().startsWith('[')) {
                  try {
                    const data = JSON.parse(message.body);
                    onMessageCallback(data);
                  } catch (parseError) {
                    console.error('Error parsing message as JSON:', parseError);
                    console.warn('Invalid JSON received:', message.body.substring(0, 50) + '...');
                  }
                } else {
                  // Handle non-JSON message
                  console.warn('Received non-JSON message:', message.body.substring(0, 50) + '...');
                }
              }
            } catch (error) {
              console.error('Error handling message:', error);
            }
          });

          // Also subscribe to online users updates
          client.subscribe('/topic/online-users', (message) => {
            try {
              if (message.body) {
                const data = JSON.parse(message.body);
                console.log('Online users update received:', data);
              }
            } catch (error) {
              console.error('Error parsing online users update:', error);
            }
          });
        }
      };

      client.onStompError = (frame) => {
        // CRITICAL: Check if disabled BEFORE doing anything
        if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
          return; // Don't process error if already disabled
        }
        
        // Only log if we haven't reached max attempts (to reduce spam)
        if (!hasReachedMaxAttempts.current && !wsDisabledRef.current) {
          console.error('STOMP Error:', frame);
        }
        setConnectionError(`STOMP Error: ${frame.headers?.message || 'Unknown error'}`);
        setIsConnected(false);
        
        // Only attempt reconnection if we haven't reached max attempts and WebSocket is not disabled
        // Double-check before calling handleReconnect
        if (!hasReachedMaxAttempts.current && !wsDisabledRef.current) {
          handleReconnect();
        }
      };

      client.onWebSocketError = (error) => {
        // CRITICAL: Check if disabled BEFORE doing anything
        if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
          return; // Don't process error if already disabled
        }
        
        const errorMessage = error instanceof Event
          ? 'Cannot connect to server. Server may be unavailable.'
          : (error.message || 'Connection failed');

        // Only log detailed error on first attempt to help diagnose
        if (reconnectAttempts.current === 0 && !hasReachedMaxAttempts.current && !wsDisabledRef.current) {
          console.error('WebSocket Error:', error);
          console.error(`Failed to connect to: ${WS_BASE_URL}/ws`);
          console.error('This usually means:');
          console.error('1. Railway WebSocket service is down or not running');
          console.error('2. The WebSocket endpoint URL is incorrect');
          console.error('3. Network/CORS/firewall issues');
          console.error('Please check your Railway dashboard to ensure the WebSocket service is running.');
        } else if (!hasReachedMaxAttempts.current && !wsDisabledRef.current) {
          // Less verbose for subsequent attempts
          console.error('WebSocket Error:', errorMessage);
        }
        setConnectionError(`WebSocket Error: ${errorMessage}`);
        setIsConnected(false);
        
        // Only attempt reconnection if we haven't reached max attempts and WebSocket is not disabled
        // Double-check before calling handleReconnect
        if (!hasReachedMaxAttempts.current && !wsDisabledRef.current) {
          handleReconnect();
        }
        // After max attempts, silently fail - no more logging
      };

      client.onDisconnect = () => {
        // Only log if we haven't reached max attempts (to reduce spam)
        if (!hasReachedMaxAttempts.current && !wsDisabledRef.current) {
          console.log('WebSocket Disconnected');
        }
        setIsConnected(false);
      };

      // Final check before activating - if disabled, don't activate
      if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
        try {
          client.deactivate();
        } catch (e) {
          // Ignore errors
        }
        return; // Don't activate if disabled
      }

      // Activate the client
      stompClientRef.current = client;
      
      // CRITICAL: One more check right before activate (race condition protection)
      if (!wsDisabledRef.current && !hasReachedMaxAttempts.current) {
        client.activate();
      } else {
        // If disabled after storing client, deactivate immediately
        try {
          client.deactivate();
          stompClientRef.current = null;
        } catch (e) {
          // Ignore errors
        }
      }

    } catch (error) {
      // Only log if we haven't reached max attempts (to reduce spam)
      if (!hasReachedMaxAttempts.current && !wsDisabledRef.current) {
        console.error('Error creating WebSocket connection:', error);
      }
      setConnectionError(`Connection Error: ${error.message}`);
      setIsConnected(false);
      
      // Only attempt reconnection if we haven't reached max attempts and WebSocket is not disabled
      if (!hasReachedMaxAttempts.current && !wsDisabledRef.current) {
        handleReconnect();
      }
    }
  }, [channelId, getAuthHeaders, onMessageCallback, handleReconnect, isAuthenticated, token, enableConnection, preferNativeSocket, createSockJsConnection]);

  // Update the connectRef when connect changes
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Send message through WebSocket
  const sendMessage = useCallback((message) => {
    if (!enableConnection) {
      console.log('WebSocket connections disabled, not sending message');
      return false;
    }

    if (!isAuthenticated || !token) {
      console.log('Cannot send message: Not authenticated');
      return false;
    }

    if (!stompClientRef.current || !stompClientRef.current.connected || !channelId) {
      console.error('Cannot send message: WebSocket not connected or channelId missing');
      return false;
    }

    try {
      stompClientRef.current.publish({
        destination: `/app/chat/${channelId}`,
        headers: getAuthHeaders(),
        body: JSON.stringify(message)
      });
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }, [channelId, getAuthHeaders, isAuthenticated, token, enableConnection]);

  // Initial connection
  useEffect(() => {
    // CRITICAL: Don't attempt connection if WebSocket is disabled or we've reached max attempts
    // Use ref for immediate check (no async state delay)
    // This check must be FIRST and must prevent ALL execution if true
    if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
      // Ensure client is deactivated if it exists
      if (stompClientRef.current) {
        try {
          stompClientRef.current.deactivate();
          stompClientRef.current = null; // Clear reference
        } catch (e) {
          // Ignore errors
          stompClientRef.current = null; // Clear anyway
        }
      }
      // CRITICAL: Return early - do NOT proceed with any connection logic
      // Don't even check other conditions - just return
      return;
    }
    
    // Only proceed if WebSocket is NOT disabled (double-check)
    if (wsDisabledRef.current || hasReachedMaxAttempts.current) {
      return;
    }
    
    // Only connect if all conditions are met AND WebSocket is not disabled
    if (enableConnection && isAuthenticated && token && channelId) {
      // Triple-check before calling connect (race condition protection)
      if (!wsDisabledRef.current && !hasReachedMaxAttempts.current) {
        // Final check right before calling - use connectRef to avoid dependency issues
        if (!wsDisabledRef.current && !hasReachedMaxAttempts.current && typeof connectRef.current === 'function') {
          connectRef.current();
        }
      }
    } else if (!enableConnection && !wsDisabledRef.current) {
      // Only log if WebSocket is not disabled (to avoid spam)
      console.log('WebSocket connections disabled, not connecting');
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Only disconnect if we haven't reached max attempts (to avoid spam)
      if (stompClientRef.current && !hasReachedMaxAttempts.current && !wsDisabledRef.current) {
        try {
          stompClientRef.current.deactivate();
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    };
  }, [enableConnection, isAuthenticated, token, channelId]); // Removed 'connect' from dependencies to prevent re-triggering

  return {
    isConnected,
    connectionError,
    sendMessage
  };
};
