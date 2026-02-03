/**
 * useWebSocket - Consumes provider-level singleton; channel switch = resubscribe only.
 * Connect only when (isAuthenticated && token); never on channel/route.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';

const DEFAULT_ENABLE =
  typeof process !== 'undefined'
    ? (process.env?.REACT_APP_ENABLE_WEBSOCKETS ?? process.env?.NEXT_PUBLIC_WS_ENABLE) !== 'false'
    : true;

export const useWebSocket = (channelId, onMessageCallback, shouldConnect = true) => {
  const {
    isConnected,
    connectionError,
    reconnectBanner,
    subscribeChannel,
    unsubscribeChannel,
    sendMessage: ctxSendMessage,
  } = useWebSocketContext();

  const [localError, setLocalError] = useState(null);
  const prevChannelRef = useRef(null);
  const onMessageRef = useRef(onMessageCallback);
  onMessageRef.current = onMessageCallback;

  const enableConnection = Boolean(shouldConnect && DEFAULT_ENABLE);

  useEffect(() => {
    if (!enableConnection || !channelId) {
      if (prevChannelRef.current) {
        unsubscribeChannel();
        prevChannelRef.current = null;
      }
      return;
    }

    const prev = prevChannelRef.current;
    if (prev === channelId) return;

    if (prev) unsubscribeChannel();
    prevChannelRef.current = channelId;

    const handler = (data) => {
      const fn = onMessageRef.current;
      if (fn) fn(data);
    };
    subscribeChannel(channelId, handler);

    return () => {
      if (prevChannelRef.current === channelId) {
        unsubscribeChannel();
        prevChannelRef.current = null;
      }
    };
  }, [enableConnection, channelId, subscribeChannel, unsubscribeChannel]);

  const sendMessage = useCallback(
    (message) => {
      if (!enableConnection || !channelId) return false;
      return ctxSendMessage(channelId, message);
    },
    [enableConnection, channelId, ctxSendMessage]
  );

  const displayError = connectionError || localError;

  return {
    isConnected,
    connectionError: displayError,
    reconnectBanner,
    sendMessage,
  };
};
