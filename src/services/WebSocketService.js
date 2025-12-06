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
    }

    connect(endpoint = null, callback = () => {}) {
        const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
            ? window.location.origin
            : (process.env.REACT_APP_API_URL || 'https://theglitch.world');
        const wsEndpoint = endpoint || `${API_BASE_URL}/ws`;
        if (this.isConnected) {
            console.log('WebSocket already connected');
            callback();
            return;
        }

        const socket = new SockJS(wsEndpoint);
        this.stompClient = Stomp.over(socket);
        
        // Disable debug logs
        this.stompClient.debug = () => {};

        this.stompClient.connect({}, () => {
            console.log('WebSocket connected to:', wsEndpoint);
            this.isConnected = true;
            callback();
        }, (error) => {
            console.error('WebSocket connection error:', error);
            this.isConnected = false;
            setTimeout(() => this.connect(endpoint, callback), 5000);
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
}

export default new WebSocketService(); 