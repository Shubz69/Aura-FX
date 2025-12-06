import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import '../styles/Community.css';
import { useWebSocket } from '../utils/useWebSocket';
import { useNavigate, useParams } from 'react-router-dom';
import Api from '../services/Api';
import BinaryBackground from '../components/BinaryBackground';
import { SUPER_ADMIN_EMAIL } from '../utils/roles';

// Icons
import { FaHashtag, FaLock, FaBullhorn, FaPaperPlane, FaSmile, FaTrash, FaPaperclip, FaTimes, FaPlus } from 'react-icons/fa';

// All API calls use real endpoints only - no mock mode

// Emojis array for the emoji picker
const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
    '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
    '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
    '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
    '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
    '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
    '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😯', '😦', '😧',
    '😮', '😲', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮',
    '💪', '👍', '👎', '👏', '🙌', '👋', '🤝', '🙏', '💰', '💸',
    '💎', '💵', '💴', '💶', '💷', '🚀', '📈', '📉', '💹', '⚡',
    '🔥', '⭐', '✨', '💫', '🌟', '🎯', '🎮', '🎵', '🎶', '❤️',
    '💜', '💙', '💚', '💛', '🧡', '🖤', '🤍', '🤎', '💔', '❣️'
];

// Online users will be fetched from API or computed from real data


