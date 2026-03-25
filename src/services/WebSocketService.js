import SockJS from 'sockjs-client';
import { Stomp } from '@stomp/stompjs';
import CryptoJS from 'crypto-js';

class WebSocketService {
    constructor() {
        this.stompClient = null;
        this.isConnected = false;
        this.subscriptions = new Map();
        this.messageHandlers = new Map();
        this.encryptionEnabled = false;
        this.encryptionKey = (process.env.REACT_APP_ENCRYPTION_KEY || '').trim();
        this.threadSubscription = null;
        this.threadSubscriptionDestination = null;
        this.threadMessageHandler = null;
        this.threadReadHandler = null;
    }

    connect(endpointOrConfig = null, callback = () => {}) {
        if (this.isConnected) {
            callback();
            return;
        }

        const isLocal = typeof window !== 'undefined' &&
            /^localhost|127\.0\.0\.1$/.test(window.location?.hostname || '');
        const wsHost = process.env.REACT_APP_WS_HOST || 'https://aura-fx-production.up.railway.app';
        const wsBase = process.env.REACT_APP_INBOX_WS_URL ||
            process.env.REACT_APP_WS_URL ||
            (isLocal ? (window.location?.origin || process.env.REACT_APP_API_URL || '') : wsHost);
        const wsEndpoint = (typeof endpointOrConfig === 'string' && endpointOrConfig)
            ? endpointOrConfig
            : wsBase ? `${wsBase.replace(/\/$/, '')}/ws` : null;

        if (!wsEndpoint) {
            if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
                console.info('Inbox WebSocket skipped: no REACT_APP_INBOX_WS_URL/REACT_APP_WS_URL; using REST + polling.');
            }
            callback();
            return;
        }

        const socketFactory = () => new SockJS(wsEndpoint);
        this.stompClient = Stomp.over(socketFactory);
        this.stompClient.debug = () => {};

        this.stompClient.connect({}, () => {
            this.isConnected = true;
            callback();
        }, (error) => {
            if (process.env.NODE_ENV === 'development') {
                console.warn('WebSocket connection error:', error?.message || error);
            }
            this.isConnected = false;
            callback();
            setTimeout(() => this.connect(endpointOrConfig, callback), 5000);
        });
    }

    disconnect() {
        if (this.stompClient) {
            this.stompClient.disconnect();
            this.isConnected = false;
            this.subscriptions.clear();
            console.log('WebSocket disconnected');
        }
    }

    subscribe(destination, callback) {
        if (!this.isConnected) {
            console.warn('WebSocket not connected, connecting now...');
            this.connect(undefined, () => this.subscribe(destination, callback));
            return { unsubscribe: () => {} };
        }

        if (this.subscriptions.has(destination)) {
            console.log(`Already subscribed to ${destination}`);
            this.messageHandlers.set(destination, callback);
            return this.subscriptions.get(destination);
        }

        const subscription = this.stompClient.subscribe(destination, (message) => {
            try {
                let messageBody = message.body;
                
                // Decrypt message if encryption is enabled
                if (this.encryptionEnabled) {
                    messageBody = this.decryptMessage(messageBody);
                }
                
                let parsedMessage;
                try {
                    // Try to parse as direct JSON
                    parsedMessage = JSON.parse(messageBody);
                } catch (parseError) {
                    // Handle case where the message might be a string that contains JSON
                    if (typeof messageBody === 'string' && 
                        (messageBody.startsWith('"') && messageBody.endsWith('"'))) {
                        const unquoted = JSON.parse(messageBody);
                        if (typeof unquoted === 'string' && 
                           (unquoted.startsWith('{') || unquoted.startsWith('['))) {
                            parsedMessage = JSON.parse(unquoted);
                        } else {
                            parsedMessage = { content: unquoted, timestamp: Date.now(), sender: "System" };
                        }
                    } else {
                        // Just treat as a plain string message
                        parsedMessage = { content: messageBody, timestamp: Date.now(), sender: "System" };
                    }
                }
                
                callback(parsedMessage);
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                console.log('Raw message content:', message.body);
            }
        });

        this.subscriptions.set(destination, subscription);
        this.messageHandlers.set(destination, callback);
        console.log(`Subscribed to ${destination}`);
        return subscription;
    }

    unsubscribe(destination) {
        if (this.subscriptions.has(destination)) {
            this.subscriptions.get(destination).unsubscribe();
            this.subscriptions.delete(destination);
            this.messageHandlers.delete(destination);
            console.log(`Unsubscribed from ${destination}`);
        }
    }

    send(destination, message) {
        if (!this.isConnected || !this.stompClient) {
            console.warn('WebSocket not connected, connecting now...');
            this.connect(undefined, () => this.send(destination, message));
            return;
        }
        const ws = this.stompClient?.ws || this.stompClient?.webSocket;
        if (ws && ws.readyState !== 1) {
            this.isConnected = false;
            return;
        }
        let messageToSend = JSON.stringify(message);
        if (this.encryptionEnabled) {
            messageToSend = this.encryptMessage(messageToSend);
        }
        try {
            this.stompClient.send(destination, {}, messageToSend);
        } catch (e) {
            if (process.env.NODE_ENV === 'development') console.warn('WebSocket send failed:', e?.message || e);
            this.isConnected = false;
        }
    }

    encryptMessage(message) {
        if (!this.encryptionKey) return message;
        return CryptoJS.AES.encrypt(message, this.encryptionKey).toString();
    }

    decryptMessage(encryptedMessage) {
        if (!this.encryptionKey) return encryptedMessage;
        const bytes = CryptoJS.AES.decrypt(encryptedMessage, this.encryptionKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    setEncryptionEnabled(enabled) {
        this.encryptionEnabled = enabled;
    }

    setEncryptionKey(key) {
        this.encryptionKey = key;
    }

    offThreadEvents() {
        this.threadMessageHandler = null;
        this.threadReadHandler = null;
        const dest = this.threadSubscriptionDestination;
        if (dest && this.subscriptions.has(dest)) {
            this.unsubscribe(dest);
        }
        this.threadSubscription = null;
        this.threadSubscriptionDestination = null;
    }

    joinThread(threadId) {
        const id = threadId != null ? String(threadId) : null;
        if (!id) return;
        this.offThreadEvents();
        const destination = `/topic/thread/${id}`;
        this.threadSubscriptionDestination = destination;
        if (this.isConnected && this.stompClient) {
            this.threadSubscription = this.subscribe(destination, (payload) => {
                try {
                    const data = typeof payload === 'object' ? payload : (typeof payload === 'string' ? JSON.parse(payload) : null);
                    if (data && this.threadMessageHandler) this.threadMessageHandler(data);
                    if (data?.thread && this.threadReadHandler) this.threadReadHandler(data);
                } catch (e) {
                    if (this.threadMessageHandler) this.threadMessageHandler({ threadId: id, message: payload, thread: null });
                }
            });
        }
    }

    onThreadMessage(callback) {
        this.threadMessageHandler = typeof callback === 'function' ? callback : null;
    }

    onThreadRead(callback) {
        this.threadReadHandler = typeof callback === 'function' ? callback : null;
    }
}

export default new WebSocketService(); 
