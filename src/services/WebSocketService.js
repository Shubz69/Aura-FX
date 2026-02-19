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
        this.encryptionKey = process.env.REACT_APP_ENCRYPTION_KEY || 'default-encryption-key';
        this.threadSubscription = null;
        this.threadSubscriptionDestination = null;
        this.threadMessageHandler = null;
        this.threadReadHandler = null;
    }

    connect(endpointOrConfig = null, callback = () => {}) {
        const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
            ? window.location.origin
            : (process.env.REACT_APP_API_URL || '');
        // If caller passes an object (e.g. { userId, role }), use default WS URL to avoid [object Object] in path
        const wsEndpoint = (typeof endpointOrConfig === 'string' && endpointOrConfig)
            ? endpointOrConfig
            : `${API_BASE_URL}/ws`;
        if (this.isConnected) {
            console.log('WebSocket already connected');
            callback();
            return;
        }

        const socketFactory = () => new SockJS(wsEndpoint);
        this.stompClient = Stomp.over(socketFactory);
        
        // Disable debug logs
        this.stompClient.debug = () => {};

        this.stompClient.connect({}, () => {
            console.log('WebSocket connected to:', wsEndpoint);
            this.isConnected = true;
            callback();
        }, (error) => {
            console.error('WebSocket connection error:', error);
            this.isConnected = false;
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
        if (!this.isConnected) {
            console.warn('WebSocket not connected, connecting now...');
            this.connect(undefined, () => this.send(destination, message));
            return;
        }

        let messageToSend = JSON.stringify(message);
        
        // Encrypt message if encryption is enabled
        if (this.encryptionEnabled) {
            messageToSend = this.encryptMessage(messageToSend);
        }
        
        this.stompClient.send(destination, {}, messageToSend);
    }

    encryptMessage(message) {
        return CryptoJS.AES.encrypt(message, this.encryptionKey).toString();
    }

    decryptMessage(encryptedMessage) {
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