// Emoji picker component
const EmojiPicker = ({ onEmojiSelect, onClose }) => {
    return (
        <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
            <div className="emoji-picker-header">
                <span>Emoji</span>
                <button className="emoji-picker-close" onClick={onClose}>×</button>
            </div>
            <div className="emoji-grid">
                {emojis.map((emoji, index) => (
                    <button
                        key={index}
                        className="emoji-item"
                        onClick={() => onEmojiSelect(emoji)}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
};

// Get category icon
const getCategoryIcon = (category) => {
    switch(category) {
        case 'announcements': return '📢';
        case 'staff': return '👨‍💼';
        case 'courses': return '📚';
        case 'trading': return '📈';
        case 'general': return '💬';
        case 'support': return '🆘';
        case 'premium': return '⭐';
        default: return '#';
    }
};

// Get channel icon
const getChannelIcon = (channel) => {
    if (channel.accessLevel === 'admin-only') return <FaLock />;
    if (channel.category === 'announcements') return <FaBullhorn />;
    return <FaHashtag />;
};

// Main Community Component
const Community = () => {
    const [userLevel, setUserLevel] = useState(1);
    const [storedUser, setStoredUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAdminUser, setIsAdminUser] = useState(false);
    const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const navigate = useNavigate();
    const { id: channelIdParam } = useParams();
    
    const [channelList, setChannelList] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [totalUsers, setTotalUsers] = useState(0);
    const [onlineCount, setOnlineCount] = useState(0);
    const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected', 'connecting', 'server-issue', 'wifi-issue'
    const messagesEndRef = useRef(null);
    const messageInputRef = useRef(null);
    
    // Discord-like features
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const fileInputRef = useRef(null);
    const channelListRef = useRef([]);
    const selectedChannelRef = useRef(null);

    useEffect(() => {
        channelListRef.current = channelList;
    }, [channelList]);

    useEffect(() => {
        selectedChannelRef.current = selectedChannel;
    }, [selectedChannel]);
    
    // Welcome message and channel visibility
    const [hasReadWelcome, setHasReadWelcome] = useState(false);
    const [courses, setCourses] = useState([]);
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);
    const [paymentFailed, setPaymentFailed] = useState(false);
    const [showChannelManager, setShowChannelManager] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [newChannelCategory, setNewChannelCategory] = useState('trading');
    const [newChannelDescription, setNewChannelDescription] = useState('');
    const [newChannelAccess, setNewChannelAccess] = useState('open');
    const [channelActionStatus, setChannelActionStatus] = useState(null);
    const [channelActionLoading, setChannelActionLoading] = useState(false);
    
    // Delete message modal state
    const [deleteMessageModal, setDeleteMessageModal] = useState(null); // { messageId, messageContent }
    const [isDeletingMessage, setIsDeletingMessage] = useState(false);
    
    const categoryOrder = useMemo(() => ([
        'announcements',
        'staff',
        'courses',
        'trading',
        'general',
        'support',
        'premium'
    ]), []);

    const protectedChannelIds = useMemo(() => (['welcome', 'announcements', 'admin']), []);

    const sortChannels = useCallback((channels) => {
        const orderMap = categoryOrder.reduce((map, category, index) => {
            map[category] = index;
            return map;
        }, {});

        return [...channels].sort((a, b) => {
            const catA = orderMap[(a.category || 'general')] ?? Number.MAX_SAFE_INTEGER;
            const catB = orderMap[(b.category || 'general')] ?? Number.MAX_SAFE_INTEGER;

            if (catA !== catB) {
                return catA - catB;
            }

            const nameA = (a.displayName || a.name || '').toLowerCase();
            const nameB = (b.displayName || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [categoryOrder]);

    const refreshChannelList = useCallback(async ({ selectChannelId } = {}) => {
        if (!isAuthenticated) {
            return channelListRef.current;
        }

        // OPTIMIZATION: Load cached channels first for instant display
        const cachedChannelsKey = 'community_channels_cache';
        let cachedChannels = [];
        try {
            const cached = localStorage.getItem(cachedChannelsKey);
            if (cached) {
                cachedChannels = JSON.parse(cached);
                if (cachedChannels.length > 0) {
                    // Show cached channels immediately
                    const preparedCached = cachedChannels.map((channel) => {
                        const baseId = channel.id ?? channel.name ?? `channel-${Date.now()}`;
                        const idString = String(baseId);
                        const normalizedName = channel.name || idString;
                        const displayNameValue = channel.displayName || normalizedName
                            .split('-')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ');
                        const accessLevelValue = (channel.accessLevel || channel.access_level || 'open').toLowerCase();
                        return {
                            ...channel,
                            id: idString,
                            name: normalizedName,
                            displayName: displayNameValue,
                            category: channel.category || 'general',
                            description: channel.description || '',
                            accessLevel: accessLevelValue,
                            locked: channel.locked ?? accessLevelValue === 'admin-only'
                        };
                    });
                    setChannelList(sortChannels(preparedCached));
                }
            }
        } catch (cacheError) {
            console.warn('Error loading cached channels:', cacheError);
        }

        let channelsFromServer = [];

        try {
            const response = await Api.getChannels();
            if (Array.isArray(response?.data)) {
                channelsFromServer = response.data;
            } else if (Array.isArray(response?.data?.channels)) {
                channelsFromServer = response.data.channels;
            }
            
            // Cache channels for next time
            if (channelsFromServer.length > 0) {
                localStorage.setItem(cachedChannelsKey, JSON.stringify(channelsFromServer));
            }
        } catch (error) {
            console.warn('Failed to fetch channels from API:', error?.message || error);
            // Keep showing cached channels if API fails
            if (cachedChannels.length > 0) {
                return channelListRef.current;
            }
        }

        let preparedChannels = [];

        if (Array.isArray(channelsFromServer) && channelsFromServer.length > 0) {
            preparedChannels = channelsFromServer.map((channel) => {
                const baseId = channel.id ?? channel.name ?? `channel-${Date.now()}`;
                const idString = String(baseId);
                const normalizedName = channel.name || idString;
                const displayNameValue = channel.displayName || normalizedName
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                const accessLevelValue = (channel.accessLevel || channel.access_level || 'open').toLowerCase();

                return {
                    ...channel,
                    id: idString,
                    name: normalizedName,
                    displayName: displayNameValue,
                    category: channel.category || 'general',
                    description: channel.description || '',
                    accessLevel: accessLevelValue,
                    locked: channel.locked ?? accessLevelValue === 'admin-only'
                };
            });
        } else if (channelListRef.current.length > 0) {
            preparedChannels = channelListRef.current;
        } else if (courses && courses.length > 0) {
            const courseChannels = courses.map((course, index) => {
                const courseTitle = course.title || course.name || `Course ${index + 1}`;
                const slug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                return {
                    id: `course-${course.id || index}`,
                    name: slug,
                    displayName: courseTitle,
                    description: `${courseTitle} course channel`,
                    accessLevel: 'open',
                    category: 'courses',
                    locked: false
                };
            });

            const essentialChannels = [
                { id: 'welcome', name: 'welcome', displayName: 'Welcome', category: 'announcements', description: 'Welcome to THE GLITCH community!', accessLevel: 'open', locked: false },
                { id: 'announcements', name: 'announcements', displayName: 'Announcements', category: 'announcements', description: 'Important platform announcements', accessLevel: 'admin-only', locked: true },
                { id: 'general-chat', name: 'general-chat', displayName: 'General Chat', category: 'trading', description: 'General trading discussion', accessLevel: 'open', locked: false }
            ];

            preparedChannels = [...essentialChannels, ...courseChannels];
        } else {
            preparedChannels = [
                { id: 'welcome', name: 'welcome', displayName: 'Welcome', category: 'announcements', description: 'Welcome to THE GLITCH community!', accessLevel: 'open', locked: false },
                { id: 'announcements', name: 'announcements', displayName: 'Announcements', category: 'announcements', description: 'Important platform announcements', accessLevel: 'admin-only', locked: true },
                { id: 'general-chat', name: 'general-chat', displayName: 'General Chat', category: 'general', description: 'General trading discussion', accessLevel: 'open', locked: false }
            ];
        }

        if (preparedChannels.length === 0) {
            return channelListRef.current;
        }

        const sortedChannels = sortChannels(preparedChannels);
        setChannelList(sortedChannels);

        const currentSelectedId = selectedChannelRef.current?.id || null;
        const normalizedSelectId = selectChannelId ? selectChannelId.toString() : null;
        const routeTargetId = channelIdParam ? channelIdParam.toString() : null;
        const targetId = normalizedSelectId || routeTargetId || currentSelectedId;

        let nextSelection = sortedChannels.find((channel) => String(channel.id) === String(targetId));

        if (!nextSelection && currentSelectedId) {
            nextSelection = sortedChannels.find((channel) => String(channel.id) === String(currentSelectedId));
        }

        if (!nextSelection && sortedChannels.length > 0) {
            nextSelection = sortedChannels[0];
        }

        if ((nextSelection?.id || null) !== currentSelectedId) {
            setSelectedChannel(nextSelection || null);
        }

        return sortedChannels;
    }, [isAuthenticated, courses, sortChannels, channelIdParam]);
    
    // Initialize WebSocket connection for real-time messaging
    const enableRealtime = useMemo(() => {
        if (process.env.REACT_APP_ENABLE_WEBSOCKETS === 'false') return false;
        if (process.env.REACT_APP_ENABLE_WEBSOCKETS === 'true') return true;
        return true;
    }, []);

    const { 
        isConnected, 
        connectionError,
        sendMessage: sendWebSocketMessage
    } = useWebSocket(
        selectedChannel?.id,
        (message) => {
            setMessages(prev => {
                const isDuplicate = prev.some(m => 
                    m.id === message.id ||
                    (m.content === message.content && 
                    m.sender?.username === message.sender?.username &&
                    Math.abs(new Date(m.timestamp).getTime() - new Date(message.timestamp).getTime()) < 5000)
                );
                
                if (isDuplicate) {
                    return prev;
                }
                
                const newMessages = [...prev, message];
                // Save to localStorage as backup
                if (selectedChannel?.id) {
                    saveMessagesToStorage(selectedChannel.id, newMessages);
                }
                return newMessages;
            });
        },
        enableRealtime
    );

    // ***** LOCALSTORAGE FUNCTIONS FOR MESSAGE PERSISTENCE *****
    
    // Save messages to localStorage
    const saveMessagesToStorage = (channelId, messages) => {
        if (!channelId) return;
        try {
            const key = `community_messages_${channelId}`;
            localStorage.setItem(key, JSON.stringify(messages));
        } catch (error) {
            console.error('Error saving messages to localStorage:', error);
        }
    };

    // Load messages from localStorage
    const loadMessagesFromStorage = (channelId) => {
        if (!channelId) return [];
        try {
            const key = `community_messages_${channelId}`;
            const stored = localStorage.getItem(key);
            if (stored) {
                const messages = JSON.parse(stored);
                return messages;
            }
        } catch (error) {
            console.error('Error loading messages from localStorage:', error);
        }
        return [];
    };

    const persistMessagesList = (channelId, nextMessages) => {
        setMessages(nextMessages);
        saveMessagesToStorage(channelId, nextMessages);
    };

    const replaceMessageById = (list, messageId, replacement) =>
        list.map(msg => (msg.id === messageId ? replacement : msg));

    // ***** XP SYSTEM FUNCTIONS *****
    
    // XP and Level calculation rules
    const XP_PER_MESSAGE = 0.01; // Base XP for sending a message
    const XP_PER_FILE = 20; // Extra XP for including a file/image
    const XP_PER_EMOJI = 0.001; // Extra XP per emoji in message
    
    // Level thresholds - XP required to reach each level
    const getLevelFromXP = (xp) => {
        // Level formula: Level = floor(sqrt(XP / 100)) + 1
        // This means: Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 400 XP, Level 4 = 900 XP, etc.
        return Math.floor(Math.sqrt(xp / 100)) + 1;
    };
    
    // Award XP and update user data
    const awardXP = (earnedXP) => {
        try {
            // Get current user data
            const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
            const currentXP = currentUser.xp || 0;
            const newXP = currentXP + earnedXP;
            const newLevel = getLevelFromXP(newXP);
            const oldLevel = getLevelFromXP(currentXP);
            
            // Update user data
            const updatedUser = {
                ...currentUser,
                xp: newXP,
                level: newLevel,
                totalMessages: (currentUser.totalMessages || 0) + 1
            };
            
            // Save to localStorage
            localStorage.setItem('user', JSON.stringify(updatedUser));
            
            // Update state
            setStoredUser(updatedUser);
            setUserLevel(newLevel);
            
            return {
                earnedXP,
                newXP,
                newLevel,
                leveledUp: newLevel > oldLevel
            };
        } catch (error) {
            console.error('Error awarding XP:', error);
            return null;
        }
    };
    
    // Calculate XP for a message
    const calculateMessageXP = (messageContent, hasFile) => {
        let totalXP = XP_PER_MESSAGE;
        
        // Bonus for file attachments
        if (hasFile) {
            totalXP += XP_PER_FILE;
        }
        
        // Bonus for emojis (count emojis in message)
        const emojiRegex = /[\p{Emoji}]/gu;
        const emojiMatches = messageContent.match(emojiRegex);
        if (emojiMatches) {
            totalXP += emojiMatches.length * XP_PER_EMOJI;
        }
        
        // Bonus for longer messages (1 XP per 50 characters, max 20 bonus XP)
        const lengthBonus = Math.min(20, Math.floor(messageContent.length / 50));
        totalXP += lengthBonus;
        
        return totalXP;
    };

    // Get user's role
    const getCurrentUserRole = () => {
        if (isSuperAdminUser) return 'super_admin';
        if (isAdminUser) return 'admin';
        if (storedUser?.role) return storedUser.role.toLowerCase();
        return 'free';
    };

    // Get user's courses
    const getUserCourses = () => {
        return storedUser?.courses || [];
    };

    // Check if user can access channel
    const canUserAccessChannel = (channel) => {
        const userRole = getCurrentUserRole();
        const userCourses = getUserCourses();
        
        // Admins and Super Admins can access everything
        if (userRole === 'admin' || userRole === 'super_admin' || isAdminUser || isSuperAdminUser) {
            return true;
        }
        
        // Check access level
        if (channel.accessLevel === 'admin-only') {
            return false;
        }
        
        if (channel.accessLevel === 'open') {
            return true;
        }
        
        if (channel.accessLevel === 'premium') {
            return userRole === 'premium';
        }
        
        if (channel.accessLevel === 'level') {
            return userLevel >= (channel.minLevel || 0);
        }
        
        if (channel.accessLevel === 'course') {
            return userCourses.some(course => course.id === channel.courseId);
        }
        
        return true;
    };

    // Check if user can post in channel
    const canUserPostInChannel = (channel) => {
        const userRole = getCurrentUserRole();
        const channelName = (channel.name || '').toLowerCase();
        const isAdminChannel = channel.accessLevel === 'admin-only' || channel.locked || channelName === 'admin';
        const isWelcomeChannel = channelName === 'welcome';
        const isAnnouncementsChannel = channelName === 'announcements';
               // Admin-only channels: only admins can post
        if (isAdminChannel) {
            return userRole === 'admin' || userRole === 'super_admin' || isAdminUser || isSuperAdminUser;
        }
        
        // Welcome and announcements channels: read-only for everyone except admins
        if ((isWelcomeChannel || isAnnouncementsChannel) && !isAdminUser && !isSuperAdminUser) {
            return false; // Read-only for non-admins, admins can post
        }
        
        // All other channels: everyone with subscription can post
        if (hasActiveSubscription || isAdminUser || isSuperAdminUser) {
            return true;
        }
        
        // Non-subscribed users cannot post
        return false;
    };

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Emoji selection handler
    const handleEmojiSelect = (emoji) => {
        const input = messageInputRef.current;
        if (input) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = newMessage;
            const before = text.substring(0, start);
            const after = text.substring(end);
            
            setNewMessage(before + emoji + after);
            
            // Set cursor position after emoji
            setTimeout(() => {
                input.focus();
                input.setSelectionRange(start + emoji.length, start + emoji.length);
            }, 0);
        }
        setShowEmojiPicker(false);
    };

    // File selection handler
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            
            // Create preview for images
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setFilePreview(reader.result);
                };
                reader.readAsDataURL(file);
            } else {
                setFilePreview(null);
            }
        }
    };

    // Remove selected file
    const removeSelectedFile = () => {
        setSelectedFile(null);
        setFilePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Fetch messages for a channel - optimized for fast loading
    const fetchMessages = useCallback(async (channelId) => {
        if (!channelId) return;
        
        // OPTIMIZATION: Load from localStorage FIRST for instant display
        const cachedMessages = loadMessagesFromStorage(channelId);
        if (cachedMessages.length > 0) {
            // Show cached messages immediately while fetching fresh ones
            setMessages(cachedMessages);
        } else {
            // No cache, show empty array immediately
            setMessages([]);
        }
        
        // Then fetch from API in background to get latest messages
        try {
            const response = await Api.getChannelMessages(channelId);
            if (response && response.data && Array.isArray(response.data)) {
                const apiMessages = response.data;
                
                // Only update if messages actually changed (avoid unnecessary re-renders)
                if (JSON.stringify(apiMessages) !== JSON.stringify(cachedMessages)) {
                    // Save to localStorage as backup/cache
                    saveMessagesToStorage(channelId, apiMessages);
                    
                    // Update with fresh messages from API
                    setMessages(apiMessages);
                }
                return;
            }
        } catch (apiError) {
            // Silently fail if we already have cached messages
            if (cachedMessages.length === 0) {
                console.warn('Backend API unavailable, no cached messages:', apiError.message);
            }
            // Keep showing cached messages if available
        }
    }, []);

    const handleCreateChannel = async (event) => {
        if (event) {
            event.preventDefault();
        }

        if (!newChannelName.trim()) {
            setChannelActionStatus({ type: 'error', message: 'Channel name is required.' });
            return;
        }

        setChannelActionLoading(true);
        setChannelActionStatus(null);

        try {
            const payload = {
                displayName: newChannelName.trim(),
                category: newChannelCategory,
                description: newChannelDescription.trim(),
                accessLevel: newChannelAccess
            };

            const response = await Api.createChannel(payload);
            const createdChannel = response?.data?.channel;
            const fallbackId = createdChannel?.id || createdChannel?.name || newChannelName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const localChannel = createdChannel || {
                id: fallbackId,
                name: fallbackId,
                displayName: newChannelName.trim(),
                category: newChannelCategory,
                description: newChannelDescription.trim(),
                accessLevel: newChannelAccess,
                locked: newChannelAccess === 'admin-only'
            };

            setChannelList(previous => {
                const withoutExisting = previous.filter(ch => ch.id !== localChannel.id);
                return sortChannels([...withoutExisting, localChannel]);
            });
            setSelectedChannel(localChannel);

            await refreshChannelList({ selectChannelId: fallbackId });
            setChannelActionStatus({ type: 'success', message: 'Channel created successfully.' });

            setNewChannelName('');
            setNewChannelDescription('');
            setNewChannelAccess('open');

        } catch (error) {
            console.error('Failed to create channel:', error);
            setChannelActionStatus({
                type: 'error',
                message: error.response?.data?.message || error.message || 'Failed to create channel.'
            });
        } finally {
            setChannelActionLoading(false);
        }
    };

    const handleDeleteChannel = async (channel) => {
        if (!channel || protectedChannelIds.includes(channel.id)) {
            return;
        }

        // Use confirmation modal instead of window.confirm
        // This will be handled by the channel manager modal
        // For now, keep the confirm but we'll replace it with modal later
        const confirmed = window.confirm(`Delete channel "${channel.displayName || channel.name}"? This cannot be undone.`);
        if (!confirmed) return;

        setChannelActionLoading(true);
        setChannelActionStatus(null);

        try {
            await Api.deleteChannel(channel.id);
            await refreshChannelList();
            localStorage.removeItem(`community_messages_${channel.id}`);

            if (selectedChannel?.id === channel.id) {
                setMessages([]);
            }

            setChannelActionStatus({ type: 'success', message: 'Channel deleted successfully.' });
        } catch (error) {
            console.error('Failed to delete channel:', error);
            setChannelActionStatus({
                type: 'error',
                message: error.response?.data?.message || error.message || 'Failed to delete channel.'
            });
        } finally {
            setChannelActionLoading(false);
        }
    };

    // Check if welcome message has been read
    useEffect(() => {
        const readStatus = localStorage.getItem('welcomeMessageRead') === 'true';
        setHasReadWelcome(readStatus);
    }, []);

    // Fetch courses for channel naming
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const response = await Api.getCourses();
                if (response && response.data && Array.isArray(response.data)) {
                    setCourses(response.data);
                }
            } catch (error) {
                console.error('Failed to fetch courses:', error);
            }
        };
        
        if (isAuthenticated) {
            fetchCourses();
        }
    }, [isAuthenticated]);

    // Check subscription status from localStorage (fallback)
    const checkSubscriptionLocal = useCallback(() => {
        const hasActiveSubscription = localStorage.getItem('hasActiveSubscription') === 'true';
        const subscriptionExpiry = localStorage.getItem('subscriptionExpiry');
        
        if (hasActiveSubscription && subscriptionExpiry) {
            const expiryDate = new Date(subscriptionExpiry);
            if (expiryDate > new Date()) {
                return true; // Active subscription
            } else {
                // Subscription expired
                localStorage.removeItem('hasActiveSubscription');
                localStorage.removeItem('subscriptionExpiry');
                return false;
            }
        }
        return false;
    }, []);

    // Check subscription status from database
    const checkSubscriptionFromDB = useCallback(async () => {
        if (!userId) return false;
        
        try {
            const result = await Api.checkSubscription(userId);
            if (result.success) {
                setSubscriptionStatus(result);
                setPaymentFailed(result.paymentFailed || false);
                
                // Update localStorage to match database
                if (result.hasActiveSubscription && !result.paymentFailed) {
                    localStorage.setItem('hasActiveSubscription', 'true');
                    if (result.expiry) {
                        localStorage.setItem('subscriptionExpiry', result.expiry);
                    }
                } else {
                    localStorage.removeItem('hasActiveSubscription');
                    localStorage.removeItem('subscriptionExpiry');
                }
                
                return result.hasActiveSubscription && !result.paymentFailed;
            }
            return false;
        } catch (error) {
            console.error('Error checking subscription from database:', error);
            // Fallback to localStorage check
            return checkSubscriptionLocal();
        }
    }, [userId, checkSubscriptionLocal]);
    
    // Combined subscription check
    const checkSubscription = () => {
        // Use database status if available, otherwise fallback to localStorage
        if (subscriptionStatus) {
            return subscriptionStatus.hasActiveSubscription && !subscriptionStatus.paymentFailed;
        }
        return checkSubscriptionLocal();
    };
    
    // Periodically check subscription status from database
    useEffect(() => {
        if (!userId || !isAuthenticated) return;
        
        // Check immediately
        checkSubscriptionFromDB();
        
        // Check every 30 seconds
        const interval = setInterval(() => {
            checkSubscriptionFromDB();
        }, 30000);
        
        return () => clearInterval(interval);
    }, [userId, isAuthenticated, checkSubscriptionFromDB]);

    // Check subscription before allowing access to community
    useEffect(() => {
        if (!isAuthenticated) return;
        
        const storedUserData = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdminCheck = storedUserData.role === 'ADMIN' || storedUserData.role === 'admin' || storedUserData.role === 'super_admin';
        
        // Admins bypass subscription requirement
        if (isAdminCheck) {
            return;
        }
        
        // Don't redirect - allow user to see community page with subscribe button
        // Subscription check is done in the render to show subscribe banner
    }, [isAuthenticated, navigate]);

    // Initialize component
    useEffect(() => {        
        const storedToken = localStorage.getItem('token');
        const storedUserData = JSON.parse(localStorage.getItem('user') || '{}');
        
        const tokenIsValid = storedToken && storedToken.split('.').length === 3;
        setIsAuthenticated(tokenIsValid);
        
        if (!tokenIsValid) {
            navigate('/login');
            return;
        }
        
        // Don't redirect - allow user to see community page with subscribe button
        // Subscription check is done in the render to show subscribe banner

        if (tokenIsValid) {
            // Ensure user has a displayable name
            // Priority: username > name > email prefix > 'User'
            let displayName = storedUserData.username || storedUserData.name;
            if (!displayName && storedUserData.email) {
                // Extract username from email (everything before @)
                displayName = storedUserData.email.split('@')[0];
            }
            if (!displayName) {
                displayName = 'User';
            }
            
            // Initialize XP and level if not present
            const currentXP = storedUserData.xp || 0;
            const calculatedLevel = getLevelFromXP(currentXP);
            
            // Create enhanced user object with guaranteed username and XP
            const enhancedUser = {
                ...storedUserData,
                username: displayName,
                xp: currentXP,
                level: calculatedLevel,
                totalMessages: storedUserData.totalMessages || 0
            };
            
            // Save back to localStorage if we added new fields
            if (!storedUserData.xp || !storedUserData.level) {
                localStorage.setItem('user', JSON.stringify(enhancedUser));
            }
            
            setStoredUser(enhancedUser);
            setUserId(storedUserData.id);
            
            // Check if user is admin or super admin
            const userEmail = storedUserData.email?.toLowerCase() || '';
            const userRole = storedUserData.role?.toLowerCase() || 'free';
            
            const userIsSuperAdmin = userEmail === SUPER_ADMIN_EMAIL.toLowerCase() || 
                                    userRole === 'super_admin';
            const userIsAdmin = userRole === 'admin' || userIsSuperAdmin;
            
            setIsSuperAdminUser(userIsSuperAdmin);
            setIsAdminUser(userIsAdmin);
            
            // Set user level
            setUserLevel(calculatedLevel);
        }
    }, [navigate]);

    // Check API connectivity - defined before useEffects that use it
    const checkApiConnectivity = useCallback(async () => {
        try {
            const apiBaseUrl = window.location.origin;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout (reduced from 5)
            
            // Try GET directly (HEAD can cause issues with some servers)
            try {
                const response = await fetch(`${apiBaseUrl}/api/community/channels`, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    mode: 'cors',
                    credentials: 'include'
                });
                
                clearTimeout(timeoutId);
                return response.ok || response.status < 500;
            } catch (fetchError) {
                clearTimeout(timeoutId);
                // Network error (timeout, abort, etc.) = likely connectivity issue
                if (fetchError.name === 'AbortError' || fetchError.name === 'NetworkError' || !navigator.onLine) {
                    return false;
                }
                return false;
            }
        } catch (error) {
            // Network error (timeout, abort, etc.) = likely WiFi issue
            if (error.name === 'AbortError' || error.name === 'NetworkError' || !navigator.onLine) {
                return false;
            }
            // Server error (500, etc.) = server issue
            return false;
        }
    }, []);

    // Load channels initially and on dependency changes
    useEffect(() => {
        refreshChannelList();
    }, [refreshChannelList]);

    // Periodically refresh channels so new ones appear for everyone
    useEffect(() => {
        if (!isAuthenticated) return;

        const intervalId = setInterval(() => {
            // Only refresh if API is working to avoid spam
            checkApiConnectivity().then((apiWorking) => {
                if (apiWorking) {
                    refreshChannelList().catch((err) => {
                        console.warn('Failed to refresh channel list:', err.message);
                    });
                }
            });
        }, 30000);

        return () => clearInterval(intervalId);
    }, [isAuthenticated, refreshChannelList, checkApiConnectivity]);

    // Fetch online users status periodically
    const fetchOnlineStatus = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            const apiBaseUrl = window.location.origin;
            const response = await fetch(`${apiBaseUrl}/api/admin/user-status`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const total = data.totalUsers || 0;
                
                setOnlineCount((data.onlineUsers || []).length);
                setTotalUsers(total);
            }
        } catch (error) {
            console.error('Failed to fetch online status:', error);
        }
    }, [isAuthenticated]);

    // Update user presence (heartbeat) - runs periodically
    useEffect(() => {
        if (!isAuthenticated || !userId) return;

        // Update presence immediately
        const updatePresence = async () => {
            try {
                const apiBaseUrl = window.location.origin;
                await fetch(`${apiBaseUrl}/api/community/update-presence`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ userId })
                });
            } catch (error) {
                console.error('Failed to update presence:', error);
            }
        };

        // Update immediately
        updatePresence();

        // Update every 30 seconds (heartbeat)
        const presenceInterval = setInterval(updatePresence, 30000);

        return () => clearInterval(presenceInterval);
    }, [isAuthenticated, userId]);

    // Determine connection status based on API and WebSocket
    useEffect(() => {
        if (!isAuthenticated) {
            setConnectionStatus('connecting');
            return;
        }

        // Check connectivity
        const updateConnectionStatus = async () => {
            // If WebSocket is connected, prioritize that - show connected even if API has minor issues
            if (isConnected) {
                setConnectionStatus('connected');
                return;
            }
            
            const apiWorking = await checkApiConnectivity();
            
            // If browser is offline, it's a WiFi issue
            if (!navigator.onLine) {
                setConnectionStatus('wifi-issue');
            } 
            // If API not working but browser is online and WebSocket also not connected, it's a server issue
            else if (!apiWorking && navigator.onLine && !isConnected) {
                setConnectionStatus('server-issue');
            } 
            // If API works but WebSocket not connected yet, still connecting
            else if (apiWorking && !isConnected) {
                setConnectionStatus('connecting');
            } 
            // Default to connecting
            else {
                setConnectionStatus('connecting');
            }
        };

        // Update immediately
        updateConnectionStatus();
        
        // Update status every 3 seconds for real-time updates
        // OPTIMIZATION: Check connection status less frequently (5 seconds instead of 3)
        const statusCheckInterval = setInterval(updateConnectionStatus, 5000);
        
        return () => clearInterval(statusCheckInterval);
    }, [isAuthenticated, isConnected, connectionError, checkApiConnectivity]);

    // Fetch online status periodically
    useEffect(() => {
        if (!isAuthenticated) return;

        // Fetch immediately
        fetchOnlineStatus();

        // Then fetch every 10 seconds for live updates
        // OPTIMIZATION: Check online status less frequently (15 seconds instead of 10)
        const statusInterval = setInterval(fetchOnlineStatus, 15000);

        return () => clearInterval(statusInterval);
    }, [isAuthenticated, fetchOnlineStatus]);

    // Load messages when channel changes
    useEffect(() => {
        if (selectedChannel) {
            // Navigate immediately (non-blocking)
            navigate(`/community/${selectedChannel.id}`);
            // Fetch messages (will show cached first, then update)
            fetchMessages(selectedChannel.id);
        }
    }, [selectedChannel, fetchMessages, navigate]);

    // Poll for new messages when WebSocket is not connected (fallback)
    useEffect(() => {
        if (!selectedChannel || !isAuthenticated) return;
        
        // Only poll if WebSocket is not connected
        if (isConnected) {
            return; // WebSocket is working, no need to poll
        }

        // Poll every 5 seconds for new messages when WebSocket is down (reduced frequency to avoid spam)
        const pollInterval = setInterval(() => {
            if (selectedChannel?.id && !isConnected) {
                fetchMessages(selectedChannel.id).catch((err) => {
                    // Silently handle errors to avoid console spam
                    console.debug('Polling fetch error:', err.message);
                });
            }
        }, 5000); // Increased from 3 to 5 seconds

        return () => clearInterval(pollInterval);
    }, [selectedChannel?.id, isAuthenticated, isConnected, fetchMessages]);
    
    // Add welcome message when welcome channel is selected for first time
    useEffect(() => {
        if (selectedChannel && selectedChannel.name === 'welcome' && !hasReadWelcome) {
            // Check if welcome message already exists
            const hasWelcomeMessage = messages.some(msg => msg.id === 'welcome-message');
            
            if (!hasWelcomeMessage) {
                const welcomeMessage = {
                    id: 'welcome-message',
                    channelId: selectedChannel.id,
                    content: `🎉 **WELCOME TO THE GLITCH COMMUNITY!** 🎉

Welcome to the most elite trading and wealth-building community on the planet! We're thrilled to have you join us on this incredible journey toward financial freedom and generational wealth.

## 📋 **COMMUNITY RULES**

**1. Respect & Professionalism**
   • Treat all members with respect and professionalism
   • No harassment, discrimination, or personal attacks
   • Maintain a positive and constructive environment

**2. Trading & Investment Discussions**
   • Share knowledge and insights, not financial advice
   • All trades are at your own risk - we are not financial advisors
   • Use proper risk management and never trade more than you can afford to lose

**3. Content & Privacy**
   • Keep conversations relevant to trading, wealth-building, and course topics
   • Do not share personal financial information (account numbers, passwords, etc.)
   • Respect intellectual property - do not share copyrighted course materials

**4. Spam & Promotion**
   • No spam, self-promotion, or affiliate links without permission
   • Do not promote other trading services or products
   • Keep discussions focused on learning and community growth

**5. Course Access**
   • Course-specific channels are for enrolled members only
   • Share insights and ask questions related to your enrolled courses
   • Complete courses in order for maximum learning effectiveness

**6. Community Support**
   • Help fellow members when you can
   • Ask questions - we're all here to learn and grow together
   • Report any issues or concerns to staff members

**7. Platform Usage**
   • Use appropriate language and avoid profanity
   • Keep messages clear and concise
   • Use channels for their intended purposes

## 🚀 **GETTING STARTED**

1. **Complete your profile** - Add your avatar and bio
2. **Explore channels** - Check out different course and trading channels
3. **Join discussions** - Start participating in conversations
4. **Enroll in courses** - Begin your wealth-building journey
5. **Earn XP** - Level up by being active in the community

## 💎 **PREMIUM BENEFITS**

Premium members get access to:
• Exclusive VIP channels and content
• Premium trading signals and insights
• Advanced course materials
• Priority support from our team
• Elite trader discussions

## ⚡ **QUICK TIPS**

• Earn XP by sending messages, sharing files, and being active
• Level up to unlock new channels and features
• Check the announcements channel regularly for updates
• Connect with other traders in the general chat channels

Remember: **Success in trading comes from discipline, education, and consistent action.** We're here to support you every step of the way!

Click the ✅ below to acknowledge you've read and agree to follow these rules, and unlock access to all channels.

Let's build generational wealth together! 💰🚀`,
                    sender: {
                        id: 'system',
                        username: 'THE GLITCH',
                        avatar: '/avatars/avatar_ai.png',
                        role: 'admin'
                    },
                    timestamp: new Date().toISOString(),
                    file: null,
                    isWelcomeMessage: true
                };
                
                setMessages([welcomeMessage]);
            }
        }
    }, [selectedChannel, hasReadWelcome, messages]);

    // Handle send message
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedFile) || !selectedChannel) return;

        // Check if user can send messages in this channel
        if (!canUserPostInChannel(selectedChannel)) {
            alert("You don't have permission to send messages in this channel.");
            return;
        }

        const messageContent = newMessage.trim();
        const senderUsername = storedUser?.username || storedUser?.name || 'User';

        const messageToSend = {
            channelId: selectedChannel.id,
            content: messageContent,
            userId,
            username: senderUsername,
            file: selectedFile ? {
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size,
                preview: filePreview
            } : null
        };

        // Optimistic update - add message to UI immediately
        const optimisticMessage = {
            id: `temp_${Date.now()}`,
            channelId: selectedChannel.id,
            content: messageContent,
            sender: {
                id: userId,
                username: storedUser?.username || storedUser?.name || 'User',
                avatar: storedUser?.avatar || '/avatars/avatar_ai.png',
                role: getCurrentUserRole()
            },
            timestamp: new Date().toISOString(),
            file: selectedFile ? {
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size,
                preview: filePreview
            } : null,
            userId,
            username: senderUsername
        };
        
        // Add message to state immediately for instant UI feedback
        const updatedMessages = [...messages, optimisticMessage];
        persistMessagesList(selectedChannel.id, updatedMessages);
        
        // Clear inputs immediately
        setNewMessage('');
        removeSelectedFile();

        try {
            // Save to backend API for permanent persistence
            try {
                const response = await Api.sendMessage(selectedChannel.id, messageToSend);
                
                if (response && response.data) {
                    // Replace optimistic message with server response (has real ID)
                    const serverMessage = response.data;
                    const finalMessages = replaceMessageById(updatedMessages, optimisticMessage.id, serverMessage);
                    persistMessagesList(selectedChannel.id, finalMessages);
                    
                    // Broadcast message via WebSocket so all users see it in real-time
                    if (sendWebSocketMessage && isConnected) {
                        sendWebSocketMessage(serverMessage);
                    }
                } else {
                    // If response doesn't have expected format, keep optimistic message
                    // Convert temp ID to permanent ID
                    const permanentMessage = {
                        ...optimisticMessage,
                        id: Date.now()
                    };
                    const finalMessages = replaceMessageById(updatedMessages, optimisticMessage.id, permanentMessage);
                    persistMessagesList(selectedChannel.id, finalMessages);
                    
                    // Still try to broadcast via WebSocket
                    if (sendWebSocketMessage && isConnected) {
                        sendWebSocketMessage(permanentMessage);
                    }
                }
            } catch (apiError) {
                console.error('Backend API unavailable, saving to localStorage:', apiError);
                // Backend unavailable - save to localStorage for persistence
                // Convert temp ID to permanent ID
                const permanentMessage = {
                    ...optimisticMessage,
                    id: Date.now()
                };
                const finalMessages = replaceMessageById(updatedMessages, optimisticMessage.id, permanentMessage);
                persistMessagesList(selectedChannel.id, finalMessages);
                
                // Still try to broadcast via WebSocket if available
                if (sendWebSocketMessage && isConnected) {
                    sendWebSocketMessage(permanentMessage);
                }
            }
            
            // ***** AWARD XP FOR SENDING MESSAGE *****
            const earnedXP = calculateMessageXP(messageContent, !!selectedFile);
            const xpResult = awardXP(earnedXP);
            if (xpResult?.leveledUp) {
                // Placeholder: trigger level-up UI feedback if desired
            }
        } catch (error) {
            console.error('Error sending message:', error);
            // On error, remove optimistic message and show error
            persistMessagesList(selectedChannel.id, messages);
            alert('Failed to send message. Please try again.');
        }
    };

    // Format timestamp with timezone awareness
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'Unknown time';
        
        try {
            const date = new Date(timestamp);
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 'Invalid date';
            }
            
            const now = new Date();
            const diffInMs = now - date;
            const diffInMinutes = Math.floor(diffInMs / 60000);
            const diffInHours = Math.floor(diffInMinutes / 60);
            const diffInDays = Math.floor(diffInHours / 24);
            
            // Relative time for recent messages
            if (diffInMinutes < 1) return 'Just now';
            if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
            if (diffInHours < 24) return `${diffInHours}h ago`;
            if (diffInDays < 7) return `${diffInDays}d ago`;
            
            // For older messages, show date and time in user's local timezone
            const isToday = date.toDateString() === now.toDateString();
            const isYesterday = date.toDateString() === new Date(now.getTime() - 86400000).toDateString();
            
            if (isToday) {
                // Show time only for today
                return date.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                });
            } else if (isYesterday) {
                // Show "Yesterday" with time
                return `Yesterday at ${date.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                })}`;
            } else if (diffInDays < 365) {
                // Show date and time for this year
                return date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            } else {
                // Show full date for older messages
                return date.toLocaleDateString('en-US', { 
                    year: 'numeric',
                    month: 'short', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            }
        } catch (error) {
            console.error('Error formatting timestamp:', error, timestamp);
            return 'Invalid date';
        }
    };

    // Handle welcome message acknowledgment
    const handleWelcomeAcknowledgment = () => {
        localStorage.setItem('welcomeMessageRead', 'true');
        setHasReadWelcome(true);
    };

    const handleDeleteMessage = (messageId) => {
        if (!isAdminUser) {
            console.warn('Only admins can delete messages');
            return;
        }

        if (!selectedChannel) {
            return;
        }

        // Find the message to show in confirmation
        const messageToDelete = messages.find(msg => msg.id === messageId);
        if (!messageToDelete) {
            console.warn('Message not found:', messageId);
            return;
        }

        // Show custom delete confirmation modal
        setDeleteMessageModal({
            messageId,
            messageContent: messageToDelete.content,
            author: messageToDelete.sender?.username || 'Unknown'
        });
    };

    const confirmDeleteMessage = async () => {
        if (!deleteMessageModal || !selectedChannel) {
            return;
        }

        setIsDeletingMessage(true);
        const { messageId } = deleteMessageModal;

        try {
            // Check if this is a temporary message (optimistic update that hasn't been saved to DB yet)
            const isTemporaryMessage = typeof messageId === 'string' && messageId.startsWith('temp_');
            
            if (isTemporaryMessage) {
                // Temporary messages don't exist in the database, just remove from local state
                console.log('Deleting temporary message (not in database):', messageId);
            } else {
                // Real message - delete from database via API
                try {
                    await Api.deleteMessage(selectedChannel.id, messageId);
                } catch (apiError) {
                    // If API delete fails but message exists locally, still remove it locally
                    console.warn('API delete failed, removing from local state only:', apiError.message);
                }
            }
            
            // Remove message from state (works for both temp and real messages)
            const updatedMessages = messages.filter(msg => msg.id !== messageId);
            setMessages(updatedMessages);
            persistMessagesList(selectedChannel.id, updatedMessages);
            
            // Also remove from localStorage
            const storageKey = `community_messages_${selectedChannel.id}`;
            const storedMessages = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const filteredStored = storedMessages.filter(msg => msg.id !== messageId);
            localStorage.setItem(storageKey, JSON.stringify(filteredStored));
            
            // Close modal
            setDeleteMessageModal(null);
        } catch (error) {
            console.error('Failed to delete message:', error);
            // Only show error if it's not a temporary message
            if (!(typeof messageId === 'string' && messageId.startsWith('temp_'))) {
                alert('Failed to delete message: ' + (error.response?.data?.message || error.message));
            }
        } finally {
            setIsDeletingMessage(false);
        }
    };

    const cancelDeleteMessage = () => {
        setDeleteMessageModal(null);
    };

    // Group channels by category
    const groupedChannels = channelList.reduce((acc, channel) => {
        const category = channel.category || 'general';
        const channelName = (channel.name || '').toLowerCase();
        const isAdminChannel = channel.accessLevel === 'admin-only' || channel.locked || channelName === 'admin';
        
        // Admin channel: Only admins can see it
        if (isAdminChannel && !isAdminUser && !isSuperAdminUser) {
            return acc; // Skip admin channel for non-admins
        }
        
        // Everyone can see welcome and announcements (they're read-only for non-admins)
        // Everyone can see all other channels (courses, trading, etc.)
        // No filtering needed for subscribed users - they see everything except admin channel
        
        // Only filter admin channel for non-admins
        if (isAdminChannel && !isAdminUser && !isSuperAdminUser) {
            return acc;
        }
        
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(channel);
        return acc;
    }, {});

    // Check subscription status for banner and channel visibility
    const hasActiveSubscription = checkSubscription();
    const storedUserDataForBanner = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdminForBanner = storedUserDataForBanner.role === 'ADMIN' || storedUserDataForBanner.role === 'admin' || storedUserDataForBanner.role === 'super_admin';
    const showSubscribeBanner = !isAdminForBanner && !hasActiveSubscription;
    const showPaymentFailedBanner = !isAdminForBanner && paymentFailed;

    // Handle subscribe button click - redirect to Stripe payment link
    const handleSubscribe = () => {
        // Redirect to Stripe payment link
        window.location.href = 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
    };

    // Render
    return (
        <div className="community-container" style={{ position: 'relative' }}>
            <BinaryBackground />
            
            {/* PAYMENT FAILED BANNER - Show if payment failed */}
            {showPaymentFailedBanner && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    color: 'white',
                    padding: '16px 24px',
                    zIndex: 1001,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    borderBottom: '2px solid #DC2626'
                }}>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                            ⚠️ Payment Failed - Access Restricted
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
                            {subscriptionStatus?.message || 'Your payment has failed. Please update your payment method to continue using the community.'}
                        </p>
                    </div>
                    <button
                        onClick={handleSubscribe}
                        style={{
                            background: 'white',
                            color: '#EF4444',
                            border: 'none',
                            padding: '12px 32px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                            marginRight: '12px'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.05)';
                            e.target.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                            e.target.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                        }}
                    >
                        UPDATE PAYMENT
                    </button>
                    <button
                        onClick={() => navigate('/subscription')}
                        style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                        }}
                    >
                        CONTACT SUPPORT
                    </button>
                </div>
            )}
            
            {/* SUBSCRIBE BANNER - Show if no active subscription */}
            {showSubscribeBanner && !showPaymentFailedBanner && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    color: 'white',
                    padding: '16px 24px',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    borderBottom: '2px solid #6D28D9'
                }}>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                            Subscribe to Access Full Community
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
                            Get 3 months free, then just £99/month
                        </p>
                    </div>
                    <button
                        onClick={handleSubscribe}
                        style={{
                            background: 'white',
                            color: '#8B5CF6',
                            border: 'none',
                            padding: '12px 32px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.05)';
                            e.target.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                            e.target.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                        }}
                    >
                        SUBSCRIBE NOW
                    </button>
                </div>
            )}
            
            {/* BLUR OVERLAY - Blur content when no subscription or payment failed */}
            {(showSubscribeBanner || showPaymentFailedBanner) && (
                <>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 999,
                        pointerEvents: 'none'
                    }} />
                    
                    {/* SUBSCRIPTION MODAL OVERLAY */}
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1001,
                        background: 'rgba(0, 0, 0, 0.7)'
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #1E1F22 0%, #2B2D31 100%)',
                            borderRadius: '16px',
                            padding: '40px',
                            maxWidth: '500px',
                            width: '90%',
                            textAlign: 'center',
                            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                            border: '2px solid #8B5CF6'
                        }}>
                            <div style={{
                                fontSize: '48px',
                                marginBottom: '20px'
                            }}>
                                🔒
                            </div>
                            <h2 style={{
                                color: 'white',
                                fontSize: '28px',
                                fontWeight: 'bold',
                                marginBottom: '16px',
                                marginTop: 0
                            }}>
                                Subscribe to Access Community
                            </h2>
                            <p style={{
                                color: '#B5BAC1',
                                fontSize: '16px',
                                lineHeight: '1.6',
                                marginBottom: '32px'
                            }}>
                                To access the community, you need to subscribe. <strong style={{ color: '#A78BFA' }}>Click here</strong> to subscribe and get 3 months free, then just £99/month.
                            </p>
                            <button
                                onClick={handleSubscribe}
                                style={{
                                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                                    color: 'white',
                                    border: 'none',
                                    padding: '16px 48px',
                                    borderRadius: '10px',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
                                    width: '100%',
                                    maxWidth: '300px'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.transform = 'scale(1.05)';
                                    e.target.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.transform = 'scale(1)';
                                    e.target.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
                                }}
                            >
                                Subscribe Now
                            </button>
                        </div>
                    </div>
                </>
            )}
            
            {/* LEFT SIDEBAR - CHANNELS */}
            <div className="community-sidebar" style={{
                filter: (showSubscribeBanner || showPaymentFailedBanner) ? 'blur(8px)' : 'none',
                pointerEvents: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto',
                userSelect: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto'
            }}>
                <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h2 style={{ margin: 0 }}>Channels</h2>
                    {(isAdminUser || isSuperAdminUser) && (
                        <button
                            type="button"
                            onClick={() => {
                                setChannelActionStatus(null);
                                setShowChannelManager(true);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(139, 92, 246, 0.15)',
                                border: '1px solid rgba(139, 92, 246, 0.4)',
                                color: '#A78BFA',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.25)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                            }}
                        >
                            <FaPlus size={10} /> Manage
                        </button>
                    )}
                </div>
                
                <div className="channels-section">
                    {categoryOrder.map(categoryName => {
                        const channels = groupedChannels[categoryName];
                        if (!channels || channels.length === 0) return null;
                        
                        return (
                            <div key={categoryName} className="channel-category">
                                <div className="category-header">
                                    <span className="category-icon">{getCategoryIcon(categoryName)}</span>
                                    <h3 className="category-title">{categoryName}</h3>
                                    <span className="category-count">{channels.length}</span>
                                </div>
                                
                                <ul className="channels-list">
                                    {channels.map(channel => {
                                        const canAccess = canUserAccessChannel(channel);
                                        const isActive = selectedChannel?.id === channel.id;
                                        
                                        return (
                                            <li 
                                                key={channel.id}
                                                className={`channel-item ${isActive ? 'active' : ''} ${channel.unread ? 'unread' : ''}`}
                                                onClick={() => canAccess && setSelectedChannel(channel)}
                                                style={{ 
                                                    cursor: canAccess ? 'pointer' : 'not-allowed', 
                                                    opacity: canAccess ? 1 : 0.5,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '8px'
                                                }}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                    <span className="channel-icon">
                                                        {getChannelIcon(channel)}
                                                    </span>
                                                    <span className="channel-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {channel.displayName || channel.name}
                                                    </span>
                                                </span>
                                                {(isAdminUser || isSuperAdminUser) && !protectedChannelIds.includes(channel.id) && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Delete channel ${channel.displayName || channel.name}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteChannel(channel);
                                                        }}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: '#f87171',
                                                            opacity: 0.7,
                                                            cursor: 'pointer',
                                                            padding: '4px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                                                    >
                                                        <FaTrash size={12} />
                                                    </button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </div>
                
                {/* User Profile at Bottom */}
                <div className="sidebar-footer" style={{
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--purple-primary), var(--purple-dark))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                            fontWeight: 700,
                            color: 'white',
                            flexShrink: 0
                        }}>
                            {(storedUser?.username || storedUser?.name || 'U').substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ 
                                fontWeight: 600, 
                                fontSize: '0.9rem',
                                color: 'white',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {storedUser?.username || storedUser?.name || 'User'}
                            </div>
                            <div style={{ 
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                gap: '6px'
                            }}>
                                <span>Level {userLevel}</span>
                                <span>•</span>
                                <span>{storedUser?.xp || 0} XP</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* MAIN CHAT AREA */}
            <div className="chat-main" style={{
                filter: (showSubscribeBanner || showPaymentFailedBanner) ? 'blur(8px)' : 'none',
                pointerEvents: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto',
                userSelect: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto'
            }}>
                {selectedChannel ? (
                    <>
                        {/* Chat Header */}
                        <div className="chat-header">
                            <h2>
                                {selectedChannel.name}
                                <span className="channel-access-badge">
                                    FREE FOR ALL USERS
                                </span>
                            </h2>
                        </div>
                        
                        {/* Messages */}
                        <div className="chat-messages">
                            {messages.length === 0 ? (
                                <div className="empty-state">
                                    <h3>Welcome to #{selectedChannel.displayName || selectedChannel.name}</h3>
                                    <p>{selectedChannel.description || 'No messages yet. Be the first to start the conversation!'}</p>
                                </div>
                            ) : (
                                messages.map((message, index) => (
                                    <div 
                                        key={message.id || index} 
                                        className="message-item"
                                    >
                                        <div className="message-avatar-text">
                                            {(message.sender?.username || 'U').substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="message-content">
                                            <div className="message-header-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span className="message-author">
                                                        {message.sender?.username || 'Unknown'}
                                                    </span>
                                                    <span className="message-timestamp">
                                                        {formatTimestamp(message.timestamp)}
                                                    </span>
                                                </div>
                                                {(isAdminUser || isSuperAdminUser) && (
                                                    <button
                                                        onClick={() => handleDeleteMessage(message.id)}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: '#f87171',
                                                            cursor: 'pointer',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            opacity: 0.7,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            fontSize: '0.85rem',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.opacity = 1;
                                                            e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.opacity = 0.7;
                                                            e.currentTarget.style.background = 'transparent';
                                                        }}
                                                        title="Delete message"
                                                    >
                                                        <FaTrash size={12} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="message-text" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                                {message.isWelcomeMessage ? (
                                                    message.content.split('\n').map((line, idx) => {
                                                        const trimmedLine = line.trim();
                                                        // Format markdown-style headers
                                                        if (trimmedLine.startsWith('## ')) {
                                                            return <h3 key={idx} style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '16px', marginBottom: '10px', color: 'var(--primary)' }}>{trimmedLine.substring(3)}</h3>;
                                                        }
                                                        // Format bold text (lines that start and end with **)
                                                        if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**') && trimmedLine.length > 4) {
                                                            return <div key={idx} style={{ fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' }}>{trimmedLine.replace(/\*\*/g, '')}</div>;
                                                        }
                                                        // Empty lines
                                                        if (trimmedLine === '') {
                                                            return <br key={idx} />;
                                                        }
                                                        // Regular text lines
                                                        return <div key={idx} style={{ marginBottom: '4px' }}>{line.replace(/\*\*/g, '')}</div>;
                                                    })
                                                ) : (
                                                    message.content
                                                )}
                                            </div>
                                            {message.isWelcomeMessage && !hasReadWelcome && (
                                                <div style={{
                                                    marginTop: '20px',
                                                    padding: '16px',
                                                    background: 'rgba(99, 102, 241, 0.1)',
                                                    borderRadius: '8px',
                                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.3s ease'
                                                }}
                                                onClick={handleWelcomeAcknowledgment}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                                                >
                                                    <span style={{ fontSize: '1.5rem' }}>✅</span>
                                                    <span style={{ fontWeight: 600 }}>I've read and agree to the rules</span>
                                                </div>
                                            )}
                                            {message.file && message.file.preview && (
                                                <div className="message-attachment">
                                                    <img 
                                                        src={message.file.preview} 
                                                        alt={message.file.name}
                                                        style={{
                                                            maxWidth: '400px',
                                                            maxHeight: '300px',
                                                            borderRadius: '8px',
                                                            marginTop: '8px'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            {message.file && !message.file.preview && (
                                                <div className="message-file" style={{
                                                    marginTop: '8px',
                                                    padding: '12px',
                                                    background: 'var(--bg-elevated)',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}>
                                                    <FaPaperclip />
                                                    <span>{message.file.name}</span>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        ({(message.file.size / 1024).toFixed(2)} KB)
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        
                        {/* Chat Input */}
                        <div className="chat-input-container">
                            <div className="connection-status">
                                <span className={`status-dot ${
                                    connectionStatus === 'connected' ? 'connected' : 
                                    connectionStatus === 'server-issue' || connectionStatus === 'wifi-issue' ? 'error' : 
                                    'connecting'
                                }`}></span>
                                <span>
                                    {connectionStatus === 'connected' ? 'Connected' : 
                                     connectionStatus === 'server-issue' ? 'Connection Issues' :
                                     connectionStatus === 'wifi-issue' ? 'Cannot Connect' :
                                     'Connecting...'}
                                </span>
                            </div>
                            
                            {/* File Preview */}
                            {selectedFile && (
                                <div className="file-preview" style={{
                                    marginBottom: '12px',
                                    padding: '12px',
                                    background: 'var(--bg-elevated)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {filePreview && (
                                            <img 
                                                src={filePreview} 
                                                alt="preview"
                                                style={{
                                                    width: '50px',
                                                    height: '50px',
                                                    borderRadius: '4px',
                                                    objectFit: 'cover'
                                                }}
                                            />
                                        )}
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{selectedFile.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {(selectedFile.size / 1024).toFixed(2)} KB
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={removeSelectedFile}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            cursor: 'pointer',
                                            padding: '8px',
                                            fontSize: '1.2rem'
                                        }}
                                    >
                                        <FaTimes />
                                    </button>
                                </div>
                            )}
                            
                            <form className="chat-form" onSubmit={handleSendMessage}>
                                <div className="chat-input-wrapper">
                                    <textarea
                                        ref={messageInputRef}
                                        className="chat-input"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        placeholder={
                                            canUserPostInChannel(selectedChannel)
                                                ? `Message #${selectedChannel.name}`
                                                : selectedChannel.accessLevel === 'admin-only'
                                                    ? `🔒 Only admins can post in #${selectedChannel.name}`
                                                    : `You don't have permission to send messages in #${selectedChannel.name}`
                                        }
                                        disabled={!canUserPostInChannel(selectedChannel)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage(e);
                                            }
                                        }}
                                        rows="1"
                                        style={{ paddingRight: '120px' }}
                                    />
                                    
                                    <div className="chat-input-buttons">
                                        {/* File Upload Button */}
                                        <button
                                            type="button"
                                            className="chat-input-btn"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={!canUserPostInChannel(selectedChannel)}
                                        >
                                            <FaPaperclip />
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            style={{ display: 'none' }}
                                            onChange={handleFileSelect}
                                            accept="image/*,.pdf,.doc,.docx,.txt"
                                        />
                                        
                                        {/* Emoji Button */}
                                        <button
                                            type="button"
                                            className="chat-input-btn"
                                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                            disabled={!canUserPostInChannel(selectedChannel)}
                                        >
                                            <FaSmile />
                                        </button>
                                    </div>
                                </div>
                                
                                <button 
                                    type="submit" 
                                    className="send-btn"
                                    disabled={(!newMessage.trim() && !selectedFile) || !canUserPostInChannel(selectedChannel)}
                                >
                                    <FaPaperPlane style={{ marginRight: '8px' }} />
                                    Send
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="no-channel-selected">
                        <h2>Welcome to The Glitch Community</h2>
                        <p>Select a channel to start chatting</p>
                    </div>
                )}
            </div>
            
            {/* RIGHT SIDEBAR - ONLINE USERS */}
            <div className="online-sidebar" style={{
                filter: (showSubscribeBanner || showPaymentFailedBanner) ? 'blur(8px)' : 'none',
                pointerEvents: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto',
                userSelect: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto'
            }}>
                <div className="online-section">
                    <div className="online-header">
                        <h3>Online Users</h3>
                        <span className="online-count">
                            {onlineCount} / {totalUsers}
                        </span>
                    </div>
                    
                    <div className="user-stats">
                        <div className="stat-item">
                            <span className="stat-label">Online:</span>
                            <span className="stat-value">{onlineCount}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Total Users:</span>
                            <span className="stat-value">{totalUsers}</span>
                        </div>
                    </div>
                </div>
                
            </div>

            {/* Channel Manager Modal */}
            {(isAdminUser || isSuperAdminUser) && showChannelManager && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        padding: '20px'
                    }}
                    onClick={() => {
                        if (!channelActionLoading) {
                            setShowChannelManager(false);
                        }
                    }}
                >
                    <div
                        style={{
                            background: '#1f2024',
                            borderRadius: '16px',
                            padding: '24px',
                            width: '100%',
                            maxWidth: '520px',
                            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
                            border: '1px solid rgba(139, 92, 246, 0.2)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, color: '#fff' }}>Manage Channels</h3>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!channelActionLoading) {
                                        setShowChannelManager(false);
                                    }
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    fontSize: '1.2rem'
                                }}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        {channelActionStatus && (
                            <div
                                style={{
                                    marginBottom: '16px',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    background: channelActionStatus.type === 'success'
                                        ? 'rgba(34,197,94,0.1)'
                                        : 'rgba(248,113,113,0.1)',
                                    border: `1px solid ${channelActionStatus.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(248,113,113,0.4)'}`,
                                    color: channelActionStatus.type === 'success' ? '#34d399' : '#f87171'
                                }}
                            >
                                {channelActionStatus.message}
                            </div>
                        )}

                        <form onSubmit={handleCreateChannel} style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>
                                    Channel Name
                                </label>
                                <input
                                    type="text"
                                    value={newChannelName}
                                    onChange={(e) => setNewChannelName(e.target.value)}
                                    placeholder="e.g. Smart Money Concepts"
                                    required
                                    style={{
                                        background: '#111827',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        color: 'white'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1, display: 'grid', gap: '8px' }}>
                                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>
                                        Category
                                    </label>
                                    <select
                                        value={newChannelCategory}
                                        onChange={(e) => setNewChannelCategory(e.target.value)}
                                        style={{
                                            background: '#111827',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '8px',
                                            padding: '10px 12px',
                                            color: 'white'
                                        }}
                                    >
                                        <option value="trading">Trading</option>
                                        <option value="courses">Courses</option>
                                        <option value="general">General</option>
                                        <option value="support">Support</option>
                                        <option value="premium">Premium</option>
                                        <option value="staff">Staff</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1, display: 'grid', gap: '8px' }}>
                                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>
                                        Access
                                    </label>
                                    <select
                                        value={newChannelAccess}
                                        onChange={(e) => setNewChannelAccess(e.target.value)}
                                        style={{
                                            background: '#111827',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '8px',
                                            padding: '10px 12px',
                                            color: 'white'
                                        }}
                                    >
                                        <option value="open">Open</option>
                                        <option value="read-only">Read Only</option>
                                        <option value="admin-only">Admin Only</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>
                                    Description
                                </label>
                                <textarea
                                    value={newChannelDescription}
                                    onChange={(e) => setNewChannelDescription(e.target.value)}
                                    rows={3}
                                    placeholder="Describe the purpose of this channel..."
                                    style={{
                                        background: '#111827',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        color: 'white',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={channelActionLoading}
                                style={{
                                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    color: 'white',
                                    fontWeight: 600,
                                    cursor: channelActionLoading ? 'not-allowed' : 'pointer',
                                    opacity: channelActionLoading ? 0.6 : 1,
                                    transition: 'transform 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    if (!channelActionLoading) {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                {channelActionLoading ? 'Creating...' : 'Create Channel'}
                            </button>
                        </form>

                        <div style={{ marginBottom: '8px', color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Existing Channels
                        </div>

                        <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                            {channelList.filter(channel => !protectedChannelIds.includes(channel.id)).length === 0 ? (
                                <div style={{ padding: '16px', color: '#9ca3af', fontSize: '0.85rem' }}>
                                    No custom channels yet.
                                </div>
                            ) : (
                                channelList
                                    .filter(channel => !protectedChannelIds.includes(channel.id))
                                    .map(channel => (
                                        <div
                                            key={channel.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 16px',
                                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                                            }}
                                        >
                                            <div>
                                                <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>
                                                    {channel.displayName || channel.name}
                                                </div>
                                                <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                                                    {(channel.category || 'general')} · {(channel.accessLevel || 'open')}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteChannel(channel)}
                                                disabled={channelActionLoading}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid rgba(248,113,113,0.4)',
                                                    color: '#fca5a5',
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    cursor: channelActionLoading ? 'not-allowed' : 'pointer',
                                                    fontSize: '0.75rem'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Message Confirmation Modal */}
            {deleteMessageModal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.75)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                        backdropFilter: 'blur(4px)'
                    }}
                    onClick={cancelDeleteMessage}
                >
                    <div
                        style={{
                            background: '#1F2937',
                            borderRadius: '12px',
                            padding: '24px',
                            maxWidth: '500px',
                            width: '90%',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{
                                margin: 0,
                                marginBottom: '8px',
                                color: '#F9FAFB',
                                fontSize: '1.25rem',
                                fontWeight: 600
                            }}>
                                Delete Message
                            </h3>
                            <p style={{
                                margin: 0,
                                color: '#9CA3AF',
                                fontSize: '0.9rem'
                            }}>
                                Are you sure you want to delete this message? This action cannot be undone.
                            </p>
                        </div>

                        {/* Message Preview */}
                        <div style={{
                            background: '#111827',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '20px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{
                                fontSize: '0.75rem',
                                color: '#6B7280',
                                marginBottom: '4px'
                            }}>
                                {deleteMessageModal.author}
                            </div>
                            <div style={{
                                color: '#E5E7EB',
                                fontSize: '0.9rem',
                                wordBreak: 'break-word'
                            }}>
                                {deleteMessageModal.messageContent.length > 100
                                    ? deleteMessageModal.messageContent.substring(0, 100) + '...'
                                    : deleteMessageModal.messageContent
                                }
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                onClick={cancelDeleteMessage}
                                disabled={isDeletingMessage}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    padding: '10px 20px',
                                    color: '#E5E7EB',
                                    cursor: isDeletingMessage ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                    transition: 'all 0.2s ease',
                                    opacity: isDeletingMessage ? 0.5 : 1
                                }}
                                onMouseEnter={(e) => {
                                    if (!isDeletingMessage) {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteMessage}
                                disabled={isDeletingMessage}
                                style={{
                                    background: isDeletingMessage 
                                        ? 'rgba(239, 68, 68, 0.5)' 
                                        : 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '10px 20px',
                                    color: '#FFFFFF',
                                    cursor: isDeletingMessage ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    transition: 'all 0.2s ease',
                                    boxShadow: isDeletingMessage ? 'none' : '0 4px 6px -1px rgba(239, 68, 68, 0.3)'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isDeletingMessage) {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isDeletingMessage) {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
                                    }
                                }}
                            >
                                {isDeletingMessage ? 'Deleting...' : 'Delete Message'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Emoji Picker */}
            {showEmojiPicker && (
                <EmojiPicker
                    onEmojiSelect={handleEmojiSelect}
                    onClose={() => setShowEmojiPicker(false)}
                />
            )}
        </div>
    );
};

export default Community;
