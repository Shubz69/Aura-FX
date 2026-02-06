import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import '../styles/Community.css';
import { useWebSocket } from '../utils/useWebSocket';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Api from '../services/Api';
import CosmicBackground from '../components/CosmicBackground';
import { SUPER_ADMIN_EMAIL } from '../utils/roles';
import axios from 'axios';
import { triggerNotification } from '../components/NotificationSystem';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { useEntitlements } from '../context/EntitlementsContext';
import { useSubscription } from '../context/SubscriptionContext';
import {
    getLevelFromXP,
    getXPForNextLevel,
    calculateMessageXP,
    isOnCooldown,
    XP_REWARDS
} from '../utils/xpSystem';

// Icons
import { FaHashtag, FaLock, FaBullhorn, FaPaperPlane, FaSmile, FaTrash, FaPaperclip, FaTimes, FaPlus, FaReply, FaCopy, FaLink, FaBookmark, FaBell, FaFlag, FaImage, FaEdit, FaBars, FaChevronLeft } from 'react-icons/fa';
import ProfileModal from '../components/ProfileModal';

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

// GIF Picker component
const GifPicker = ({ onGifSelect, onClose }) => {
    const [gifs, setGifs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const searchTimeoutRef = useRef(null);
    
    // Giphy API key (using public demo key - in production, use your own)
    const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65'; // Giphy public demo key
    
    const fetchGifs = useCallback(async (query = '') => {
        setLoading(true);
        try {
            const endpoint = query 
                ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=25&rating=g`
                : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=25&rating=g`;
            
            const response = await fetch(endpoint);
            const data = await response.json();
            
            if (data.data) {
                setGifs(data.data);
            }
        } catch (error) {
            console.error('Error fetching GIFs:', error);
        } finally {
            setLoading(false);
        }
    }, []);
    
    useEffect(() => {
        // Load trending GIFs on mount
        fetchGifs();
    }, [fetchGifs]);
    
    const handleSearch = (value) => {
        setSearchQuery(value);
        
        // Clear existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        
        // Debounce search
        searchTimeoutRef.current = setTimeout(() => {
            if (value.trim()) {
                fetchGifs(value);
            } else {
                fetchGifs();
            }
        }, 500);
    };
    
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);
    
    return (
        <div className="gif-picker" onClick={(e) => e.stopPropagation()}>
            <div className="gif-picker-header">
                <span>GIFs</span>
                <button className="gif-picker-close" onClick={onClose}>×</button>
            </div>
            <div className="gif-picker-search">
                <input
                    type="text"
                    placeholder="Search GIFs..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="gif-search-input"
                />
            </div>
            <div className="gif-grid">
                {loading ? (
                    <div className="gif-loading">Loading GIFs...</div>
                ) : gifs.length === 0 ? (
                    <div className="gif-empty">No GIFs found</div>
                ) : (
                    gifs.map((gif) => (
                        <div
                            key={gif.id}
                            className="gif-item"
                            onClick={() => {
                                onGifSelect(gif.images.fixed_height.url || gif.images.original.url);
                            }}
                        >
                            <img
                                src={gif.images.fixed_height_small.url || gif.images.preview_gif.url}
                                alt={gif.title}
                                loading="lazy"
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// Get category icon
const getCategoryIcon = (category) => {
    switch(category) {
        case 'announcements': return '📢';
        case 'staff': return '👨‍💼';
        case 'trading': return '📈';
        case 'general': return '💬';
        case 'support': return '🆘';
        case 'premium': return '⭐';
        case 'a7fx': return '💎';
        default: return '#';
    }
};

// Format category name for display
const formatCategoryName = (category) => {
    switch(category) {
        case 'a7fx': return 'A7FX';
        case 'announcements': return 'ANNOUNCEMENTS';
        case 'staff': return 'STAFF';
        case 'trading': return 'TRADING';
        case 'general': return 'GENERAL';
        case 'support': return 'SUPPORT';
        case 'premium': return 'PREMIUM';
        default: return category.toUpperCase();
    }
};

// Get channel icon
const getChannelIcon = (channel) => {
    if (channel.accessLevel === 'admin-only') return <FaLock />;
    if (channel.category === 'announcements') return <FaBullhorn />;
    return <FaHashtag />;
};

/**
 * Generate a weighted random online count between 20-100
 * Biased toward mid-range (35-70) for realistic appearance:
 * - 15% chance: Low range (20-34)
 * - 70% chance: Mid range (35-70)
 * - 15% chance: High range (71-100)
 * 
 * Called fresh on every page refresh (no caching/storage)
 */
const generateWeightedOnlineCount = () => {
    const roll = Math.random();
    
    if (roll < 0.15) {
        // Low range: 20-34 (15% chance)
        return Math.floor(Math.random() * 15) + 20;
    } else if (roll < 0.85) {
        // Mid range: 35-70 (70% chance)
        return Math.floor(Math.random() * 36) + 35;
    } else {
        // High range: 71-100 (15% chance)
        return Math.floor(Math.random() * 30) + 71;
    }
};

// Main Community Component
const Community = () => {
    const [userLevel, setUserLevel] = useState(1);
    const [storedUser, setStoredUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profileModalData, setProfileModalData] = useState(null);
    
    // Function to fetch latest user data from API (including XP and level)
    const fetchLatestUserData = useCallback(async (userId) => {
        if (!userId) return null;
        
        try {
            const API_BASE_URL = window.location.origin;
            const token = localStorage.getItem('token');
            
            const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                
                // Update localStorage with latest data
                const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
                const updatedUser = {
                    ...currentUser,
                    ...userData,
                    xp: parseFloat(userData.xp || 0),
                    level: parseInt(userData.level || 1)
                };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                
                // Update state only if values actually changed
                setStoredUser(prev => {
                    if (!prev) return updatedUser;
                    
                    const xpChanged = Math.abs(parseFloat(prev.xp || 0) - parseFloat(userData.xp || 0)) > 0.01;
                    const levelChanged = parseInt(prev.level || 1) !== parseInt(userData.level || 1);
                    
                    if (xpChanged || levelChanged) {
                        return updatedUser;
                    }
                    return prev; // Return same reference if no change
                });
                
                const newLevel = parseInt(userData.level || 1);
                setUserLevel(prevLevel => {
                    return prevLevel !== newLevel ? newLevel : prevLevel;
                });
                
                return updatedUser;
            } else {
                console.warn('Failed to fetch latest user data:', response.status);
            }
        } catch (error) {
            console.error('Error fetching latest user data:', error);
        }
        
        return null;
    }, []);

    // Listen for XP update events to update profile card in real-time
    useEffect(() => {
        const handleXPUpdate = (event) => {
            const { newXP, newLevel } = event.detail;
            setStoredUser(prev => {
                if (prev) {
                    return {
                        ...prev,
                        xp: newXP,
                        level: newLevel
                    };
                }
                return prev;
            });
            setUserLevel(newLevel);
        };
        
        window.addEventListener('xpUpdated', handleXPUpdate);
        
        // Fetch latest user data from API periodically (every 5 seconds for live updates)
        let xpCheckInterval;
        if (userId) {
            // Initial fetch on mount
            fetchLatestUserData(userId);
            
            // Then check periodically
            xpCheckInterval = setInterval(() => {
                fetchLatestUserData(userId);
            }, 5000); // Check every 5 seconds for live updates
        } else {
            // Fallback to localStorage check if userId not available yet
            xpCheckInterval = setInterval(() => {
                const storedUserData = JSON.parse(localStorage.getItem('user') || '{}');
                if (storedUserData.xp !== undefined && storedUserData.level !== undefined) {
                    const currentXP = parseFloat(storedUserData.xp || 0);
                    const currentLevel = parseInt(storedUserData.level || 1);
                    
                    setStoredUser(prev => {
                        if (!prev) return prev;
                        
                        const xpChanged = Math.abs(parseFloat(prev.xp || 0) - currentXP) > 0.01;
                        const levelChanged = parseInt(prev.level || 1) !== currentLevel;
                        
                        if (xpChanged || levelChanged) {
                            return {
                                ...prev,
                                xp: currentXP,
                                level: currentLevel
                            };
                        }
                        return prev; // Return same reference if no change
                    });
                    
                    setUserLevel(prevLevel => {
                        const currentLevel = parseInt(storedUserData.level || 1);
                        return prevLevel !== currentLevel ? currentLevel : prevLevel;
                    });
                }
            }, 2000);
        }
        
        return () => {
            window.removeEventListener('xpUpdated', handleXPUpdate);
            if (xpCheckInterval) {
                clearInterval(xpCheckInterval);
            }
        };
    }, [userId, fetchLatestUserData]); // Include userId and fetchLatestUserData in dependencies
    const [collapsedCategories, setCollapsedCategories] = useState(() => {
        // Load collapsed state from localStorage
        const saved = localStorage.getItem('collapsedCategories');
        return saved ? JSON.parse(saved) : {};
    });
    const [draggedCategory, setDraggedCategory] = useState(null);
    const [draggedChannel, setDraggedChannel] = useState(null);
    const [dragOverChannel, setDragOverChannel] = useState(null); // Channel being dragged over
    const [dragPosition, setDragPosition] = useState(null); // 'above' or 'below' for drop position
    const [channelOrder, setChannelOrder] = useState({}); // { category: [channelIds] }
    const [messageReactions, setMessageReactions] = useState({}); // messageId -> { emoji: count }
    const [contextMenu, setContextMenu] = useState(null); // { x, y, messageId }
    const [channelContextMenu, setChannelContextMenu] = useState(null); // { x, y, channelId, channel }
    const [categoryContextMenu, setCategoryContextMenu] = useState(null); // { x, y, categoryName }
    const [editingChannel, setEditingChannel] = useState(null); // { id, name, description, category, accessLevel, permissionType }
    const [editingCategory, setEditingCategory] = useState(null); // { name }
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false); // Show subscription selection modal
    const [requiredSubscriptionType, setRequiredSubscriptionType] = useState(null); // 'premium' or 'a7fx' - for channel access
    const [showChannelAccessModal, setShowChannelAccessModal] = useState(false); // Show channel access modal
    const [lockedChannelInfo, setLockedChannelInfo] = useState(null); // Info about the locked channel
    // Initialize from localStorage so admin/super_admin access is correct on first render (no flicker)
    const [isAdminUser, setIsAdminUser] = useState(() => {
        try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            const r = (u.role || '').toLowerCase();
            const em = (u.email || '').toLowerCase();
            return r === 'admin' || r === 'super_admin' || em === SUPER_ADMIN_EMAIL.toLowerCase();
        } catch {
            return false;
        }
    });
    const [isSuperAdminUser, setIsSuperAdminUser] = useState(() => {
        try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            const r = (u.role || '').toLowerCase();
            const em = (u.email || '').toLowerCase();
            return r === 'super_admin' || em === SUPER_ADMIN_EMAIL.toLowerCase();
        } catch {
            return false;
        }
    });
    const [allUsers, setAllUsers] = useState([]); // All users for @mention autocomplete
    const [mentionAutocomplete, setMentionAutocomplete] = useState(null); // { show: true, query: 'sam', position: { x, y } }
    const [mentionQuery, setMentionQuery] = useState(''); // Current @mention query
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const navigate = useNavigate();
    const { id: channelIdParam } = useParams();
    const location = useLocation();
    const { user: authUser, persistUser } = useAuth(); // Get user from AuthContext
    const { entitlements, refresh: refreshEntitlements } = useEntitlements();
    const { hasCommunityAccess: hasCommunityAccessFromSubscription, refreshSubscription } = useSubscription();
    
    const [channelList, setChannelList] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingMessageContent, setEditingMessageContent] = useState('');
    const [onlineCount, setOnlineCount] = useState(() => {
        // Generate weighted random online count (20-100) on component mount
        // Biased toward mid-range (35-70) for realistic appearance
        // No storage - changes on every full page refresh
        return generateWeightedOnlineCount();
    });
    const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected', 'connecting', 'server-issue', 'wifi-issue'
    const messagesEndRef = useRef(null);
    const messageInputRef = useRef(null);
    
    // Channel badge tracking: { channelId: { unread: number, mentions: number } }
    const [channelBadges, setChannelBadges] = useState(() => {
        if (!userId) return {};
        const saved = localStorage.getItem(`channelBadges_${userId}`);
        return saved ? JSON.parse(saved) : {};
    });
    
    // Save channel badges to localStorage whenever they change
    useEffect(() => {
        if (userId && channelBadges) {
            localStorage.setItem(`channelBadges_${userId}`, JSON.stringify(channelBadges));
        }
    }, [channelBadges, userId]);
    
    // Helper to update channel badge
    const updateChannelBadge = useCallback((channelId, type, increment = true) => {
        if (!channelId) return;
        setChannelBadges(prev => {
            const current = prev[channelId] || { unread: 0, mentions: 0 };
            const updated = {
                ...prev,
                [channelId]: {
                    ...current,
                    [type]: increment ? (current[type] || 0) + 1 : 0
                }
            };
            return updated;
        });
    }, []);
    
    // Helper to clear channel badge when viewed
    const clearChannelBadge = useCallback((channelId) => {
        if (!channelId) return;
        setChannelBadges(prev => {
            const updated = { ...prev };
            if (updated[channelId]) {
                updated[channelId] = { unread: 0, mentions: 0 };
            }
            return updated;
        });
    }, []);
    
    // Discord-like features
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [selectedMessageForReaction, setSelectedMessageForReaction] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const fileInputRef = useRef(null);
    const channelListRef = useRef([]);
    const selectedChannelRef = useRef(null);
    const isSendingGifRef = useRef(false);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(null);
            setChannelContextMenu(null);
            setCategoryContextMenu(null);
        };
        
        if (contextMenu || channelContextMenu || categoryContextMenu) {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('contextmenu', handleClickOutside);
        }
        
        return () => {
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('contextmenu', handleClickOutside);
        };
    }, [contextMenu, channelContextMenu, categoryContextMenu]);

    useEffect(() => {
        channelListRef.current = channelList;
    }, [channelList]);

    useEffect(() => {
        selectedChannelRef.current = selectedChannel;
    }, [selectedChannel]);
    
    // Welcome message and channel visibility
    const [hasReadWelcome, setHasReadWelcome] = useState(false);
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);
    const [paymentFailed, setPaymentFailed] = useState(false);
    const [showChannelManager, setShowChannelManager] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [newChannelCategory, setNewChannelCategory] = useState('trading');
    const [newChannelDescription, setNewChannelDescription] = useState('');
    const [newChannelAccess, setNewChannelAccess] = useState('open');
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 1024);
    const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar state
    const [touchStartX, setTouchStartX] = useState(null); // For swipe gestures
    const [channelActionStatus, setChannelActionStatus] = useState(null);
    const [channelActionLoading, setChannelActionLoading] = useState(false);
    
    // Delete message modal state
    const [deleteMessageModal, setDeleteMessageModal] = useState(null); // { messageId, messageContent }
    const [isDeletingMessage, setIsDeletingMessage] = useState(false);
    
    // Category order - load from backend or use default
    // Try to load from localStorage first for instant display, then update from backend
    const [categoryOrderState, setCategoryOrderState] = useState(() => {
        // Try localStorage first for instant display
        const saved = localStorage.getItem('channelCategoryOrder');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            } catch (e) {
                // Invalid JSON, use default
            }
        }
        // Default order - will be replaced by backend data (courses removed)
        return ['announcements', 'staff', 'trading', 'general', 'support', 'premium', 'a7fx'];
    });
    
    const categoryOrder = categoryOrderState;

    // Load category order and channel order from backend (auth required)
    const apiBase = process.env.REACT_APP_API_URL || '';
    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const fetchCategoryOrder = async () => {
            try {
                const response = await fetch(`${apiBase}/api/community/channels?categoryOrder=true`, {
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && Array.isArray(data.data)) {
                        setCategoryOrderState(data.data);
                    }
                } else if (response.status === 401) {
                    return;
                }
            } catch (error) {
                console.error('Error fetching category order:', error);
                const saved = localStorage.getItem('channelCategoryOrder');
                if (saved) {
                    try {
                        setCategoryOrderState(JSON.parse(saved));
                    } catch (e) { /* use default */ }
                }
            }
        };

        const fetchChannelOrder = async () => {
            try {
                const response = await fetch(`${apiBase}/api/community/channels?channelOrder=true`, {
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.channelOrder) {
                        setChannelOrder(data.channelOrder);
                    }
                } else if (response.status === 401) {
                    return;
                }
            } catch (error) {
                console.error('Error fetching channel order:', error);
                const saved = localStorage.getItem('channelOrder');
                if (saved) {
                    try {
                        setChannelOrder(JSON.parse(saved));
                    } catch (e) { /* use default */ }
                }
            }
        };

        fetchCategoryOrder();
        fetchChannelOrder();

        // Poll for updates every 5 seconds to sync across users (optimized for production)
        const intervalId = setInterval(() => {
            fetchCategoryOrder();
            fetchChannelOrder();
        }, 5000);

        // Also check when window regains focus
        const handleFocus = () => {
            fetchCategoryOrder();
            fetchChannelOrder();
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [apiBase]);

    // Save category order to backend
    const saveCategoryOrder = async (newOrder) => {
        try {
            const response = await fetch(`${apiBase}/api/community/channels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ categoryOrder: newOrder })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    // Also save to localStorage as fallback
                    localStorage.setItem('channelCategoryOrder', JSON.stringify(newOrder));
                    return true;
                }
            }
        } catch (error) {
            console.error('Error saving category order:', error);
            // Fallback to localStorage
            localStorage.setItem('channelCategoryOrder', JSON.stringify(newOrder));
            return false;
        }
        return false;
    };
    
    // Save channel order to backend
    const saveChannelOrder = async (category, newOrder) => {
        const updatedOrder = { ...channelOrder, [category]: newOrder };
        try {
            const response = await fetch(`${apiBase}/api/community/channels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ channelOrder: updatedOrder })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setChannelOrder(updatedOrder);
                    // Also save to localStorage as fallback
                    localStorage.setItem('channelOrder', JSON.stringify(updatedOrder));
                    return true;
                }
            }
        } catch (error) {
            console.error('Error saving channel order:', error);
            // Fallback to localStorage
            setChannelOrder(updatedOrder);
            localStorage.setItem('channelOrder', JSON.stringify(updatedOrder));
            return false;
        }
        return false;
    };

    const protectedChannelIds = useMemo(() => (['welcome', 'announcements', 'levels', 'admin']), []);

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
                    const u = JSON.parse(localStorage.getItem('user') || '{}');
                    const r = (u.role || '').toString().toLowerCase();
                    const em = (u.email || '').toString().toLowerCase();
                    const adminOrSuper = r === 'admin' || r === 'super_admin' || em === SUPER_ADMIN_EMAIL.toLowerCase();
                    const preparedCached = cachedChannels.map((channel) => {
                        const baseId = channel.id ?? channel.name ?? `channel-${Date.now()}`;
                        const idString = String(baseId);
                        const normalizedName = channel.name || idString;
                        const displayNameValue = channel.displayName || normalizedName
                            .split('-')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ');
                        const accessLevelValue = (channel.accessLevel || channel.access_level || 'open').toLowerCase();
                        const canSee = adminOrSuper || channel.canSee === true;
                        return {
                            ...channel,
                            id: idString,
                            name: normalizedName,
                            displayName: displayNameValue,
                            category: channel.category || 'general',
                            description: channel.description || '',
                            accessLevel: accessLevelValue,
                            locked: adminOrSuper ? false : (channel.locked ?? accessLevelValue === 'admin-only'),
                            canSee,
                            canRead: adminOrSuper ? true : (canSee && (channel.canRead !== false)),
                            canWrite: adminOrSuper ? true : (canSee && (channel.canWrite !== false))
                        };
                    }).filter((ch) => ch.canSee === true);
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
            
            // Show ALL channels - no filtering (API returns all channels from database)
            // Admin can control access via access_level in database
            
            if (channelsFromServer.length > 0) {
                try {
                    localStorage.setItem(cachedChannelsKey, JSON.stringify(channelsFromServer));
                } catch (e) { /* ignore */ }
            }
        } catch (error) {
            console.warn('Failed to fetch channels from API:', error?.message || error);
            // Keep showing cached channels if API fails
            if (cachedChannels.length > 0) {
                return channelListRef.current;
            }
        }

        let preparedChannels = [];
        const storedUserForChannels = JSON.parse(localStorage.getItem('user') || '{}');
        const userRoleForChannels = (storedUserForChannels.role || '').toString().toLowerCase();
        const userEmailForChannels = (storedUserForChannels.email || '').toString().toLowerCase();
        const isAdminOrSuperForChannels = userRoleForChannels === 'admin' || userRoleForChannels === 'super_admin' || userEmailForChannels === SUPER_ADMIN_EMAIL.toLowerCase();

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
                const readOnly = (channel.permissionType || channel.permission_type || 'read-write').toString().toLowerCase() === 'read-only';

                const canSee = isAdminOrSuperForChannels || channel.canSee === true;
                const canRead = isAdminOrSuperForChannels ? true : (canSee && (channel.canRead !== false));
                const canWrite = isAdminOrSuperForChannels ? !readOnly : (canSee && (channel.canWrite !== false));
                const locked = isAdminOrSuperForChannels ? false : (channel.locked ?? accessLevelValue === 'admin-only');
                return {
                    ...channel,
                    id: idString,
                    name: normalizedName,
                    displayName: displayNameValue,
                    category: channel.category || 'general',
                    description: channel.description || '',
                    accessLevel: accessLevelValue,
                    locked,
                    canSee,
                    canRead,
                    canWrite
                };
            });
            preparedChannels = preparedChannels.filter((ch) => ch.canSee === true);
        } else if (channelListRef.current.length > 0) {
            preparedChannels = channelListRef.current;
        }

        if (preparedChannels.length === 0) {
            setChannelList([]);
            return [];
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
    }, [isAuthenticated, sortChannels, channelIdParam]);
    
    // Initialize WebSocket connection for real-time messaging
    const enableRealtime = useMemo(() => {
        if (process.env.REACT_APP_ENABLE_WEBSOCKETS === 'false') return false;
        if (process.env.REACT_APP_ENABLE_WEBSOCKETS === 'true') return true;
        return true;
    }, []);

    const { 
        isConnected, 
        connectionError,
        reconnectBanner,
        retry: retryWebSocket,
        sendMessage: sendWebSocketMessage
    } = useWebSocket(
        selectedChannel?.id,
        (message) => {
            // Handle MESSAGE_DELETED events
            if (message.type === 'MESSAGE_DELETED') {
                const { messageId, channelId: deletedChannelId } = message;
                
                // Update messages if it's for current channel
                if (selectedChannel?.id && 
                    (String(deletedChannelId) === String(selectedChannel.id))) {
                    setMessages(prev => 
                        prev.map(msg => 
                            String(msg.id) === String(messageId) 
                                ? { ...msg, content: '[deleted]', isDeleted: true }
                                : msg
                        )
                    );
                    // After 5 seconds remove from list so other messages fill the gap
                    const storageKey = `community_messages_${selectedChannel.id}`;
                    setTimeout(() => {
                        setMessages(prev => prev.filter(m => String(m.id) !== String(messageId)));
                        try {
                            const current = JSON.parse(localStorage.getItem(storageKey) || '[]');
                            const filtered = current.filter(m => String(m.id) !== String(messageId));
                            localStorage.setItem(storageKey, JSON.stringify(filtered));
                        } catch (e) { /* ignore */ }
                    }, 5000);
                }
                return; // Don't process as a new message
            }
            
            // Check if message is for current channel
            const isCurrentChannel = selectedChannel?.id && 
                (String(message.channelId) === String(selectedChannel.id) || 
                 String(message.channel_id) === String(selectedChannel.id));
            
            // Check if message mentions current user (case-insensitive)
            const currentUsername = storedUser?.username || storedUser?.name || '';
            const messageContent = message.content || '';
            const mentionRegex = new RegExp(`@${currentUsername}\\b`, 'i');
            const isMentioned = currentUsername && mentionRegex.test(messageContent);
            
            // Get message channel ID
            const messageChannelId = message.channelId || message.channel_id;
            const messageSenderId = message.sender?.id || message.userId;
            const isOwnMessage = String(messageSenderId) === String(userId);
            
            // Trigger notifications and update badges
            if (!isCurrentChannel && !isOwnMessage) {
                // New message in different channel - update badge
                updateChannelBadge(messageChannelId, 'unread');
                
                // Check if user is mentioned
                if (isMentioned) {
                    updateChannelBadge(messageChannelId, 'mentions');
                }
                
                const channelName = channelList.find(c => 
                    String(c.id) === String(messageChannelId)
                )?.name || 'a channel';
                
                if (isMentioned) {
                    triggerNotification(
                        'mention',
                        `You were mentioned in #${channelName}`,
                        `${message.sender?.username || 'Someone'}: ${messageContent.substring(0, 100)}`,
                        `/community/${messageChannelId}?message=${message.id || message.messageId || ''}`,
                        userId
                    );
                } else {
                    triggerNotification(
                        'message',
                        `New message in #${channelName}`,
                        `${message.sender?.username || 'Someone'}: ${messageContent.substring(0, 100)}`,
                        `/community/${messageChannelId}?message=${message.id || message.messageId || ''}`,
                        null
                    );
                }
            } else if (isCurrentChannel && isMentioned && !isOwnMessage) {
                // User was mentioned in current channel
                triggerNotification(
                    'mention',
                    `You were mentioned in #${selectedChannel.name}`,
                    `${message.sender?.username || 'Someone'}: ${messageContent.substring(0, 100)}`,
                    `/community/${selectedChannel.id}?message=${message.id}`,
                    userId
                );
            } else if (!isCurrentChannel && !isOwnMessage) {
                // Message in other channel, update badge
                updateChannelBadge(messageChannelId, 'unread');
            }
            
            // INSTANT UI update - only add message if it's for the current channel
            if (isCurrentChannel) {
                // Use functional update for instant state change (no batching delay)
                setMessages(prev => {
                    // Fast duplicate check using Set for O(1) lookup
                    const existingIds = new Set(prev.map(m => String(m.id || '')));
                    if (message.id && existingIds.has(String(message.id))) {
                        return prev; // Duplicate - skip
                    }
                    
                    // Fast content-based duplicate check (optimized)
                    // Check for same content, same sender, within 3 seconds
                    const isDuplicate = prev.some(m => {
                        const sameContent = m.content === message.content;
                        const sameSender = String(m.userId || m.sender?.id || '') === String(message.userId || message.sender?.id || '');
                        const timeDiff = Math.abs(
                            new Date(m.timestamp || m.createdAt || 0).getTime() - 
                            new Date(message.timestamp || message.createdAt || 0).getTime()
                        );
                        return sameContent && sameSender && timeDiff < 3000;
                    });
                    
                    if (isDuplicate) {
                        return prev;
                    }
                    
                    // Add message instantly
                    const newMessages = [...prev, message];
                    
                    // Save to localStorage IMMEDIATELY (critical for persistence)
                    // Don't defer - messages must be saved to prevent loss
                    if (selectedChannel?.id) {
                        saveMessagesToStorage(selectedChannel.id, newMessages);
                    }
                    
                    // Scroll to bottom instantly (use requestAnimationFrame for smooth scroll)
                    if (window.requestAnimationFrame) {
                        requestAnimationFrame(() => scrollToBottom());
                    } else {
                    setTimeout(() => scrollToBottom(), 0);
                    }
                    
                    return newMessages;
                });
            }
        },
        enableRealtime
    );

    // ***** MESSAGE PERSISTENCE: SERVER ONLY (no localStorage) *****
    // Community messages use the API as the single source of truth to avoid
    // localStorage quota limits (5–10MB). All users see the same data from the server.

    const saveMessagesToStorage = (channelId, messages) => {}; // No-op: server is source of truth

    const loadMessagesFromStorage = (channelId) => []; // No-op: always fetch from API

    const persistMessagesList = (channelId, nextMessages) => {
        setMessages(nextMessages);
        saveMessagesToStorage(channelId, nextMessages);
    };

    const replaceMessageById = (list, messageId, replacement) =>
        list.map(msg => (msg.id === messageId ? replacement : msg));

    // ***** HELPER FUNCTIONS *****
    
    // Extract just the filename from a path (remove directory path)
    const getFileName = (filePath) => {
        if (!filePath) return 'Unknown file';
        const fileName = filePath.split(/[/\\]/).pop();
        return fileName || filePath;
    };
    // Clean display name: hide raw hashes, show friendly label for images
    const getDisplayFileName = (filePath, fileType) => {
        const name = getFileName(filePath);
        if (!name) return 'File';
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const isImage = fileType?.startsWith?.('image/') || ['jpg','jpeg','png','gif','webp'].includes(ext);
        if (isImage) return 'Image' + (ext ? ` (.${ext})` : '');
        if (/^[a-f0-9-]{20,}$/i.test(name.replace(/\.[^.]+$/, ''))) return 'File' + (ext ? ` (.${ext})` : '');
        return name.length > 40 ? name.slice(0, 37) + '...' : name;
    };
    
    // ***** XP SYSTEM FUNCTIONS *****
    // XP system utilities are imported at the top of the file
    
    // Award XP and update user data - Save to both localStorage and database
    const awardXP = async (earnedXP) => {
        try {
            // Get current user data
            const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
            const currentXP = parseFloat(currentUser.xp || 0);
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
            
            // Save to localStorage immediately
            localStorage.setItem('user', JSON.stringify(updatedUser));
            
            // Update state and persist so sidebar shows new level immediately
            setStoredUser(updatedUser);
            setUserLevel(newLevel);
            try {
                localStorage.setItem('user', JSON.stringify(updatedUser));
            } catch (e) { /* ignore */ }
            
            // Check if user leveled up
            const leveledUp = newLevel > oldLevel;
            
            // Save to database in background (don't block UI)
            if (currentUser.id) {
                try {
                    const API_BASE_URL = window.location.origin;
                    const response = await fetch(`${API_BASE_URL}/api/users/update-xp`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: JSON.stringify({
                            userId: currentUser.id,
                            xp: newXP,
                            level: newLevel,
                            actionType: 'message',
                            description: `Earned ${earnedXP} XP from sending a message`
                        })
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        console.log(`✅ XP updated: +${earnedXP} XP (Total: ${newXP} XP, Level: ${newLevel})`, result);
                        
                        // If user leveled up, send notification to Levels channel
                        if (leveledUp) {
                            try {
                                const notificationResponse = await fetch(`${API_BASE_URL}/api/users/level-up-notification`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                                    },
                                    body: JSON.stringify({
                                        userId: currentUser.id,
                                        oldLevel: oldLevel,
                                        newLevel: newLevel,
                                        username: currentUser.username || currentUser.name || 'User'
                                    })
                                });
                                
                                if (notificationResponse.ok) {
                                    console.log(`🎉 Level-up notification sent for Level ${newLevel}!`);
                                } else {
                                    console.warn('⚠️ Failed to send level-up notification');
                                }
                            } catch (notifError) {
                                console.error('❌ Error sending level-up notification:', notifError);
                            }
                        }
                    } else {
                        const errorData = await response.json().catch(() => ({}));
                        console.error('❌ Failed to sync XP to database:', response.status, errorData);
                        // Retry once after 1 second
                        setTimeout(async () => {
                            try {
                                const retryResponse = await fetch(`${API_BASE_URL}/api/users/update-xp`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                                    },
                                    body: JSON.stringify({
                                        userId: currentUser.id,
                                        xp: newXP,
                                        level: newLevel
                                    })
                                });
                                if (retryResponse.ok) {
                                    console.log('✅ XP synced to database on retry');
                                    // Send level-up notification on retry if leveled up
                                    if (leveledUp) {
                                        try {
                                            await fetch(`${API_BASE_URL}/api/users/level-up-notification`, {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                                                },
                                                body: JSON.stringify({
                                                    userId: currentUser.id,
                                                    oldLevel: oldLevel,
                                                    newLevel: newLevel,
                                                    username: currentUser.username || currentUser.name || 'User'
                                                })
                                            });
                                        } catch (e) {}
                                    }
                                }
                            } catch (retryError) {
                                console.error('❌ XP retry failed:', retryError);
                            }
                        }, 1000);
                    }
                } catch (dbError) {
                    console.error('❌ Error syncing XP to database:', dbError);
                    // Continue anyway - XP is saved locally
                }
            } else {
                console.warn('⚠️ Cannot sync XP: User ID not found');
            }
            
            return {
                earnedXP,
                newXP,
                newLevel,
                leveledUp: leveledUp,
                xpForNextLevel: getXPForNextLevel(newLevel),
                xpProgress: newXP - getXPForNextLevel(oldLevel)
            };
        } catch (error) {
            console.error('Error awarding XP:', error);
            return null;
        }
    };
    
    // XP calculation is now handled by the imported calculateMessageXP function from xpSystem.js

    // Get user's role - check subscription status and plan
    const getCurrentUserRole = () => {
        if (isSuperAdminUser) return 'super_admin';
        if (isAdminUser) return 'admin';
        
        // Check subscription status and plan from user object
        const subscriptionStatus = storedUser?.subscription_status;
        const subscriptionPlan = storedUser?.subscription_plan;
        const userRole = storedUser?.role?.toLowerCase() || 'free';
        
        // If user has active subscription, ensure role matches plan
        if (subscriptionStatus === 'active') {
            if (subscriptionPlan === 'a7fx' || subscriptionPlan === 'elite' || subscriptionPlan === 'A7FX') {
                return 'a7fx';
            }
            if (subscriptionPlan === 'aura' || subscriptionPlan === 'Aura FX' || subscriptionPlan === 'premium') {
                return 'premium';
            }
            // If no plan specified but has active subscription, check role
            if (userRole === 'a7fx' || userRole === 'elite' || userRole === 'premium') {
                return userRole;
            }
            // Default to premium if subscription is active but no plan specified
            return 'premium';
        }
        
        // If subscription is inactive/expired, downgrade to free
        if (subscriptionStatus === 'inactive' || subscriptionStatus === 'cancelled' || subscriptionStatus === 'expired') {
        return 'free';
        }
        
        // Return stored role or default to free
        return userRole || 'free';
    };

    // Get user's courses
    const getUserCourses = () => {
        return storedUser?.courses || [];
    };

    // Check if user can access channel (view)
    // PAID ONLY - All channels require subscription (premium or a7fx)
    // Channel access levels: 'premium' (premium + a7fx), 'a7fx' (a7fx only), 'admin-only' (admins only)
    const canUserAccessChannel = (channel) => {
        const userRole = getCurrentUserRole();
        const accessLevel = (channel.accessLevel || 'premium').toLowerCase(); // Default to premium instead of open
        
        // Admin-only channels: only admins can see
        if (accessLevel === 'admin-only') {
            return userRole === 'admin' || userRole === 'super_admin' || isAdminUser || isSuperAdminUser;
        }
        
        // CRITICAL: Admins and premium role users ALWAYS have access to all channels
        // Check premium role first (before subscription check)
        const hasPremiumRole = userRole === 'premium' || userRole === 'a7fx' || userRole === 'elite';
        if (isAdminUser || isSuperAdminUser || hasPremiumRole) {
            // Admins and premium users can see all channels (except admin-only which is handled above)
            if (accessLevel === 'a7fx' || accessLevel === 'elite') {
                // A7FX channels: only a7fx/elite users and admins
                return userRole === 'a7fx' || userRole === 'elite' || isAdminUser || isSuperAdminUser;
            }
            // All other channels: admins and premium users have access
            return true;
        }
        
        // For non-admin, non-premium users: check subscription
        const hasActiveSubscription = subscriptionStatus 
            ? (subscriptionStatus.hasActiveSubscription && !subscriptionStatus.paymentFailed)
            : checkSubscription();
        
        // If no subscription, deny access
        if (!hasActiveSubscription) {
            return false;
        }
        
        // Premium channels: users with active subscription can see
        if (accessLevel === 'premium' || accessLevel === 'open' || accessLevel === 'free') {
            return hasActiveSubscription;
        }
        
        // A7FX channels: only a7fx/elite role users (already checked above) or active subscription with a7fx plan
        if (accessLevel === 'a7fx' || accessLevel === 'elite') {
            return false; // Non-premium users without a7fx role cannot access
        }
        
        // Default: require active subscription
        return hasActiveSubscription;
    };

    // Check if user can post in channel
    // PAID ONLY - All channels require subscription (premium or a7fx)
    // Posting permissions follow same access level rules as viewing
    const canUserPostInChannel = (channel) => {
        const userRole = getCurrentUserRole();
        const accessLevel = (channel.accessLevel || 'premium').toLowerCase(); // Default to premium instead of open
        const permissionType = (channel.permissionType || 'read-write').toLowerCase();
        const channelName = (channel.name || '').toLowerCase();
        const isAdminChannel = accessLevel === 'admin-only' || channel.locked || channelName === 'admin';
        
        // Check permission type first - if channel is read-only, only admins can post
        if (permissionType === 'read-only') {
            return userRole === 'admin' || userRole === 'super_admin' || isAdminUser || isSuperAdminUser;
        }
        
        // Admin-only channels: only admins can post
        if (isAdminChannel) {
            return userRole === 'admin' || userRole === 'super_admin' || isAdminUser || isSuperAdminUser;
        }
        
        // Legacy: Read-only access level (for backward compatibility)
        if (accessLevel === 'read-only') {
            return userRole === 'admin' || userRole === 'super_admin' || isAdminUser || isSuperAdminUser;
        }
        
        // CRITICAL: Admins and premium role users ALWAYS have posting access
        // Check premium role first (before subscription check)
        const hasPremiumRole = userRole === 'premium' || userRole === 'a7fx' || userRole === 'elite';
        if (isAdminUser || isSuperAdminUser || hasPremiumRole) {
            // Admins and premium users can post in all channels (except admin-only which is handled above)
            if (accessLevel === 'a7fx' || accessLevel === 'elite') {
                // A7FX channels: only a7fx/elite users and admins
                return userRole === 'a7fx' || userRole === 'elite' || isAdminUser || isSuperAdminUser;
            }
            // All other channels: admins and premium users can post
            return true;
        }
        
        // For non-admin, non-premium users: check subscription
        const hasActiveSubscription = subscriptionStatus 
            ? (subscriptionStatus.hasActiveSubscription && !subscriptionStatus.paymentFailed)
            : checkSubscription();
        
        // If no subscription, deny posting
        if (!hasActiveSubscription) {
            return false;
        }
        
        // Premium channels: users with active subscription can post
        if (accessLevel === 'premium' || accessLevel === 'open' || accessLevel === 'free') {
            return hasActiveSubscription;
        }
        
        // A7FX channels: only a7fx/elite role users (already checked above)
        if (accessLevel === 'a7fx' || accessLevel === 'elite') {
            return false; // Non-premium users without a7fx role cannot post
        }
        
        // Default: require active subscription
        return hasActiveSubscription;
    };

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            // Use instant scroll for real-time messages, smooth for user-initiated
            messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
    };
    
    // Immediate scroll function for real-time messages
    const scrollToBottomInstant = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Scroll to specific message when navigated from notification
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const messageId = params.get('message');
        
        if (messageId && messages.length > 0) {
            // Wait for messages to render, then scroll to the message
            // Use requestAnimationFrame for immediate execution after render
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const messageElement = document.getElementById(`message-${messageId}`);
                    if (messageElement) {
                        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Highlight the message briefly
                        messageElement.style.backgroundColor = 'rgba(139, 92, 246, 0.3)';
                        messageElement.style.transition = 'background-color 0.3s ease';
                        setTimeout(() => {
                            messageElement.style.backgroundColor = '';
                            setTimeout(() => {
                                messageElement.style.transition = '';
                            }, 300);
                        }, 2000);
                        
                        // Clean up URL parameter
                        const newUrl = window.location.pathname;
                        window.history.replaceState({}, '', newUrl);
                    }
                }, 100); // Reduced from 500ms to 100ms for faster navigation
            });
        }
    }, [location.search, messages, selectedChannel]);

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

    // GIF selection handler - auto-sends the message
    const handleGifSelect = async (gifUrl) => {
        // Prevent double-sending
        if (isSendingGifRef.current) return;
        isSendingGifRef.current = true;

        // Close GIF picker immediately
        setShowGifPicker(false);

        // Check if user can send messages in this channel
        if (!selectedChannel || selectedChannel.canWrite === false) {
            alert("You don't have permission to send messages in this channel.");
            isSendingGifRef.current = false;
            return;
        }

        // Create GIF markdown
        const gifMarkdown = `![GIF](${gifUrl})`;
        const messageContent = gifMarkdown;
        const senderUsername = storedUser?.username || storedUser?.name || 'User';

        // Prepare message data
        const messageToSend = {
            channelId: selectedChannel.id,
            content: messageContent,
            userId,
            username: senderUsername
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
            file: null,
            userId,
            username: senderUsername
        };
        
        // Add message to state immediately for instant UI feedback
        setMessages(prev => {
            const updated = [...prev, optimisticMessage];
            saveMessagesToStorage(selectedChannel.id, updated);
            return updated;
        });
        
        // Clear message input
        setNewMessage('');
        
        // Scroll to bottom immediately to show new message
        if (window.requestAnimationFrame) {
            requestAnimationFrame(() => scrollToBottom());
        } else {
        setTimeout(() => scrollToBottom(), 0);
        }

        try {
            // Save to backend API for permanent persistence
            try {
                const response = await Api.sendMessage(selectedChannel.id, messageToSend);
                
                if (response && response.data) {
                    // Replace optimistic message with server response (has real ID)
                    const serverMessage = response.data;
                    setMessages(prev => {
                        const final = replaceMessageById(prev, optimisticMessage.id, serverMessage);
                        saveMessagesToStorage(selectedChannel.id, final);
                        return final;
                    });
                    
                    // Broadcast message via WebSocket so all users see it in real-time
                    if (sendWebSocketMessage && isConnected && selectedChannel?.id) {
                        try {
                            sendWebSocketMessage({
                                ...serverMessage,
                                channelId: selectedChannel.id
                            });
                        } catch (wsError) {
                            // WebSocket failed - that's okay, REST API already saved it
                        }
                    }
                } else {
                    // If response doesn't have expected format, keep optimistic message
                    const permanentMessage = {
                        ...optimisticMessage,
                        id: Date.now()
                    };
                    setMessages(prev => {
                        const final = replaceMessageById(prev, optimisticMessage.id, permanentMessage);
                        saveMessagesToStorage(selectedChannel.id, final);
                        return final;
                    });
                    
                    // Still try to broadcast via WebSocket
                    if (sendWebSocketMessage && isConnected && selectedChannel?.id) {
                        try {
                            sendWebSocketMessage({
                                ...permanentMessage,
                                channelId: selectedChannel.id
                            });
                        } catch (wsError) {
                            // WebSocket failed - that's okay, REST API already saved it
                        }
                    }
                }
            } catch (apiError) {
                console.error('Backend API unavailable, saving to localStorage:', apiError);
                // Backend unavailable - save to localStorage for persistence
                const permanentMessage = {
                    ...optimisticMessage,
                    id: Date.now()
                };
                setMessages(prev => {
                    const final = replaceMessageById(prev, optimisticMessage.id, permanentMessage);
                    saveMessagesToStorage(selectedChannel.id, final);
                    return final;
                });
                
                // Still try to broadcast via WebSocket if available
                if (sendWebSocketMessage && isConnected && selectedChannel?.id) {
                    try {
                        sendWebSocketMessage({
                            ...permanentMessage,
                            channelId: selectedChannel.id
                        });
                    } catch (wsError) {
                        // WebSocket failed - that's okay, message is in localStorage
                    }
                }
            }
            
            // Award XP for sending message
            const earnedXP = calculateMessageXP(messageContent, false);
            console.log(`🎯 Awarding ${earnedXP} XP for GIF message`);
            const xpResult = await awardXP(earnedXP);
            if (xpResult) {
                console.log(`✅ XP Awarded: +${earnedXP} XP | Total: ${xpResult.newXP} XP | Level: ${xpResult.newLevel}`);
                
                // Trigger XP update event
                window.dispatchEvent(new CustomEvent('xpUpdated', {
                    detail: {
                        earnedXP: earnedXP,
                        newXP: xpResult.newXP,
                        newLevel: xpResult.newLevel,
                        leveledUp: xpResult.leveledUp
                    }
                }));
                
                if (xpResult.leveledUp) {
                    console.log(`🎉 LEVEL UP! You reached level ${xpResult.newLevel}!`);
                    window.dispatchEvent(new CustomEvent('levelUp', {
                        detail: {
                            newLevel: xpResult.newLevel,
                            newXP: xpResult.newXP
                        }
                    }));
                }
            } else {
                console.error('❌ Failed to award XP for GIF');
            }
        } catch (error) {
            console.error('Error sending GIF message:', error);
            // On error, remove optimistic message
            setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
            alert('Failed to send GIF. Please try again.');
        } finally {
            // Reset sending flag after a short delay to prevent rapid clicks
            setTimeout(() => {
                isSendingGifRef.current = false;
            }, 500);
        }
    };

    // File selection handler
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            
            // Create preview/data URL only for images (for display)
            // Store file data for all files (images and documents) to allow downloads
            const reader = new FileReader();
            reader.onloadend = () => {
                // Only set preview for images - non-image files will show icon + filename only
                if (file.type && file.type.startsWith('image/')) {
                    setFilePreview(reader.result);
                } else {
                    // For non-image files, store the data URL but don't set preview (so it won't show preview UI)
                    // The data URL is still needed for downloading
                    setFilePreview(reader.result);
                }
            };
            reader.readAsDataURL(file);
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

    // Handle paste events - supports text, images, and other content
    const handlePaste = async (e) => {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        const items = clipboardData.items;
        if (!items || items.length === 0) return;

        // Check for images first (highest priority)
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // Handle image paste
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault(); // Prevent default paste behavior
                
                const blob = item.getAsFile();
                if (blob) {
                    // Convert blob to File object
                    const file = new File([blob], `pasted-image-${Date.now()}.png`, {
                        type: blob.type || 'image/png'
                    });
                    
                    // Set as selected file (same as file upload)
                    setSelectedFile(file);
                    
                    // Create preview for image
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setFilePreview(reader.result);
                    };
                    reader.readAsDataURL(file);
                }
                return; // Don't process text if image was found
            }
        }

        // Check for files (other than images)
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file' && item.type.indexOf('image') === -1) {
                // Handle file paste (non-image files)
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    const file = new File([blob], `pasted-file-${Date.now()}.${blob.type.split('/')[1] || 'bin'}`, {
                        type: blob.type || 'application/octet-stream'
                    });
                    setSelectedFile(file);
                    // Create data URL for all files so they can be downloaded later
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setFilePreview(reader.result);
                    };
                    reader.readAsDataURL(file);
                }
                return;
            }
        }

        // Handle text paste - allow default behavior for plain text
        const textData = clipboardData.getData('text/plain');
        const htmlData = clipboardData.getData('text/html');
        
        if (textData) {
            // If there's plain text, allow default paste behavior
            // The textarea will handle it automatically
            // This covers: plain text, formatted text from Word/Google Docs, etc.
            return;
        } else if (htmlData) {
            // If only HTML and no plain text, extract text from HTML
            e.preventDefault();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlData;
            const plainText = tempDiv.textContent || tempDiv.innerText || '';
            
            if (plainText.trim()) {
                const input = messageInputRef.current;
                if (input) {
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const text = newMessage;
                    const before = text.substring(0, start);
                    const after = text.substring(end);
                    setNewMessage(before + plainText + after);
                    
                    // Set cursor position after pasted text
                    setTimeout(() => {
                        input.focus();
                        input.setSelectionRange(start + plainText.length, start + plainText.length);
                    }, 0);
                }
            }
        }
    };

    // Fetch messages for a channel - optimized for fast loading and real-time updates
    const fetchMessages = useCallback(async (channelId, mergeMode = false) => {
        if (!channelId) return;
        
        try {
            const response = await Api.getChannelMessages(channelId);
            if (response && response.data && Array.isArray(response.data)) {
                const apiMessages = response.data;
                
                if (mergeMode) {
                    // Merge mode: Add only new messages that don't exist yet
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMessages = apiMessages.filter(m => !existingIds.has(m.id));
                        
                        if (newMessages.length > 0) {
                            // Merge new messages with existing ones, sorted by timestamp
                            const merged = [...prev, ...newMessages].sort((a, b) => {
                                const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
                                const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
                                return timeA - timeB;
                            });
                            
                            // Save to localStorage
                            saveMessagesToStorage(channelId, merged);
                            return merged;
                        }
                        
                        return prev; // No new messages
                    });
                } else {
                    // Full refresh mode: Replace all messages
                    // OPTIMIZATION: Load from localStorage FIRST for instant display
                    const cachedMessages = loadMessagesFromStorage(channelId);
                    if (cachedMessages.length > 0) {
                        // Show cached messages immediately while fetching fresh ones
                        setMessages(cachedMessages);
                    } else {
                        // No cache, show empty array immediately
                        setMessages([]);
                    }
                    
                    // Always update with fresh messages from API (ensure persistence)
                    // Compare by message count and IDs to determine if update is needed
                    const cachedIds = new Set(cachedMessages.map(m => String(m.id || m.tempId || '')));
                    const apiIds = new Set(apiMessages.map(m => String(m.id || '')));
                    const hasNewMessages = apiMessages.length !== cachedMessages.length || 
                                         apiMessages.some(m => !cachedIds.has(String(m.id))) ||
                                         cachedMessages.some(m => m.id && !apiIds.has(String(m.id)));
                    
                    // Always save and update if:
                    // 1. There are new messages from API
                    // 2. API has messages (even if count matches, content might differ)
                    // 3. API messages exist (to ensure persistence)
                    if (hasNewMessages || apiMessages.length > 0) {
                        // Save to localStorage as backup/cache (CRITICAL for persistence)
                        saveMessagesToStorage(channelId, apiMessages);
                        
                        // Update with fresh messages from API (always use API as source of truth)
                        setMessages(apiMessages);
                    } else if (apiMessages.length === 0 && cachedMessages.length > 0) {
                        // If API returns empty but we have cached messages, keep cached (might be loading)
                        // But still save empty array to localStorage to sync state
                        saveMessagesToStorage(channelId, []);
                    }
                }
                return;
            }
        } catch (apiError) {
            // In merge mode, don't show errors - just silently fail
            if (!mergeMode) {
                // Full refresh mode: show cached messages if available
                const cachedMessages = loadMessagesFromStorage(channelId);
                if (cachedMessages.length > 0) {
                    setMessages(cachedMessages);
                } else {
                    console.warn('Backend API unavailable, no cached messages:', apiError.message);
                }
            }
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
            const errorMessage = error.response?.data?.message || error.message || 'Failed to create channel.';
            setChannelActionStatus({
                type: 'error',
                message: errorMessage
            });
            
            // If it's a 409 (duplicate), suggest using a different name
            if (error.response?.status === 409) {
                setNewChannelName('');
            }
        } finally {
            setChannelActionLoading(false);
        }
    };

    const handleDeleteChannel = async (channel) => {
        if (!channel || protectedChannelIds.includes(channel.id)) {
            return;
        }

        const confirmed = window.confirm(`Delete channel "${channel.displayName || channel.name}"? This cannot be undone.`);
        if (!confirmed) return;

        setChannelActionLoading(true);
        setChannelActionStatus(null);
        setChannelContextMenu(null);

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

    const handleEditChannel = async (channelData) => {
        if (!channelData || !channelData.id) return;

        setChannelActionLoading(true);
        setChannelActionStatus(null);
        setChannelContextMenu(null);
        setEditingChannel(null);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/community/channels', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    id: channelData.id,
                    name: channelData.name,
                    displayName: channelData.displayName || channelData.name,
                    description: channelData.description || '',
                    category: channelData.category,
                    accessLevel: channelData.accessLevel,
                    permissionType: channelData.permissionType || 'read-write'
                })
            });

            if (response.ok) {
                await refreshChannelList();
                setChannelActionStatus({ type: 'success', message: 'Channel updated successfully.' });
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update channel');
            }
        } catch (error) {
            console.error('Failed to update channel:', error);
            setChannelActionStatus({
                type: 'error',
                message: error.message || 'Failed to update channel.'
            });
        } finally {
            setChannelActionLoading(false);
        }
    };

    const handleDeleteCategory = async (categoryName) => {
        // Check if category has channels
        const channelsInCategory = channelList.filter(c => (c.category || 'general') === categoryName);
        if (channelsInCategory.length > 0) {
            alert(`Cannot delete category "${categoryName}" because it contains ${channelsInCategory.length} channel(s). Please move or delete all channels first.`);
            setCategoryContextMenu(null);
            return;
        }

        const confirmed = window.confirm(`Delete category "${formatCategoryName(categoryName)}"? This cannot be undone.`);
        if (!confirmed) {
            setCategoryContextMenu(null);
            return;
        }

        try {
            // Remove category from category order
            const currentOrder = [...categoryOrderState];
            const updatedOrder = currentOrder.filter(cat => cat !== categoryName);
            
            const response = await fetch('/api/community/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryOrder: updatedOrder })
            });

            if (response.ok) {
                setCategoryOrderState(updatedOrder);
                localStorage.setItem('channelCategoryOrder', JSON.stringify(updatedOrder));
                setCategoryContextMenu(null);
                triggerNotification('Category deleted successfully', 'success');
            } else {
                throw new Error('Failed to delete category');
            }
        } catch (error) {
            console.error('Failed to delete category:', error);
            alert('Failed to delete category. Please try again.');
            setCategoryContextMenu(null);
        }
    };

    const handleEditCategory = async (oldName, newName) => {
        if (!newName || newName.trim() === '') {
            alert('Category name cannot be empty');
            return;
        }

        if (oldName === newName) {
            setCategoryContextMenu(null);
            setEditingCategory(null);
            return;
        }

        try {
            // Update category name in all channels
            const channelsToUpdate = channelList.filter(c => (c.category || 'general') === oldName);
            
            for (const channel of channelsToUpdate) {
                await fetch('/api/community/channels', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: channel.id,
                        category: newName
                    })
                });
            }

            // Update category order
            const currentOrder = [...categoryOrderState];
            const index = currentOrder.indexOf(oldName);
            if (index !== -1) {
                currentOrder[index] = newName;
            }
            
            const response = await fetch('/api/community/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryOrder: currentOrder })
            });

            if (response.ok) {
                await refreshChannelList();
                setCategoryOrderState(currentOrder);
                localStorage.setItem('channelCategoryOrder', JSON.stringify(currentOrder));
                setCategoryContextMenu(null);
                setEditingCategory(null);
                triggerNotification('Category renamed successfully', 'success');
            } else {
                throw new Error('Failed to rename category');
            }
        } catch (error) {
            console.error('Failed to rename category:', error);
            alert('Failed to rename category. Please try again.');
            setCategoryContextMenu(null);
            setEditingCategory(null);
        }
    };

    // Check if welcome message has been read
    useEffect(() => {
        const readStatus = localStorage.getItem('welcomeMessageRead') === 'true';
        setHasReadWelcome(readStatus);
    }, []);


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

    // Fetch all users for @mention autocomplete
    const fetchAllUsers = useCallback(async () => {
        try {
            const response = await axios.get(`${window.location.origin}/api/community/users`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (Array.isArray(response.data)) {
                setAllUsers(response.data);
            }
        } catch (error) {
            console.error('Error fetching users for autocomplete:', error);
        }
    }, []);

    // Fetch users on mount and periodically
    useEffect(() => {
        if (isAuthenticated) {
            fetchAllUsers();
            const interval = setInterval(fetchAllUsers, 60000); // Refresh every minute
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, fetchAllUsers]);

    // Check subscription status from database
    const checkSubscriptionFromDB = useCallback(async () => {
        if (!userId) return false;
        
        try {
            const result = await Api.checkSubscription(userId);
            if (result.success) {
                const storedUserData = JSON.parse(localStorage.getItem('user') || '{}');
                const role = (storedUserData?.role || '').toLowerCase();
                const isAdminOrSuper = ['admin', 'super_admin'].includes(role);
                const merged = isAdminOrSuper
                    ? { ...result, hasActiveSubscription: true, isAdmin: true, paymentFailed: false }
                    : result;
                setSubscriptionStatus(merged);
                setPaymentFailed(merged.paymentFailed || false);
                
                // CRITICAL: User has access if: admin, premium role, OR active subscription
                // Premium role and admin status from API override subscription status
                const hasAccess = merged.isAdmin || merged.isPremium || (merged.hasActiveSubscription && !merged.paymentFailed);
                
                // Update localStorage to match database
                if (hasAccess) {
                    localStorage.setItem('hasActiveSubscription', 'true');
                    if (merged.expiry) {
                        localStorage.setItem('subscriptionExpiry', merged.expiry);
                    }
                } else {
                    // Only remove if not admin/premium (they don't need subscription)
                    if (!merged.isAdmin && !merged.isPremium) {
                        localStorage.removeItem('hasActiveSubscription');
                        localStorage.removeItem('subscriptionExpiry');
                    }
                }
                
                return hasAccess;
            }
            return false;
        } catch (error) {
            console.error('Error checking subscription from database:', error);
            // Fallback to localStorage check
            return checkSubscriptionLocal();
        }
    }, [userId, checkSubscriptionLocal]);
    
    // Combined subscription check with role-based fallback
    const checkSubscription = () => {
        // CRITICAL: Check premium role first - premium role ALWAYS grants access
        const storedUserData = JSON.parse(localStorage.getItem('user') || '{}');
        const userRole = (storedUser?.role || storedUserData.role || 'free').toLowerCase();
        const hasPremiumRole = userRole === 'premium' || userRole === 'a7fx' || userRole === 'elite';
        
        // Premium role users always have access
        if (hasPremiumRole) {
            return true;
        }
        
        // Use database status if available, otherwise fallback to localStorage
        if (subscriptionStatus) {
            return subscriptionStatus.hasActiveSubscription && !subscriptionStatus.paymentFailed;
        }
        return checkSubscriptionLocal();
    };
    
    // Check for Stripe redirect and activate subscription immediately
    useEffect(() => {
        if (!userId || !isAuthenticated) return;
        
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const paymentSuccess = params.get('payment_success') === 'true' || params.get('redirect_status') === 'succeeded';
        
        // If user just came back from Stripe payment, activate subscription immediately
        if ((sessionId || paymentSuccess) && userId) {
            const activateSubscription = async () => {
                try {
                    const token = localStorage.getItem('token');
                    const response = await axios.post(
                        `${window.location.origin}/api/stripe/subscription-success`,
                        { userId, session_id: sessionId || `stripe-${Date.now()}` },
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    if (response.data && response.data.success) {
                        // Clear URL params
                        window.history.replaceState({}, document.title, window.location.pathname);
                        
                        // Force immediate subscription check
                        await checkSubscriptionFromDB();
                    }
                } catch (error) {
                    console.error('Error activating subscription from redirect:', error);
                }
            };
            
            activateSubscription();
        }
        
        // Check subscription less frequently to improve performance
        // Initial check already done above if needed, then every 10 seconds
        const interval = setInterval(() => {
            checkSubscriptionFromDB();
        }, 30000); // Check subscription every 30s (not critical for real-time)
        
        return () => clearInterval(interval);
    }, [userId, isAuthenticated, checkSubscriptionFromDB]);

    // Handle window resize for mobile/tablet detection
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            const isMobileWidth = width <= 1024;
            setIsMobile(isMobileWidth);
            // Close sidebar when switching to desktop
            if (!isMobileWidth && sidebarOpen) {
                setSidebarOpen(false);
            }
        };
        
        window.addEventListener('resize', handleResize);
        // Check on mount
        handleResize();
        
        return () => window.removeEventListener('resize', handleResize);
    }, [sidebarOpen]);
    
    // Close sidebar when clicking outside on mobile and prevent body scroll
    useEffect(() => {
        if (!isMobile) {
            // Clean up on desktop
            document.body.classList.remove('sidebar-open-mobile');
            document.body.style.overflow = '';
            return;
        }
        
        if (sidebarOpen) {
            document.body.classList.add('sidebar-open-mobile');
            document.body.style.overflow = 'hidden';
        } else {
            document.body.classList.remove('sidebar-open-mobile');
            document.body.style.overflow = '';
        }

        const handleClickOutside = (e) => {
            if (!sidebarOpen) return;
            const sidebar = document.querySelector('.community-sidebar');
            const toggleButton = document.querySelector('.mobile-sidebar-toggle');
            if (sidebar && !sidebar.contains(e.target) && !toggleButton?.contains(e.target)) {
                setSidebarOpen(false);
            }
        };

        if (sidebarOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside, { passive: true });
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            document.body.classList.remove('sidebar-open-mobile');
            document.body.style.overflow = '';
        };
    }, [isMobile, sidebarOpen]);
    
    // Handle swipe gestures for mobile sidebar
    const handleTouchStart = (e) => {
        if (!isMobile) return;
        setTouchStartX(e.touches[0].clientX);
    };
    
    const handleTouchMove = (e) => {
        if (!isMobile || touchStartX === null) return;
        const touchEndX = e.touches[0].clientX;
        const diff = touchStartX - touchEndX;
        
        // Swipe right to open (if closed) - swipe from left edge
        if (diff < -50 && !sidebarOpen && touchStartX < 20) {
            setSidebarOpen(true);
            setTouchStartX(null);
        }
        // Swipe left to close (if open)
        else if (diff > 50 && sidebarOpen) {
            setSidebarOpen(false);
            setTouchStartX(null);
        }
    };
    
    const handleTouchEnd = () => {
        setTouchStartX(null);
    };

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

    // Initialize component - refresh user data on mount and on payment redirect
    useEffect(() => {        
        const storedToken = localStorage.getItem('token');
        // Prioritize AuthContext user if available (most up-to-date), otherwise use localStorage
        let storedUserData = authUser ? { ...authUser } : JSON.parse(localStorage.getItem('user') || '{}');
        
        const tokenIsValid = storedToken && storedToken.split('.').length === 3;
        setIsAuthenticated(tokenIsValid);
        
        if (!tokenIsValid) {
            navigate('/login');
            return;
        }
        
        // Check if coming from payment success - refresh user data immediately
        const params = new URLSearchParams(window.location.search);
        const paymentSuccess = params.get('payment_success') === 'true' || params.get('redirect_status') === 'succeeded';
        const sessionId = params.get('session_id');
        
        if (paymentSuccess || sessionId) {
            // Refresh user data from localStorage (just updated by PaymentSuccess)
            const latestUser = authUser || JSON.parse(localStorage.getItem('user') || '{}');
            storedUserData = { ...latestUser };
            window.history.replaceState({}, document.title, window.location.pathname);
            // Force entitlements refresh and refetch channels so UI updates instantly (no 60s stale tier)
            refreshEntitlements().then(() => {
                try { localStorage.removeItem('community_channels_cache'); } catch (e) { /* ignore */ }
                refreshChannelList();
            });
        }

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
            
            // Fetch latest user data from API to ensure XP/level are up-to-date
            if (storedUserData.id) {
                // Small delay to ensure component is ready
                setTimeout(() => {
                    fetchLatestUserData(storedUserData.id);
                }, 500);
            }
            
            // If coming from payment success, immediately check subscription status from DB
            if ((paymentSuccess || sessionId) && storedUserData.id) {
                // Small delay to ensure backend has processed the payment
                setTimeout(() => {
                    checkSubscriptionFromDB();
                }, 500);
            }
        }
    }, [navigate, authUser, checkSubscriptionFromDB, fetchLatestUserData, refreshEntitlements, refreshChannelList]);

    // Prevent page scrolling on Community only - Discord-like behavior; always restore on unmount/route
    useEffect(() => {
        document.body.classList.add('community-page-active');
        document.documentElement.classList.add('community-page-active');

        return () => {
            document.body.classList.remove('community-page-active');
            document.documentElement.classList.remove('community-page-active');
            document.body.classList.remove('sidebar-open-mobile');
            document.body.style.overflow = '';
        };
    }, []);

    // When route leaves Community, ensure scroll lock is removed (e.g. if unmount is delayed)
    useEffect(() => {
        const isCommunity = location.pathname.startsWith('/community');
        if (!isCommunity) {
            document.body.classList.remove('community-page-active', 'sidebar-open-mobile');
            document.documentElement.classList.remove('community-page-active');
            document.body.style.overflow = '';
        }
    }, [location.pathname]);

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

        // Refresh channel list less frequently to improve performance
        // Initial load happens immediately, then refresh every 60 seconds
        const intervalId = setInterval(() => {
            // Only refresh if API is working to avoid spam
            checkApiConnectivity().then((apiWorking) => {
                if (apiWorking) {
                    refreshChannelList().catch((err) => {
                        console.warn('Failed to refresh channel list:', err.message);
                    });
                }
            });
        }, 60000); // Reduced from 30s to 60s

        return () => clearInterval(intervalId);
    }, [isAuthenticated, refreshChannelList, checkApiConnectivity]);

    // Generate smoothed online count variation (gradual changes over time)
    // This is purely cosmetic for early-stage UX polish - no storage used
    const generateSmoothedOnlineCount = useCallback((currentCount) => {
        // Small random variation: -3 to +3
        const variation = Math.floor(Math.random() * 7) - 3;
        let newCount = currentCount + variation;
        
        // Keep within 20-100 bounds
        return Math.max(20, Math.min(100, newCount));
    }, []);

    // Update online count with smooth variations (purely cosmetic for UX polish)
    const updateOnlineCount = useCallback(() => {
        setOnlineCount(prev => generateSmoothedOnlineCount(prev));
    }, [generateSmoothedOnlineCount]);

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
            try {
                // If WebSocket is connected, prioritize that - show connected even if API has minor issues
                if (isConnected) {
                    setConnectionStatus('connected');
                    return;
                }
                
                // Check if browser is offline first
                if (!navigator.onLine) {
                    setConnectionStatus('wifi-issue');
                    return;
                }
                
                // Check API connectivity
                const apiWorking = await checkApiConnectivity();
                
                // If API not working but browser is online and WebSocket also not connected, it's a server issue
                if (!apiWorking && navigator.onLine && !isConnected) {
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
            } catch (error) {
                console.error('Error updating connection status:', error);
                // On error, default to connecting
                setConnectionStatus('connecting');
            }
        };

        // Update immediately
        updateConnectionStatus();
        
        // Update status every 2 seconds for real-time updates (optimized for production)
        const statusCheckInterval = setInterval(updateConnectionStatus, 2000);
        
        return () => clearInterval(statusCheckInterval);
    }, [isAuthenticated, isConnected, connectionError, checkApiConnectivity]);

    // Update online count with smooth variations periodically (UX polish only)
    useEffect(() => {
        if (!isAuthenticated) return;

        // Update online count every 30-60 seconds with small variations
        // This creates natural-looking fluctuations without extreme jumps
        const statusInterval = setInterval(() => {
            updateOnlineCount();
        }, 30000 + Math.random() * 30000); // 30-60 seconds random interval

        return () => clearInterval(statusInterval);
    }, [isAuthenticated, updateOnlineCount]);

    // Load messages when channel changes - optimized for instant display
    useEffect(() => {
        if (selectedChannel && selectedChannel.id) {
            // Navigate immediately (non-blocking)
            navigate(`/community/${selectedChannel.id}`);
            
            // Load cached messages first for instant display
            const cachedMessages = loadMessagesFromStorage(selectedChannel.id);
            if (cachedMessages.length > 0) {
                setMessages(cachedMessages);
                // Scroll to bottom immediately when showing cached messages
                setTimeout(() => scrollToBottom(), 0);
            } else {
                setMessages([]);
            }
            
            // Fetch fresh messages in parallel (non-blocking)
            fetchMessages(selectedChannel.id).catch(() => {
                // Silently handle fetch errors
            });
        }
    }, [selectedChannel, fetchMessages, navigate]);
    
    // Clear channel badge when channel is selected
    useEffect(() => {
        if (selectedChannel?.id) {
            clearChannelBadge(selectedChannel.id);
        }
    }, [selectedChannel?.id, clearChannelBadge]);

    // Poll for new messages - Optimized for high traffic (500+ users)
    // When WebSocket is down: poll every 1s for fast fallback
    // When WebSocket is connected: backup poll every 5s to catch any missed messages (multi-device reliability)
    useEffect(() => {
        if (!selectedChannel || !isAuthenticated || !selectedChannel?.id) return;
        
        // Store previous message count for notification detection
        let previousMessageCount = messages.length;
        
        // Poll interval: 1s when WS down, 5s backup when WS connected (ensures multi-device messages get through)
        const pollInterval = isConnected ? 5000 : 1000;
        
        // Start polling immediately
        const pollMessages = async () => {
            try {
                // Use merge mode to only add new messages, not replace all
                const response = await Api.getChannelMessages(selectedChannel.id);
                if (response && response.data && Array.isArray(response.data)) {
                    const apiMessages = response.data;
                    
                    // Check for new messages
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMessages = apiMessages.filter(m => !existingIds.has(m.id));
                        
                        // Trigger notifications for new messages (only if not from current user)
                        if (newMessages.length > 0) {
                            const currentUsername = storedUser?.username || storedUser?.name || '';
                            newMessages.forEach(newMsg => {
                                // Don't notify for own messages
                                if (String(newMsg.sender?.id) === String(userId) || 
                                    newMsg.sender?.username === currentUsername) {
                                    return;
                                }
                                
                                const messageContent = newMsg.content || '';
                                const isMentioned = currentUsername && messageContent.includes(`@${currentUsername}`);
                                
                                // Update badges for mentions in current channel
                                if (isMentioned) {
                                    updateChannelBadge(selectedChannel.id, 'mentions');
                                    triggerNotification(
                                        'mention',
                                        `You were mentioned in #${selectedChannel.name}`,
                                        `${newMsg.sender?.username || 'Someone'}: ${messageContent.substring(0, 100)}`,
                                        `/community/${selectedChannel.id}?message=${newMsg.id || newMsg.messageId || ''}`,
                                        userId
                                    );
                                }
                            });
                        }
                        
                        if (newMessages.length > 0) {
                            // Merge new messages with existing ones, sorted by timestamp
                            const merged = [...prev, ...newMessages].sort((a, b) => {
                                const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
                                const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
                                return timeA - timeB;
                            });
                            
                            // Save to localStorage
                            saveMessagesToStorage(selectedChannel.id, merged);
                            return merged;
                        }
                        
                        return prev; // No new messages
                    });
                }
            } catch (err) {
                // Silently handle errors to avoid console spam
            }
        };
        
        // Poll immediately on mount/channel change
        pollMessages();
        
        // Then poll at regular intervals
        const pollTimer = setInterval(pollMessages, pollInterval);

        return () => clearInterval(pollTimer);
    }, [selectedChannel?.id, isAuthenticated, isConnected, fetchMessages, selectedChannel, storedUser, userId, messages.length, updateChannelBadge]);

    // Pusher realtime subscription (production - when configured)
    useEffect(() => {
        const key = process.env.REACT_APP_PUSHER_KEY;
        const cluster = process.env.REACT_APP_PUSHER_CLUSTER || 'us2';
        if (!key || !selectedChannel?.id) return;
        let pusher = null;
        let channel = null;
        try {
            const Pusher = require('pusher-js');
            pusher = new Pusher(key, { cluster });
            channel = pusher.subscribe(`channel-${selectedChannel.id}`);
            channel.bind('new-message', (data) => {
                if (!data || String(data.channelId || data.channel_id) !== String(selectedChannel.id)) return;
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => String(m.id || '')));
                    if (data.id && existingIds.has(String(data.id))) return prev;
                    const merged = [...prev, data].sort((a, b) =>
                        new Date(a.timestamp || a.createdAt || 0) - new Date(b.timestamp || b.createdAt || 0)
                    );
                    saveMessagesToStorage(selectedChannel.id, merged);
                    return merged;
                });
            });
        } catch (e) {
            if (process.env.NODE_ENV === 'development') console.warn('Pusher subscribe failed:', e.message);
        }
        return () => {
            if (channel) channel.unbind_all();
            if (pusher) pusher.unsubscribe(`channel-${selectedChannel.id}`);
        };
    }, [selectedChannel?.id]);
    
    const isWelcomeChannel = selectedChannel && (String(selectedChannel.id).toLowerCase() === 'welcome' || (selectedChannel.name && selectedChannel.name.toLowerCase() === 'welcome'));

    // Keep welcome message visible for everyone when viewing welcome channel
    useEffect(() => {
        if (!selectedChannel || !isWelcomeChannel) return;
        const hasWelcomeMessage = messages.some(msg => msg.id === 'welcome-message');
        if (hasWelcomeMessage) return;

        const welcomeMessage = {
            id: 'welcome-message',
            channelId: selectedChannel.id,
            content: `🎉 **WELCOME TO AURA FX COMMUNITY!** 🎉

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
                        username: 'AURA FX',
                        avatar: '/avatars/avatar_ai.png',
                        role: 'admin'
                    },
                    timestamp: new Date().toISOString(),
            file: null,
            isWelcomeMessage: true
        };
        setMessages(prev => {
            if (prev.length === 0) return [welcomeMessage];
            if (prev.some(m => m.id === 'welcome-message')) return prev;
            return [welcomeMessage, ...prev];
        });
    }, [selectedChannel, messages, isWelcomeChannel]);

    // Handle edit message
    const handleEditMessage = (messageId) => {
        const message = messages.find(m => m.id === messageId);
        if (message && String(message.userId) === String(userId)) {
            setEditingMessageId(messageId);
            setEditingMessageContent(message.content);
            setNewMessage(message.content);
            setContextMenu(null);
            // Focus input after a brief delay
            setTimeout(() => {
                messageInputRef.current?.focus();
                messageInputRef.current?.setSelectionRange(message.content.length, message.content.length);
            }, 0);
        }
    };

    // Cancel edit
    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditingMessageContent('');
        setNewMessage('');
    };

    // Handle opening/downloading files - Always make files downloadable
    const handleFileClick = (file) => {
        if (!file) return;
        
        // Always try to download the file first
        if (file.preview) {
            try {
                // Convert base64 to blob for download
                const base64Data = file.preview.includes(',') 
                    ? file.preview.split(',')[1] 
                    : file.preview;
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: file.type || 'application/octet-stream' });
                
                // Create download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = getFileName(file.name); // Use just filename, no path
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                return; // Download successful, don't open in new tab
            } catch (error) {
                console.error('Error downloading file:', error);
            }
        }
        
        // If it's an image with preview, also open in new tab after download attempt
        if (file.preview && file.type && file.type.startsWith('image/')) {
            const newWindow = window.open();
            if (newWindow) {
                newWindow.document.write(`
                    <html>
                        <head>
                            <title>${file.name}</title>
                            <style>
                                body {
                                    margin: 0;
                                    padding: 20px;
                                    background: #1a1a1a;
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    min-height: 100vh;
                                }
                                img {
                                    max-width: 100%;
                                    max-height: 100vh;
                                    border-radius: 8px;
                                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                                }
                            </style>
                        </head>
                        <body>
                            <img src="${file.preview}" alt="${file.name}" />
                        </body>
                    </html>
                `);
            }
        } else if (file.preview) {
            // For documents with preview (base64 data), download the file
            try {
                // Convert base64 to blob
                const base64Data = file.preview.includes(',') 
                    ? file.preview.split(',')[1] 
                    : file.preview;
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: file.type || 'application/octet-stream' });
                
                // Create download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = file.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error downloading file:', error);
                // Fallback: try to open in new tab if it's a viewable format
                if (file.type && (file.type.includes('pdf') || file.type.includes('text'))) {
                    const newWindow = window.open();
                    if (newWindow && file.preview) {
                        newWindow.document.write(`
                            <html>
                                <head>
                                    <title>${file.name}</title>
                                    <style>
                                        body {
                                            margin: 0;
                                            padding: 20px;
                                            background: #1a1a1a;
                                            color: #fff;
                                            font-family: Arial, sans-serif;
                                        }
                                        .container {
                                            max-width: 800px;
                                            margin: 0 auto;
                                            padding: 20px;
                                        }
                                        iframe {
                                            width: 100%;
                                            height: 80vh;
                                            border: none;
                                            border-radius: 8px;
                                        }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <h2>${file.name}</h2>
                                        <iframe src="${file.preview}"></iframe>
                                    </div>
                                </body>
                            </html>
                        `);
                    }
                } else {
                    alert(`File "${file.name}" cannot be downloaded. File data is not available.`);
                }
            }
        } else {
            // No preview available - file data not stored
            alert(`File "${file.name}" cannot be opened. The file data was not saved when the message was sent.`);
        }
    };

    // Handle send message (or update if editing)
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedFile) || !selectedChannel) return;
        if (selectedChannel.canWrite === false) {
            return;
        }

        // If editing a message, handle update instead
        if (editingMessageId) {
            const message = messages.find(m => m.id === editingMessageId);
            if (message && String(message.userId) === String(userId)) {
                try {
                    // Update message content
                    const updatedContent = newMessage.trim();
                    setMessages(prev => {
                        const updated = prev.map(msg => 
                            msg.id === editingMessageId 
                                ? { ...msg, content: updatedContent, edited: true }
                                : msg
                        );
                        saveMessagesToStorage(selectedChannel.id, updated);
                        return updated;
                    });
                    
                    // TODO: Send update to backend API
                    // For now, just update locally
                    
                    handleCancelEdit();
                    return;
                } catch (error) {
                    console.error('Error editing message:', error);
                    alert('Failed to edit message. Please try again.');
                    return;
                }
            }
        }

        const messageContent = newMessage.trim();
        const senderUsername = storedUser?.username || storedUser?.name || 'User';

        // Prepare message data - include file metadata if file exists
        // Don't include file name in content - file attachment will display it
        const messageToSend = {
            channelId: selectedChannel.id,
            content: messageContent || '', // Empty if no text, file will be shown separately
            userId,
            username: senderUsername
        };
        
        // Add file metadata if file exists
        if (selectedFile) {
            messageToSend.file = {
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size
            };
            // Include preview only if it's an image (for preview display)
            // Non-image files will use preview data for download but won't show preview UI
            if (filePreview && selectedFile.type && selectedFile.type.startsWith('image/')) {
                messageToSend.file.preview = filePreview;
            }
        }

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
                // Only include preview for images (for preview display)
                preview: (filePreview && selectedFile.type && selectedFile.type.startsWith('image/')) ? filePreview : null
            } : null,
            userId,
            username: senderUsername
        };
        
        // Add message to state immediately for instant UI feedback
        // Use functional update to ensure we have the latest messages
        setMessages(prev => {
            const updated = [...prev, optimisticMessage];
            saveMessagesToStorage(selectedChannel.id, updated);
            return updated;
        });
        
        // Clear inputs immediately
        setNewMessage('');
        setEditingMessageId(null);
        setEditingMessageContent('');
        removeSelectedFile();
        
        // Scroll to bottom immediately to show new message (instant for sent messages)
        scrollToBottomInstant();

        try {
            // Broadcast via WebSocket for instant delivery to other clients (no DB save in WS server)
            if (sendWebSocketMessage && isConnected && selectedChannel?.id) {
                const wsMsg = {
                    ...messageToSend,
                    id: optimisticMessage.id,
                    timestamp: optimisticMessage.timestamp,
                    sender: optimisticMessage.sender,
                    channelId: selectedChannel.id
                };
                sendWebSocketMessage(wsMsg);
            }
            // Send via API (DB persistence + Pusher broadcast for production)
            Api.sendMessage(selectedChannel.id, messageToSend)
                .then(response => {
                    if (response && response.data) {
                        // Replace optimistic message with server response (has real ID)
                        const serverMessage = response.data;
                        setMessages(prev => {
                            // Check if message already exists (might have been added via WebSocket)
                            const existingIndex = prev.findIndex(m => 
                                m.id === optimisticMessage.id || 
                                (m.content === serverMessage.content && 
                                 String(m.userId) === String(serverMessage.userId) &&
                                 Math.abs(new Date(m.timestamp) - new Date(serverMessage.timestamp)) < 5000)
                            );
                            
                            if (existingIndex !== -1) {
                                // Replace existing message
                                const updated = [...prev];
                                updated[existingIndex] = serverMessage;
                                saveMessagesToStorage(selectedChannel.id, updated);
                                return updated;
                            } else {
                                // Add new message if not already present
                                const final = replaceMessageById(prev, optimisticMessage.id, serverMessage);
                                saveMessagesToStorage(selectedChannel.id, final);
                                return final;
                            }
                        });
                    }
                })
                .catch(error => {
                    console.error('Error saving message to API:', error);
                    toast.error('Failed to send. Please try again.');
                });
            
            // Check for @mentions and send notifications (don't wait for API response)
            const mentionRegex = /@(\w+)/g;
            const mentions = messageContent.match(mentionRegex);
            if (mentions) {
                // Handle mentions asynchronously (don't block message sending)
                (async () => {
                    try {
                        // Use cached allUsers or fetch if needed
                        let usersForMentions = allUsers;
                        if (usersForMentions.length === 0) {
                            const usersResponse = await axios.get(`${window.location.origin}/api/community/users`);
                            usersForMentions = Array.isArray(usersResponse.data) ? usersResponse.data : [];
                            setAllUsers(usersForMentions);
                        }
                            
                            // Get unique mentioned usernames
                            const mentionedUsernames = [...new Set(mentions.map(m => m.substring(1).toLowerCase()))];
                            
                            // Check for @admin mention
                            const hasAdminMention = mentionedUsernames.includes('admin');
                            
                            if (hasAdminMention) {
                                // Notify all admins
                                const adminUsers = usersForMentions.filter(u => {
                                    const role = (u.role || '').toLowerCase();
                                    return role === 'admin' || role === 'super_admin';
                                });
                                
                                adminUsers.forEach(adminUser => {
                                    // Send notification to all admins (including current user if they're an admin)
                                    // Update channel badge for admin (only if not viewing this channel)
                                    if (String(selectedChannel.id) !== String(selectedChannel?.id)) {
                                        // This will be handled by WebSocket for other users
                                    }
                                    
                                    // Send notification
                                    triggerNotification(
                                        'mention',
                                        `@admin mention in #${selectedChannel.name}`,
                                        `${senderUsername} mentioned @admin: ${messageContent}`,
                                        `/community`,
                                        adminUser.id
                                    );
                                    
                                    // Update channel badge for admin (if not viewing this channel)
                                    // Note: This will be handled per-user via WebSocket or localStorage
                                    // For now, we'll update it for all admins via the notification system
                                });
                            }
                            
                            // Handle regular user mentions
                            mentionedUsernames.forEach(mentionedUsername => {
                                if (mentionedUsername === 'admin') return; // Already handled above
                                
                                // Find the user by username (case-insensitive)
                                const mentionedUser = usersForMentions.find(u => {
                                    const uUsername = (u.username || u.name || '').toLowerCase();
                                    return uUsername === mentionedUsername;
                                });
                                
                                // Only send notification if:
                                // 1. User exists
                                // 2. It's not the current user (don't notify yourself)
                                if (mentionedUser && String(mentionedUser.id) !== String(userId)) {
                                    // Update badge for mentioned user (if not viewing this channel)
                                    if (String(selectedChannel.id) !== String(selectedChannel?.id)) {
                                        // This will be handled by WebSocket for other users
                                    }
                                    
                                    triggerNotification(
                                        'mention',
                                        `You were mentioned in #${selectedChannel.name}`,
                                        `${senderUsername} mentioned you: ${messageContent}`,
                                        `/community`,
                                        mentionedUser.id // Pass the mentioned user's ID
                                    );
                                }
                            });
                    } catch (error) {
                        console.error('Error fetching users for mentions:', error);
                        // Silently fail - don't break message sending if user lookup fails
                    }
                })();
            }
            
            // ***** AWARD XP FOR SENDING MESSAGE *****
            const earnedXP = calculateMessageXP(messageContent, !!selectedFile);
            console.log(`🎯 Awarding ${earnedXP} XP for message`);
            const xpResult = await awardXP(earnedXP);
            if (xpResult) {
                console.log(`✅ XP Awarded: +${earnedXP} XP | Total: ${xpResult.newXP} XP | Level: ${xpResult.newLevel}`);
                
                // Trigger a custom event so profile page can listen for XP updates
                window.dispatchEvent(new CustomEvent('xpUpdated', {
                    detail: {
                        earnedXP: earnedXP,
                        newXP: xpResult.newXP,
                        newLevel: xpResult.newLevel,
                        leveledUp: xpResult.leveledUp
                    }
                }));
                
                if (xpResult.leveledUp) {
                    // Show level-up notification
                    console.log(`🎉 LEVEL UP! You reached level ${xpResult.newLevel}!`);
                    // Trigger level-up event
                    window.dispatchEvent(new CustomEvent('levelUp', {
                        detail: {
                            newLevel: xpResult.newLevel,
                            newXP: xpResult.newXP
                        }
                    }));
                }
            } else {
                console.error('❌ Failed to award XP');
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

    // Handle welcome message acknowledgment (emoji reaction - unlocks channels)
    const handleWelcomeAcknowledgment = async () => {
        try {
            await Api.acceptOnboarding();
            localStorage.setItem('welcomeMessageRead', 'true');
            setHasReadWelcome(true);
            localStorage.removeItem('community_channels_cache');
            await refreshEntitlements();
            await refreshChannelList();
        } catch (err) {
            console.error('Accept onboarding error:', err);
            toast.error(err?.response?.data?.message || 'Failed to accept. Please try again.');
        }
    };

    // Check if user can delete a message (own message OR admin/moderator)
    const canDeleteMessage = useCallback((message) => {
        if (!message || !userId) return false;
        
        // Message owner can delete their own message
        const isOwnMessage = String(message.userId || message.sender?.id) === String(userId);
        if (isOwnMessage) return true;
        
        // Admin or moderator can delete any message
        if (isAdminUser || isSuperAdminUser) return true;
        
        // Check user role from stored user
        const role = (storedUser?.role || '').toLowerCase();
        if (role === 'moderator' || role === 'admin' || role === 'super_admin') return true;
        
        return false;
    }, [userId, isAdminUser, isSuperAdminUser, storedUser]);

    const handleDeleteMessage = (messageId) => {
        if (!selectedChannel) {
            return;
        }

        // Find the message to show in confirmation
        const messageToDelete = messages.find(msg => msg.id === messageId);
        if (!messageToDelete) {
            return;
        }

        // Check permission
        if (!canDeleteMessage(messageToDelete)) {
            console.warn('User does not have permission to delete this message');
            return;
        }

        // Show custom delete confirmation modal
        setDeleteMessageModal({
            messageId,
            messageContent: messageToDelete.content,
            author: messageToDelete.sender?.username || 'Unknown',
            isOwnMessage: String(messageToDelete.userId || messageToDelete.sender?.id) === String(userId)
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
            
            // Optimistically update UI first
            setMessages(prevMessages => 
                prevMessages.map(msg => 
                    msg.id === messageId 
                        ? { ...msg, content: '[deleted]', isDeleted: true } 
                        : msg
                )
            );
            
            if (!isTemporaryMessage) {
                // Real message - delete from database via new API endpoint
                const token = localStorage.getItem('token');
                const API_BASE_URL = window.location.origin;
                
                const response = await fetch(`${API_BASE_URL}/api/messages/delete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        messageId,
                        channelId: selectedChannel.id
                    })
                });
                
                const data = await response.json();
                
                if (!response.ok || !data.success) {
                    // Revert optimistic update on failure
                    const originalMessage = messages.find(msg => msg.id === messageId);
                    if (originalMessage) {
                        setMessages(prevMessages => 
                            prevMessages.map(msg => 
                                msg.id === messageId ? originalMessage : msg
                            )
                        );
                    }
                    throw new Error(data.message || 'Failed to delete message');
                }
                
                // Broadcast deletion via WebSocket if available
                if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
                    try {
                        window.wsConnection.send(JSON.stringify({
                            type: 'MESSAGE_DELETED',
                            channelId: selectedChannel.id,
                            messageId: messageId,
                            deletedAt: data.deletedAt
                        }));
                    } catch (wsError) {
                        console.warn('WebSocket broadcast failed:', wsError);
                    }
                }
            }
            
            // Update localStorage (mark as deleted for now; will remove after 5s)
            const storageKey = `community_messages_${selectedChannel.id}`;
            const storedMessages = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const updatedStored = storedMessages.map(msg => 
                msg.id === messageId 
                    ? { ...msg, content: '[deleted]', isDeleted: true }
                    : msg
            );
            localStorage.setItem(storageKey, JSON.stringify(updatedStored));
            
            // After 5 seconds remove the message from the list so other messages fill the gap
            setTimeout(() => {
                setMessages(prev => prev.filter(m => m.id !== messageId));
                try {
                    const current = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    const filtered = current.filter(m => m.id !== messageId);
                    localStorage.setItem(storageKey, JSON.stringify(filtered));
                } catch (e) { /* ignore */ }
            }, 5000);
            
            // Close modal
            setDeleteMessageModal(null);
        } catch (error) {
            console.error('Failed to delete message:', error);
            // Only show error if it's not a temporary message
            if (!(typeof messageId === 'string' && messageId.startsWith('temp_'))) {
                alert('Failed to delete message: ' + (error.message || 'Unknown error'));
            }
        } finally {
            setIsDeletingMessage(false);
        }
    };

    const cancelDeleteMessage = () => {
        setDeleteMessageModal(null);
    };

    // Group channels by category. Only include channels with canSee === true (FREE: General + Announcements only).
    // Do not render empty categories (e.g. no Trading or A7FX for FREE).
    const groupedChannels = useMemo(() => {
        const grouped = channelList.reduce((acc, channel) => {
            if (channel.canSee !== true) return acc;
            const category = channel.category || 'general';
            if (category.toLowerCase() === 'courses') return acc;
            if (!acc[category]) acc[category] = [];
            acc[category].push(channel);
            return acc;
        }, {});
        
        // Sort channels within each category by their order
        Object.keys(grouped).forEach(category => {
            const categoryOrder = channelOrder[category] || [];
            grouped[category].sort((a, b) => {
                const aIndex = categoryOrder.indexOf(a.id);
                const bIndex = categoryOrder.indexOf(b.id);
                // If both are in order, use order
                if (aIndex !== -1 && bIndex !== -1) {
                    return aIndex - bIndex;
                }
                // If only one is in order, prioritize it
                if (aIndex !== -1) return -1;
                if (bIndex !== -1) return 1;
                // If neither is in order, maintain current order (by name)
                return (a.name || '').localeCompare(b.name || '');
            });
        });
        
        return grouped;
    }, [channelList, channelOrder]);
    
    // Update category order when channels change
    useEffect(() => {
        const allCategories = Object.keys(groupedChannels);
        if (allCategories.length > 0) {
            const merged = [...categoryOrderState];
            allCategories.forEach(cat => {
                if (!merged.includes(cat)) {
                    merged.push(cat);
                }
            });
            if (merged.length !== categoryOrderState.length) {
                setCategoryOrderState(merged);
            }
        }
    }, [groupedChannels, categoryOrderState]);

    // CRITICAL: Comprehensive subscription check with multiple fallbacks
    // Priority: Admin > Premium Role > Active Subscription Status > Database Check > LocalStorage
    
    // Get user data from multiple sources for comprehensive check
    const storedUserDataForBanner = JSON.parse(localStorage.getItem('user') || '{}');
    const userRoleForBanner = (storedUser?.role || storedUserDataForBanner.role || 'free').toLowerCase();
    const subscriptionStatusForBanner = storedUser?.subscription_status || storedUserDataForBanner.subscription_status;
    const subscriptionPlanForBanner = storedUser?.subscription_plan || storedUserDataForBanner.subscription_plan;
    
    // Check if user is admin (use state variables which are more reliable, plus multiple checks)
    const isAdminForBanner = isAdminUser || isSuperAdminUser || 
        userRoleForBanner === 'admin' || 
        userRoleForBanner === 'super_admin' || 
        userRoleForBanner === 'ADMIN' ||
        subscriptionStatus?.isAdmin === true;
    
    // Check if user has premium access (role-based - this ALWAYS grants access)
    const hasPremiumRole = userRoleForBanner === 'premium' || 
        userRoleForBanner === 'a7fx' || 
        userRoleForBanner === 'elite' ||
        subscriptionStatus?.isPremium === true;
    
    // Check subscription status from database (if available)
    const hasActiveSubscriptionFromDB = subscriptionStatus 
        ? (subscriptionStatus.hasActiveSubscription && !subscriptionStatus.paymentFailed)
        : false;
    
    // Check subscription status from user object
    const hasActiveSubscriptionStatus = subscriptionStatusForBanner === 'active';
    
    // Fallback to local check
    const hasActiveSubscriptionLocal = checkSubscription();
    
    // User has access if ANY of these are true: admin, premium role, active subscription, OR hasCommunityAccess (e.g. free plan selected)
    // CRITICAL: Premium role and admin ALWAYS grant access. /api/subscription/status sets hasCommunityAccess true for free plan when plan is selected.
    const userHasAccess = isAdminForBanner || hasPremiumRole || hasActiveSubscriptionFromDB || hasActiveSubscriptionStatus || hasActiveSubscriptionLocal || hasCommunityAccessFromSubscription;
    
    // Only show subscribe banner if user doesn't have access AND is not admin/premium
    // CRITICAL: Never show banner to admins or premium role users
    const showSubscribeBanner = !isAdminForBanner && !hasPremiumRole && !userHasAccess && !paymentFailed;
    
    // Only show payment failed banner if user is not admin/premium and payment actually failed
    const showPaymentFailedBanner = !isAdminForBanner && !hasPremiumRole && paymentFailed && !hasActiveSubscriptionStatus;

    // Handle subscribe button click - show subscription selection modal
    const handleSubscribe = (requiredType = null) => {
        setRequiredSubscriptionType(requiredType); // 'premium' or 'a7fx' if coming from locked channel
        setShowSubscriptionModal(true);
    };

    // FREE plan: no Stripe – call API, refresh entitlements, go to /community
    const [selectingFreePlan, setSelectingFreePlan] = useState(false);
    const [subscriptionModalError, setSubscriptionModalError] = useState('');

    const handleSelectSubscription = async (planType) => {
        if (planType === 'free') {
            setSubscriptionModalError('');
            setSelectingFreePlan(true);
            try {
                const data = await Api.selectFreePlan();
                if (data && data.success) {
                    if (typeof localStorage !== 'undefined') localStorage.removeItem('community_channels_cache');
                    await refreshEntitlements();
                    await refreshSubscription();
                    await refreshChannelList();
                    setShowSubscriptionModal(false);
                    navigate('/community');
                    return;
                }
                setSubscriptionModalError('Could not activate Free plan. Please try again.');
            } catch (err) {
                console.error('Select FREE plan error:', err);
                setSubscriptionModalError(err.response?.data?.message || 'Could not activate Free plan. Please try again.');
            } finally {
                setSelectingFreePlan(false);
            }
            return;
        }

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userEmail = storedUser?.email;
        const STRIPE_PAYMENT_LINK_AURA = 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
        const STRIPE_PAYMENT_LINK_A7FX = 'https://buy.stripe.com/8x28wOcrq2XO3wX5zrdIA0k';
        const selectedPaymentLink = planType === 'a7fx' ? STRIPE_PAYMENT_LINK_A7FX : STRIPE_PAYMENT_LINK_AURA;
        const paymentLink = userEmail
            ? `${selectedPaymentLink}${selectedPaymentLink.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=${planType}`
            : `${selectedPaymentLink}${selectedPaymentLink.includes('?') ? '&' : '?'}plan=${planType}`;
        setShowSubscriptionModal(false);
        window.location.href = paymentLink;
    };

    // Render
    // Always render something to prevent white screen, even during initialization
    const hasToken = localStorage.getItem('token');
    
    if (!isAuthenticated && !hasToken) {
        // Show loading state instead of null to prevent white screen
    return (
            <div style={{ 
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: '#0a0a0a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
            }}>
                <CosmicBackground />
                <div style={{ color: '#fff', fontSize: '18px' }}>Loading...</div>
            </div>
        );
    }
    
    return (
        <div 
            className="community-container" 
            style={{ 
                position: 'fixed',
                background: '#36393f',
                height: 'calc(100vh - 60px)',
                maxHeight: 'calc(100vh - 60px)',
                minHeight: 'calc(100vh - 60px)',
                width: '100vw',
                maxWidth: '100vw'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <CosmicBackground />
            
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
                        onClick={() => handleSubscribe()}
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
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, #6D28D9 100%)',
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
                            Subscribe to access the community - Free monthly, Premium (£99/month), or Elite (£250/month)
                        </p>
                    </div>
                    <button
                        onClick={() => handleSubscribe()}
                        style={{
                            background: 'white',
                            color: '#6D28D9',
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
                        CHOOSE PLAN
                    </button>
                </div>
            )}
            
            {/* BLUR OVERLAY - Blur content when no subscription or payment failed */}
            {(showSubscribeBanner || showPaymentFailedBanner) && (
                <>
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 998,
                        pointerEvents: 'none',
                        overflow: 'hidden'
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
                            border: '2px solid rgba(255, 255, 255, 0.2)'
                        }}>
                            <div style={{ marginBottom: '20px' }}>
                                <span style={{ fontSize: '48px' }}>🔒</span>
                            </div>
                            <h2 style={{
                                color: '#ffffff',
                                fontSize: '24px',
                                fontWeight: 'bold',
                                marginBottom: '16px',
                                fontFamily: 'var(--font-main)'
                            }}>
                                Subscribe to Access Community
                            </h2>
                            <p style={{
                                color: 'rgba(255, 255, 255, 0.8)',
                                fontSize: '16px',
                                marginBottom: '24px',
                                lineHeight: '1.5',
                                fontFamily: 'var(--font-secondary)'
                            }}>
                                To access the community, you need to subscribe. Click here to subscribe and get 3 months free, then just £99/month.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button
                                    onClick={handleSubscribe}
                                    style={{
                                        background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '16px 32px',
                                        borderRadius: '12px',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        fontFamily: 'var(--font-main)',
                                        boxShadow: '0 4px 12px rgba(109, 40, 217, 0.4)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.transform = 'translateY(-2px)';
                                        e.target.style.boxShadow = '0 6px 16px rgba(109, 40, 217, 0.6)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.transform = 'translateY(0)';
                                        e.target.style.boxShadow = '0 4px 12px rgba(109, 40, 217, 0.4)';
                                    }}
                                >
                                    Subscribe Now
                                </button>
                                <button
                                    onClick={() => {
                                        // Redirect to contact page for manual activation
                                        window.location.href = '/contact';
                                    }}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        border: '1px solid rgba(255, 255, 255, 0.3)',
                                        padding: '12px 24px',
                                        borderRadius: '12px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        fontFamily: 'var(--font-main)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                                    }}
                                >
                                    I've Already Paid - Contact Support
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
            
            {/* MOBILE SIDEBAR TOGGLE BUTTON */}
            {isMobile && (
                <button
                    className="mobile-sidebar-toggle"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-label="Toggle channels"
                    style={{
                        position: 'fixed',
                        top: '80px',
                        left: '12px',
                        zIndex: 1002,
                        background: 'rgba(43, 45, 49, 0.95)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(43, 45, 49, 1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(43, 45, 49, 0.95)';
                    }}
                >
                    <FaBars size={18} />
                </button>
            )}
            
            {/* MOBILE OVERLAY - Dark backdrop when sidebar is open */}
            {isMobile && sidebarOpen && (
                <div
                    className="mobile-sidebar-overlay"
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 1000,
                        animation: 'fadeIn 0.2s ease'
                    }}
                />
            )}
            
            {/* LEFT SIDEBAR - CHANNELS */}
            <div 
                className={`community-sidebar ${isMobile ? 'mobile-sidebar' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}
                style={{
                    filter: (showSubscribeBanner || showPaymentFailedBanner) ? 'blur(8px)' : 'none',
                    pointerEvents: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto',
                    userSelect: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto',
                    overflow: 'hidden',
                    position: 'relative'
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Mobile sidebar header with close button */}
                {isMobile && (
                    <div className="mobile-sidebar-header" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        gap: '8px'
                    }}>
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff', flex: 1 }}>Channels</h2>
                        {(isAdminUser || isSuperAdminUser) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setChannelActionStatus(null);
                                    setShowChannelManager(true);
                                    setSidebarOpen(false); // Close sidebar when opening channel manager
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'rgba(139, 92, 246, 0.15)',
                                    border: '1px solid rgba(139, 92, 246, 0.4)',
                                    color: 'rgba(255, 255, 255, 0.9)',
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
                        <button
                            onClick={() => setSidebarOpen(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                padding: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                transition: 'background 0.2s ease',
                                marginLeft: '8px'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <FaChevronLeft size={18} />
                        </button>
                    </div>
                )}
                
                {/* Desktop sidebar header */}
                {!isMobile && (
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
                                    color: 'rgba(255, 255, 255, 0.15)',
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
                )}
                
                {/* Online Users Indicator - At top of sidebar */}
                <div style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'rgba(35, 165, 90, 0.08)',
                    flexShrink: 0
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#23A55A',
                                boxShadow: '0 0 6px rgba(35, 165, 90, 0.6)',
                                animation: 'pulse 2s ease-in-out infinite'
                            }} />
                            <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                Online Now
                            </span>
                        </div>
                        <span style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: '#23A55A'
                        }}>
                            {onlineCount}
                        </span>
                    </div>
                </div>
                
                <div className="channels-section" style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    minHeight: 0
                }}>
                    {categoryOrder.map(categoryName => {
                        const channels = groupedChannels[categoryName];
                        if (!channels || channels.length === 0) return null;
                        
                        const isCollapsed = collapsedCategories[categoryName];
                        const isAdminUser = getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'super_admin';
                        
                        return (
                            <div 
                                key={categoryName} 
                                className={`channel-category ${draggedCategory === categoryName ? 'dragging' : ''} ${draggedCategory && draggedCategory !== categoryName ? 'drag-over' : ''}`}
                                draggable={isSuperAdminUser}
                                onDragStart={(e) => {
                                    if (!isSuperAdminUser) {
                                        e.preventDefault();
                                        return;
                                    }
                                    setDraggedCategory(categoryName);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', categoryName);
                                    // Add visual feedback
                                    e.currentTarget.style.opacity = '0.5';
                                }}
                                onDragEnd={(e) => {
                                    // Reset visual feedback
                                    e.currentTarget.style.opacity = '1';
                                    setDraggedCategory(null);
                                }}
                                onDragOver={(e) => {
                                    if ((draggedCategory && draggedCategory !== categoryName) || draggedChannel) {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }
                                }}
                                onDragEnter={(e) => {
                                    if (draggedCategory && draggedCategory !== categoryName) {
                                        e.preventDefault();
                                    }
                                }}
                                onDrop={async (e) => {
                                    // Only superadmin can drop
                                    if (!isSuperAdminUser) {
                                        e.preventDefault();
                                        return;
                                    }
                                    
                                    // Check if a channel is being dropped on category header
                                    if (draggedChannel && !draggedCategory) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        
                                        // Move channel to this category
                                        try {
                                            const response = await fetch(`/api/community/channels`, {
                                                method: 'PUT',
                                                headers: {
                                                    'Content-Type': 'application/json'
                                                },
                                                body: JSON.stringify({
                                                    id: draggedChannel,
                                                    category: categoryName
                                                })
                                            });
                                            
                                            if (response.ok) {
                                                // Refresh channel list to show updated category
                                                const refreshResponse = await fetch('/api/community/channels');
                                                if (refreshResponse.ok) {
                                                    const data = await refreshResponse.json();
                                                    if (data.success && Array.isArray(data.channels)) {
                                                        setChannelList(data.channels);
                                                    }
                                                }
                                                setDraggedChannel(null);
                                            } else {
                                                console.error('Failed to move channel to category:', await response.text());
                                            }
                                        } catch (error) {
                                            console.error('Error moving channel to category:', error);
                                        }
                                        return;
                                    }
                                    
                                    // Handle category reordering
                                    if (draggedCategory && draggedCategory !== categoryName) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Reorder categories - update backend and state
                                        const currentOrder = [...categoryOrder];
                                        const draggedIndex = currentOrder.indexOf(draggedCategory);
                                        const dropIndex = currentOrder.indexOf(categoryName);
                                        if (draggedIndex !== -1 && dropIndex !== -1) {
                                            currentOrder.splice(draggedIndex, 1);
                                            currentOrder.splice(dropIndex, 0, draggedCategory);
                                            setCategoryOrderState(currentOrder);
                                            saveCategoryOrder(currentOrder);
                                            setDraggedCategory(null);
                                        }
                                    }
                                }}
                            >
                                <div 
                                    className="category-header"
                                    onClick={(e) => {
                                        // Don't toggle collapse if we're dragging
                                        if (draggedCategory) {
                                            e.stopPropagation();
                                            return;
                                        }
                                        setCollapsedCategories(prev => {
                                            const updated = { ...prev, [categoryName]: !prev[categoryName] };
                                            localStorage.setItem('collapsedCategories', JSON.stringify(updated));
                                            return updated;
                                        });
                                    }}
                                    onMouseDown={(e) => {
                                        // Prevent text selection while dragging
                                        if (draggedCategory) {
                                            e.preventDefault();
                                        }
                                    }}
                                >
                                    <span className={`category-chevron ${isCollapsed ? 'collapsed' : ''}`}>▼</span>
                                    <span className="category-icon">{getCategoryIcon(categoryName)}</span>
                                    <h3 className="category-title">{formatCategoryName(categoryName)}</h3>
                                    <span className="category-count">{channels.length}</span>
                                </div>
                                
                                {!isCollapsed && (
                                <ul className="channels-list">
                                    {channels.map((channel, channelIndex) => {
                                        // Only hide admin-only channels from non-admins
                                        // All other channels are visible to everyone
                                        const canAccess = channel.canSee !== false;
                                        const accessLevel = (channel.accessLevel || 'open').toLowerCase();
                                        const isAdminOnly = accessLevel === 'admin-only';
                                        if (!canAccess) return null;
                                        const isActive = selectedChannel?.id === channel.id;
                                        const badge = channelBadges[channel.id] || { unread: 0, mentions: 0 };
                                        const hasUnread = badge.unread > 0;
                                        const hasMentions = badge.mentions > 0;
                                        const isLocked = channel.locked === true || channel.canWrite === false;
                                        const isDragging = draggedChannel === channel.id;
                                        
                                        // Determine subscription requirement message
                                        let subscriptionRequirement = '';
                                        if (isLocked) {
                                            if (accessLevel === 'premium') {
                                                subscriptionRequirement = 'Premium';
                                            } else if (accessLevel === 'a7fx' || accessLevel === 'elite') {
                                                subscriptionRequirement = 'A7FX Elite';
                                            }
                                        }
                                        
                                        const isDragOver = dragOverChannel === channel.id;
                                        const showDropAbove = isDragOver && dragPosition === 'above';
                                        const showDropBelow = isDragOver && dragPosition === 'below';
                                        
                                        return (
                                            <React.Fragment key={channel.id}>
                                                {/* Drop zone above first channel */}
                                                {channelIndex === 0 && (
                                                    <li
                                                        className={`drop-zone ${draggedChannel && draggedChannel !== channel.id && !isLocked ? 'drop-zone-active' : ''} ${showDropAbove && channelIndex === 0 ? 'drop-zone-highlight' : ''}`}
                                                        onDragOver={(e) => {
                                                            if (draggedChannel && draggedChannel !== channel.id && !isLocked) {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                e.dataTransfer.dropEffect = 'move';
                                                                setDragOverChannel(channel.id);
                                                                setDragPosition('above');
                                                            }
                                                        }}
                                                        onDragLeave={(e) => {
                                                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                                                if (dragOverChannel === channel.id && dragPosition === 'above') {
                                                                    setDragOverChannel(null);
                                                                    setDragPosition(null);
                                                                }
                                                            }
                                                        }}
                                                        onDrop={async (e) => {
                                                            // Only superadmin can drop
                                                            if (!isSuperAdminUser) {
                                                                e.preventDefault();
                                                                return;
                                                            }
                                                            
                                                            if (draggedChannel && draggedChannel !== channel.id && !isLocked) {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                
                                                                const draggedChannelObj = channelList.find(c => c.id === draggedChannel);
                                                                const sourceCategory = draggedChannelObj?.category || 'general';
                                                                
                                                                if (sourceCategory === categoryName) {
                                                                    const currentOrder = channelOrder[categoryName] || channels.map(c => c.id);
                                                                    const draggedIndex = currentOrder.indexOf(draggedChannel);
                                                                    const dropIndex = 0;
                                                                    
                                                                    if (draggedIndex !== -1 && draggedIndex !== dropIndex) {
                                                                        const newOrder = [...currentOrder];
                                                                        newOrder.splice(draggedIndex, 1);
                                                                        newOrder.splice(0, 0, draggedChannel);
                                                                        await saveChannelOrder(categoryName, newOrder);
                                                                        setDraggedChannel(null);
                                                                        setDragOverChannel(null);
                                                                        setDragPosition(null);
                                                                    }
                                                                } else {
                                                                    try {
                                                                        const response = await fetch(`/api/community/channels`, {
                                                                            method: 'PUT',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ id: draggedChannel, category: categoryName })
                                                                        });
                                                                        
                                                                        if (response.ok) {
                                                                            const refreshResponse = await fetch('/api/community/channels');
                                                                            if (refreshResponse.ok) {
                                                                                const data = await refreshResponse.json();
                                                                                if (data.success && Array.isArray(data.channels)) {
                                                                                    setChannelList(data.channels);
                                                                                }
                                                                            }
                                                                            setDraggedChannel(null);
                                                                            setDragOverChannel(null);
                                                                            setDragPosition(null);
                                                                        }
                                                                    } catch (error) {
                                                                        console.error('Error moving channel:', error);
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                    />
                                                )}
                                                
                                                {/* Channel item */}
                                                <li 
                                                    className={`channel-item ${isActive ? 'active' : ''} ${hasUnread || hasMentions ? 'unread' : ''} ${isLocked ? 'locked' : ''} ${isDragging ? 'dragging' : ''} ${showDropAbove ? 'drop-above' : ''} ${showDropBelow ? 'drop-below' : ''}`}
                                                    draggable={!isLocked && isSuperAdminUser}
                                                    onContextMenu={(e) => {
                                                        if (!isSuperAdminUser) return;
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setChannelContextMenu({
                                                            x: e.clientX,
                                                            y: e.clientY,
                                                            channelId: channel.id,
                                                            channel: channel
                                                        });
                                                    }}
                                                    onDragStart={(e) => {
                                                        if (isLocked || !isSuperAdminUser) {
                                                            e.preventDefault();
                                                            return;
                                                        }
                                                        setDraggedChannel(channel.id);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        e.dataTransfer.setData('text/plain', channel.id);
                                                        e.currentTarget.style.opacity = '0.4';
                                                        e.currentTarget.style.transform = 'scale(0.98)';
                                                    }}
                                                    onDragEnd={(e) => {
                                                        e.currentTarget.style.opacity = '';
                                                        e.currentTarget.style.transform = '';
                                                        setDraggedChannel(null);
                                                        setDragOverChannel(null);
                                                        setDragPosition(null);
                                                    }}
                                                    onDragOver={(e) => {
                                                        if (draggedChannel && draggedChannel !== channel.id && !isLocked) {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            e.dataTransfer.dropEffect = 'move';
                                                            
                                                            // Determine if we're in the top or bottom half of the channel
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const y = e.clientY - rect.top;
                                                            const midpoint = rect.height / 2;
                                                            
                                                            if (y < midpoint) {
                                                                setDragOverChannel(channel.id);
                                                                setDragPosition('above');
                                                            } else {
                                                                setDragOverChannel(channel.id);
                                                                setDragPosition('below');
                                                            }
                                                        }
                                                    }}
                                                    onDragLeave={(e) => {
                                                        // Only clear if we're actually leaving the channel item
                                                        if (!e.currentTarget.contains(e.relatedTarget)) {
                                                            if (dragOverChannel === channel.id) {
                                                                setDragOverChannel(null);
                                                                setDragPosition(null);
                                                            }
                                                        }
                                                    }}
                                                    onDrop={async (e) => {
                                                        // Only superadmin can drop
                                                        if (!isSuperAdminUser) {
                                                            e.preventDefault();
                                                            return;
                                                        }
                                                        
                                                        if (draggedChannel && draggedChannel !== channel.id && !isLocked) {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            
                                                            const draggedChannelObj = channelList.find(c => c.id === draggedChannel);
                                                            const sourceCategory = draggedChannelObj?.category || 'general';
                                                            
                                                            if (sourceCategory === categoryName) {
                                                                const currentOrder = channelOrder[categoryName] || channels.map(c => c.id);
                                                                const draggedIndex = currentOrder.indexOf(draggedChannel);
                                                                const dropIndex = currentOrder.indexOf(channel.id);
                                                                
                                                                if (draggedIndex !== -1 && dropIndex !== -1 && draggedIndex !== dropIndex) {
                                                                    const newOrder = [...currentOrder];
                                                                    newOrder.splice(draggedIndex, 1);
                                                                    // Insert based on drag position
                                                                    let insertIndex = dropIndex;
                                                                    if (dragPosition === 'below') {
                                                                        insertIndex = dropIndex + 1;
                                                                    } else if (dragPosition === 'above') {
                                                                        insertIndex = dropIndex;
                                                                    }
                                                                    // Adjust if dragging from before the drop position
                                                                    if (draggedIndex < insertIndex) {
                                                                        insertIndex--;
                                                                    }
                                                                    newOrder.splice(insertIndex, 0, draggedChannel);
                                                                    await saveChannelOrder(categoryName, newOrder);
                                                                    setDraggedChannel(null);
                                                                    setDragOverChannel(null);
                                                                    setDragPosition(null);
                                                                }
                                                            } else {
                                                                // Move to different category
                                                                try {
                                                                    const response = await fetch(`/api/community/channels`, {
                                                                        method: 'PUT',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ id: draggedChannel, category: categoryName })
                                                                    });
                                                                    
                                                                    if (response.ok) {
                                                                        const refreshResponse = await fetch('/api/community/channels');
                                                                        if (refreshResponse.ok) {
                                                                            const data = await refreshResponse.json();
                                                                            if (data.success && Array.isArray(data.channels)) {
                                                                                setChannelList(data.channels);
                                                                            }
                                                                        }
                                                                        setDraggedChannel(null);
                                                                        setDragOverChannel(null);
                                                                        setDragPosition(null);
                                                                    }
                                                                } catch (error) {
                                                                    console.error('Error moving channel:', error);
                                                                }
                                                            }
                                                        }
                                                    }}
                                                    onClick={() => {
                                                        if (isLocked) {
                                                            const currentRole = getCurrentUserRole();
                                                            setLockedChannelInfo({
                                                                channelName: channel.displayName || channel.name,
                                                                accessLevel: accessLevel,
                                                                subscriptionRequirement: subscriptionRequirement,
                                                                currentRole: currentRole
                                                            });
                                                            setShowChannelAccessModal(true);
                                                            return;
                                                        }
                                                        setSelectedChannel(channel);
                                                    }}
                                                style={{ 
                                                        cursor: isLocked ? 'not-allowed' : ((isAdminUser || isSuperAdminUser) ? 'grab' : 'pointer'),
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                        gap: '8px',
                                                        transition: 'all 0.2s ease',
                                                        opacity: isLocked ? 0.6 : (isDragging ? 0.4 : 1),
                                                        transform: isDragging ? 'scale(0.98)' : 'scale(1)'
                                                }}
                                                    title={isLocked ? `🔒 Requires ${subscriptionRequirement} subscription - Click to subscribe` : ((isAdminUser || isSuperAdminUser) ? 'Drag to reorder' : '')}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                    <span className="channel-icon">
                                                        {getChannelIcon(channel)}
                                                    </span>
                                                    <span className="channel-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {channel.displayName || channel.name}
                                                    </span>
                                                </span>
                                                {(hasUnread || hasMentions) && (
                                                    <span className="channel-badge" style={{
                                                        minWidth: '20px',
                                                        height: '20px',
                                                        borderRadius: '10px',
                                                        background: hasMentions 
                                                            ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                                                            : 'linear-gradient(135deg, var(--purple-primary), var(--purple-dark))',
                                                        color: 'white',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        padding: '0 6px',
                                                        boxShadow: hasMentions 
                                                            ? '0 0 10px rgba(239, 68, 68, 0.5)' 
                                                            : '0 0 8px rgba(255, 255, 255, 0.3)'
                                                    }}>
                                                        {hasMentions ? badge.mentions : badge.unread > 99 ? '99+' : badge.unread}
                                                    </span>
                                                )}
                                            </li>
                                            
                                            {/* Drop zone below channel */}
                                            <li
                                                className={`drop-zone ${showDropBelow ? 'drop-zone-highlight' : ''}`}
                                                onDragOver={(e) => {
                                                    if (draggedChannel && draggedChannel !== channel.id && !isLocked) {
                                                        e.preventDefault();
                                                            e.stopPropagation();
                                                        e.dataTransfer.dropEffect = 'move';
                                                        setDragOverChannel(channel.id);
                                                        setDragPosition('below');
                                                    }
                                                }}
                                                onDragLeave={(e) => {
                                                    if (!e.currentTarget.contains(e.relatedTarget)) {
                                                        if (dragOverChannel === channel.id && dragPosition === 'below') {
                                                            setDragOverChannel(null);
                                                            setDragPosition(null);
                                                        }
                                                    }
                                                }}
                                                onDrop={async (e) => {
                                                    // Only superadmin can drop
                                                    if (!isSuperAdminUser) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    
                                                    if (draggedChannel && draggedChannel !== channel.id && !isLocked) {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        
                                                        const draggedChannelObj = channelList.find(c => c.id === draggedChannel);
                                                        const sourceCategory = draggedChannelObj?.category || 'general';
                                                        
                                                        if (sourceCategory === categoryName) {
                                                            const currentOrder = channelOrder[categoryName] || channels.map(c => c.id);
                                                            const draggedIndex = currentOrder.indexOf(draggedChannel);
                                                            const dropIndex = currentOrder.indexOf(channel.id);
                                                            
                                                            if (draggedIndex !== -1 && dropIndex !== -1 && draggedIndex !== dropIndex) {
                                                                const newOrder = [...currentOrder];
                                                                newOrder.splice(draggedIndex, 1);
                                                                const newDropIndex = dropIndex > draggedIndex ? dropIndex : dropIndex + 1;
                                                                newOrder.splice(newDropIndex, 0, draggedChannel);
                                                                await saveChannelOrder(categoryName, newOrder);
                                                                setDraggedChannel(null);
                                                                setDragOverChannel(null);
                                                                setDragPosition(null);
                                                            }
                                                        } else {
                                                            try {
                                                                const response = await fetch(`/api/community/channels`, {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ id: draggedChannel, category: categoryName })
                                                                });
                                                                
                                                                if (response.ok) {
                                                                    const refreshResponse = await fetch('/api/community/channels');
                                                                    if (refreshResponse.ok) {
                                                                        const data = await refreshResponse.json();
                                                                        if (data.success && Array.isArray(data.channels)) {
                                                                            setChannelList(data.channels);
                                                                        }
                                                                    }
                                                                    setDraggedChannel(null);
                                                                    setDragOverChannel(null);
                                                                    setDragPosition(null);
                                                                }
                                                            } catch (error) {
                                                                console.error('Error moving channel:', error);
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        </React.Fragment>
                                        );
                                    })}
                                </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
                
                {/* User Profile at Bottom - Clickable */}
                <div 
                    className="sidebar-footer profile-card-clickable" 
                    style={{
                        padding: '12px 16px',
                        borderTop: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        borderRadius: '8px 8px 0 0'
                    }}
                    onClick={async () => {
                        if (storedUser?.id) {
                            // Fetch profile data for modal
                            try {
                                const baseUrl = window.location.origin;
                                const response = await fetch(`${baseUrl}/api/users/public-profile/${storedUser.id}`);
                                if (response.ok) {
                                    const data = await response.json();
                                    setProfileModalData(data);
                                    setShowProfileModal(true);
                                } else {
                                    // Fallback to current user data
                                    setProfileModalData(storedUser);
                                    setShowProfileModal(true);
                                }
                            } catch (error) {
                                console.error('Error fetching profile:', error);
                                // Use current user data as fallback
                                setProfileModalData(storedUser);
                                setShowProfileModal(true);
                            }
                        }
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-primary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        {/* Avatar with image or initials */}
                        <div style={{ position: 'relative', width: '40px', height: '40px', flexShrink: 0 }}>
                            {storedUser?.avatar && storedUser.avatar !== 'avatar_ai.png' && !storedUser.avatar.includes('avatar_ai') ? (
                                <img 
                                    src={storedUser.avatar.startsWith('data:image') 
                                        ? storedUser.avatar 
                                        : storedUser.avatar.startsWith('/')
                                        ? storedUser.avatar
                                        : `/avatars/${storedUser.avatar}`}
                                    alt="Avatar"
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '2px solid rgba(139, 92, 246, 0.5)',
                                        boxShadow: '0 0 15px rgba(139, 92, 246, 0.3)',
                                        display: 'block'
                                    }}
                                    onError={(e) => {
                                        // If image fails to load, show initials instead
                                        e.target.style.display = 'none';
                                        const initialsDiv = e.target.parentElement.querySelector('.avatar-initials');
                                        if (initialsDiv) {
                                            initialsDiv.style.display = 'flex';
                                        }
                                    }}
                                />
                            ) : null}
                            <div 
                                className="avatar-initials"
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    background: (storedUser?.avatar && storedUser.avatar !== 'avatar_ai.png' && !storedUser.avatar.includes('avatar_ai')) 
                                        ? 'transparent' 
                                        : 'linear-gradient(135deg, var(--purple-primary), var(--purple-dark))',
                                    display: (storedUser?.avatar && storedUser.avatar !== 'avatar_ai.png' && !storedUser.avatar.includes('avatar_ai')) 
                                        ? 'none' 
                                        : 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: 'white',
                                    position: storedUser?.avatar && storedUser.avatar !== 'avatar_ai.png' ? 'absolute' : 'relative',
                                    top: 0,
                                    left: 0
                                }}
                            >
                                {(storedUser?.username || storedUser?.name || 'U').substring(0, 2).toUpperCase()}
                            </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ 
                                fontWeight: 600, 
                                fontSize: '0.9rem',
                                color: 'white',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginBottom: '2px'
                            }}>
                                {storedUser?.username || storedUser?.name || 'User'}
                            </div>
                            <div style={{ 
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.7)',
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center'
                            }}>
                                <span style={{ 
                                    fontWeight: 600,
                                    color: '#C4B5FD'
                                }}>Level {userLevel}</span>
                                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>•</span>
                                <span style={{ 
                                    fontWeight: 600,
                                    color: '#A78BFA'
                                }}>{Math.floor(storedUser?.xp || 0).toLocaleString()} XP</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* MAIN CHAT AREA */}
            <div className="chat-main" style={{
                filter: (showSubscribeBanner || showPaymentFailedBanner) ? 'blur(8px)' : 'none',
                pointerEvents: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto',
                userSelect: (showSubscribeBanner || showPaymentFailedBanner) ? 'none' : 'auto',
                position: 'relative',
                background: '#36393f',
                width: '100%',
                maxWidth: '100%'
            }}>
                {selectedChannel ? (
                    <>
                        {/* Check if user can access this channel */}
                        {selectedChannel?.canSee === false ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                padding: '40px',
                                textAlign: 'center',
                                background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%)',
                                borderRadius: '16px',
                                border: '2px solid rgba(139, 92, 246, 0.3)',
                                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.2)'
                            }}>
                                <div style={{ 
                                    fontSize: '64px', 
                                    marginBottom: '24px',
                                    filter: 'drop-shadow(0 0 10px rgba(139, 92, 246, 0.5))'
                                }}>🔒</div>
                                <h2 style={{ 
                                    color: '#fff', 
                                    marginBottom: '12px',
                                    fontSize: '28px',
                                    fontWeight: 'bold'
                                }}>
                                    Subscription Required
                                </h2>
                                <p style={{
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    fontSize: '16px',
                                    marginBottom: '32px'
                                }}>
                                    #{selectedChannel.displayName || selectedChannel.name}
                                </p>
                                {(() => {
                                    const accessLevel = (selectedChannel.accessLevel || 'open').toLowerCase();
                                    const currentRole = getCurrentUserRole();
                                    let subscriptionType = '';
                                    let price = '';
                                    
                                    if (accessLevel === 'premium') {
                                        subscriptionType = 'Aura FX Premium';
                                        price = '£99/month';
                                    } else if (accessLevel === 'a7fx' || accessLevel === 'elite') {
                                        subscriptionType = 'A7FX Elite';
                                        price = '£250/month';
                                    }
                                    
                                    return (
                                        <>
                                            <div style={{
                                                background: 'rgba(139, 92, 246, 0.1)',
                                                borderRadius: '12px',
                                                padding: '24px',
                                                marginBottom: '24px',
                                                maxWidth: '500px',
                                                width: '100%',
                                                border: '1px solid rgba(139, 92, 246, 0.3)'
                                            }}>
                                                <p style={{ 
                                                    color: '#fff', 
                                                    marginBottom: '20px',
                                                    fontSize: '16px',
                                                    lineHeight: '1.6'
                                                }}>
                                                    This channel requires an <strong style={{ color: '#8B5CF6' }}>{subscriptionType}</strong> subscription ({price}) to access.
                                                </p>
                                                
                                                {accessLevel === 'premium' ? (
                                                    currentRole === 'free' ? (
                                                        <div style={{
                                                            background: 'rgba(251, 191, 36, 0.1)',
                                                            borderRadius: '8px',
                                                            padding: '16px',
                                                            border: '1px solid rgba(251, 191, 36, 0.3)'
                                                        }}>
                                                            <p style={{
                                                                color: '#fbbf24',
                                                                fontSize: '14px',
                                                                margin: '0 0 8px 0',
                                                                fontWeight: '600'
                                                            }}>
                                                                Your Status: Free User
                                                            </p>
                                                            <p style={{
                                                                color: 'rgba(255, 255, 255, 0.8)',
                                                                fontSize: '14px',
                                                                margin: 0
                                                            }}>
                                                                Upgrade to Premium to unlock this channel and access exclusive trading content.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            background: 'rgba(139, 92, 246, 0.2)',
                                                            borderRadius: '8px',
                                                            padding: '16px',
                                                            border: '1px solid rgba(139, 92, 246, 0.4)'
                                                        }}>
                                                            <p style={{
                                                                color: '#A78BFA',
                                                                fontSize: '14px',
                                                                margin: '0 0 8px 0',
                                                                fontWeight: '600'
                                                            }}>
                                                                Your Status: Premium User
                                                            </p>
                                                            <p style={{
                                                                color: 'rgba(255, 255, 255, 0.8)',
                                                                fontSize: '14px',
                                                                margin: 0
                                                            }}>
                                                                Your subscription may be inactive or expired. Please check your subscription status or renew to access this channel.
                                                            </p>
                                                        </div>
                                                    )
                                                ) : (
                                                    currentRole === 'free' ? (
                                                        <div style={{
                                                            background: 'rgba(251, 191, 36, 0.1)',
                                                            borderRadius: '8px',
                                                            padding: '16px',
                                                            border: '1px solid rgba(251, 191, 36, 0.3)'
                                                        }}>
                                                            <p style={{
                                                                color: '#fbbf24',
                                                                fontSize: '14px',
                                                                margin: '0 0 8px 0',
                                                                fontWeight: '600'
                                                            }}>
                                                                Your Status: Free User
                                                            </p>
                                                            <p style={{
                                                                color: 'rgba(255, 255, 255, 0.8)',
                                                                fontSize: '14px',
                                                                margin: 0
                                                            }}>
                                                                Upgrade to A7FX Elite to unlock this channel and access the most exclusive trading content and signals.
                                                            </p>
                                                        </div>
                                                    ) : currentRole === 'premium' ? (
                                                        <div style={{
                                                            background: 'rgba(139, 92, 246, 0.2)',
                                                            borderRadius: '8px',
                                                            padding: '16px',
                                                            border: '1px solid rgba(139, 92, 246, 0.4)'
                                                        }}>
                                                            <p style={{
                                                                color: '#A78BFA',
                                                                fontSize: '14px',
                                                                margin: '0 0 8px 0',
                                                                fontWeight: '600'
                                                            }}>
                                                                Your Status: Premium User
                                                            </p>
                                                            <p style={{
                                                                color: 'rgba(255, 255, 255, 0.8)',
                                                                fontSize: '14px',
                                                                margin: 0
                                                            }}>
                                                                This channel requires A7FX Elite. Upgrade from Premium to Elite to access the most exclusive content.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            background: 'rgba(251, 191, 36, 0.1)',
                                                            borderRadius: '8px',
                                                            padding: '16px',
                                                            border: '1px solid rgba(251, 191, 36, 0.3)'
                                                        }}>
                                                            <p style={{
                                                                color: '#fbbf24',
                                                                fontSize: '14px',
                                                                margin: '0 0 8px 0',
                                                                fontWeight: '600'
                                                            }}>
                                                                Your Status: A7FX Elite User
                                                            </p>
                                                            <p style={{
                                                                color: 'rgba(255, 255, 255, 0.8)',
                                                                fontSize: '14px',
                                                                margin: 0
                                                            }}>
                                                                Your subscription may be inactive or expired. Please check your subscription status or renew to access this channel.
                                                            </p>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleSubscribe(accessLevel === 'premium' ? 'premium' : 'a7fx')}
                                                style={{
                                                    background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '14px 32px',
                                                    borderRadius: '8px',
                                                    fontSize: '16px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.3s ease',
                                                    boxShadow: '0 4px 12px rgba(139, 92, 234, 0.4)'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 234, 0.6)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 234, 0.4)';
                                                }}
                                            >
                                                Subscribe Now - {price}
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                    <>
                        {/* Chat Header */}
                        <div className="chat-header">
                            {isMobile && (
                                <button
                                    className="mobile-back-button"
                                    onClick={() => setSidebarOpen(true)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#ffffff',
                                        fontSize: '1.25rem',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        marginRight: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <FaBars />
                                </button>
                            )}
                            <h2>
                                {selectedChannel.displayName || selectedChannel.name}
                            </h2>
                        </div>
                        
                        {/* Messages */}
                        <div className="chat-messages">
                            {messages.length === 0 ? (
                                <div className="empty-state">
                                    <h3>
                                        {isWelcomeChannel
                                            ? 'Welcome to AURA FX'
                                            : `Welcome to #${selectedChannel?.displayName || selectedChannel?.name}`}
                                    </h3>
                                    <p>
                                        {isWelcomeChannel
                                            ? 'Read the rules above and click the checkmark below to unlock your channels.'
                                            : (() => {
                                                const desc = (selectedChannel?.description || '').replace(/glitch/gi, 'AURA FX').trim();
                                                return desc || 'No messages yet. Be the first to start the conversation!';
                                            })()}
                                    </p>
                                    {isWelcomeChannel && (entitlements?.needsOnboardingReaccept || !hasReadWelcome) && (
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            style={{
                                                marginTop: '24px',
                                                padding: '16px 24px',
                                                background: 'rgba(99, 102, 241, 0.15)',
                                                borderRadius: '10px',
                                                border: '2px solid rgba(99, 102, 241, 0.4)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                fontWeight: 600,
                                                color: '#fff'
                                            }}
                                            onClick={handleWelcomeAcknowledgment}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleWelcomeAcknowledgment(); } }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)';
                                                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                                                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                                            }}
                                        >
                                            <span style={{ fontSize: '1.5rem' }}>✅</span>
                                            <span>I've read and agree to the rules – unlock my channels</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                messages.map((message, index) => {
                                    // Check if this message is from the same sender as the previous one (grouping)
                                    const prevMessage = index > 0 ? messages[index - 1] : null;
                                    const isGrouped = prevMessage && 
                                        prevMessage.sender?.username === message.sender?.username &&
                                        !message.isWelcomeMessage &&
                                        !prevMessage.isWelcomeMessage &&
                                        // Group if messages are within 5 minutes
                                        (new Date(message.timestamp || message.created_at) - new Date(prevMessage.timestamp || prevMessage.created_at)) < 300000;
                                    
                                    return (
                                        <div 
                                            key={message.id || index}
                                            id={`message-${message.id}`}
                                            className={`message-item ${isGrouped ? 'grouped' : ''}`}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setContextMenu({
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                    messageId: message.id
                                                });
                                            }}
                                            onTouchStart={(e) => {
                                                // Long press for touch devices
                                                if (!e.currentTarget) return;
                                                
                                                const touch = e.touches[0];
                                                if (!touch) return;
                                                
                                                const startX = touch.clientX;
                                                const startY = touch.clientY;
                                                const messageId = message.id;
                                                const targetElement = e.currentTarget;
                                                
                                                const longPressTimer = setTimeout(() => {
                                                    // Show context menu on long press
                                                    setContextMenu({
                                                        x: startX,
                                                        y: startY,
                                                        messageId: messageId
                                                    });
                                                    // Prevent default touch behavior only if cancelable
                                                    if (e.cancelable) {
                                                        e.preventDefault();
                                                    }
                                                }, 500); // 500ms long press
                                                
                                                // Store timer on element for cleanup
                                                targetElement._longPressTimer = longPressTimer;
                                                
                                                // Clean up on touch end/move
                                                const handleTouchEnd = () => {
                                                    if (targetElement && targetElement._longPressTimer) {
                                                        clearTimeout(targetElement._longPressTimer);
                                                        targetElement._longPressTimer = null;
                                                    }
                                                    document.removeEventListener('touchend', handleTouchEnd);
                                                    document.removeEventListener('touchmove', handleTouchMove);
                                                };
                                                
                                                const handleTouchMove = (moveEvent) => {
                                                    const moveTouch = moveEvent.touches[0] || moveEvent.changedTouches[0];
                                                    if (!moveTouch) return;
                                                    
                                                    const moveX = moveTouch.clientX;
                                                    const moveY = moveTouch.clientY;
                                                    
                                                    // Cancel long press if user moved too much
                                                    if (Math.abs(moveX - startX) > 10 || Math.abs(moveY - startY) > 10) {
                                                        if (targetElement && targetElement._longPressTimer) {
                                                            clearTimeout(targetElement._longPressTimer);
                                                            targetElement._longPressTimer = null;
                                                        }
                                                    }
                                                };
                                                
                                                document.addEventListener('touchend', handleTouchEnd, { once: true, passive: true });
                                                document.addEventListener('touchmove', handleTouchMove, { once: true, passive: true });
                                            }}
                                            onTouchEnd={(e) => {
                                                // Clean up any pending long press timer
                                                if (e.currentTarget && e.currentTarget._longPressTimer) {
                                                    clearTimeout(e.currentTarget._longPressTimer);
                                                    e.currentTarget._longPressTimer = null;
                                                }
                                            }}
                                            style={{ cursor: 'context-menu' }}
                                        >
                                            {!isGrouped && (
                                                <div 
                                                    className="message-avatar" 
                                                    onClick={async () => {
                                                        const userId = message.sender?.id || message.userId;
                                                        if (userId) {
                                                            try {
                                                                const baseUrl = window.location.origin;
                                                                const response = await fetch(`${baseUrl}/api/users/public-profile/${userId}`);
                                                                if (response.ok) {
                                                                    const data = await response.json();
                                                                    setProfileModalData(data);
                                                                    setShowProfileModal(true);
                                                                } else {
                                                                    // Fallback to sender data
                                                                    setProfileModalData(message.sender || { id: userId });
                                                                    setShowProfileModal(true);
                                                                }
                                                            } catch (error) {
                                                                console.error('Error fetching profile:', error);
                                                                setProfileModalData(message.sender || { id: userId });
                                                                setShowProfileModal(true);
                                                            }
                                                        }
                                                    }}
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        borderRadius: '50%',
                                                        overflow: 'hidden',
                                                        flexShrink: 0,
                                                        background: 'linear-gradient(135deg, var(--purple-primary), var(--purple-dark))',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'white',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.875rem',
                                                        cursor: 'pointer',
                                                        transition: 'transform 0.2s ease, opacity 0.2s ease',
                                                        position: 'absolute',
                                                        left: '16px',
                                                        top: '0.125rem',
                                                        zIndex: 1
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'scale(1.1)';
                                                        e.currentTarget.style.opacity = '0.9';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                        e.currentTarget.style.opacity = '1';
                                                    }}
                                                >
                                                    {message.sender?.avatar && message.sender.avatar !== '/avatars/avatar_ai.png' ? (
                                                        <img 
                                                            src={message.sender.avatar} 
                                                            alt={message.sender?.username || 'User'}
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                objectFit: 'cover'
                                                            }}
                                                            onError={(e) => {
                                                                // Fallback to initials if image fails to load
                                                                e.target.style.display = 'none';
                                                                e.target.parentElement.textContent = (message.sender?.username || 'U').substring(0, 2).toUpperCase();
                                                            }}
                                                        />
                                                    ) : (
                                                        <span>{(message.sender?.username || 'U').substring(0, 2).toUpperCase()}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="message-content">
                                                {!isGrouped && (
                                                    <div className="message-header-info" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', flexWrap: 'wrap' }}>
                                                            <span 
                                                                className="message-author"
                                                                onClick={async () => {
                                                                    const userId = message.sender?.id || message.userId;
                                                                    if (userId) {
                                                                        try {
                                                                            const baseUrl = window.location.origin;
                                                                            const response = await fetch(`${baseUrl}/api/users/public-profile/${userId}`);
                                                                            if (response.ok) {
                                                                                const data = await response.json();
                                                                                setProfileModalData(data);
                                                                                setShowProfileModal(true);
                                                                            } else {
                                                                                setProfileModalData(message.sender || { id: userId });
                                                                                setShowProfileModal(true);
                                                                            }
                                                                        } catch (error) {
                                                                            console.error('Error fetching profile:', error);
                                                                            setProfileModalData(message.sender || { id: userId });
                                                                            setShowProfileModal(true);
                                                                        }
                                                                    }
                                                                }}
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    transition: 'color 0.2s ease',
                                                                    fontWeight: 500
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.textDecoration = 'underline';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.textDecoration = 'none';
                                                                }}
                                                            >
                                                                {message.sender?.username || 'Unknown'}
                                                            </span>
                                                            <span className="message-timestamp">
                                                                {formatTimestamp(message.timestamp)}
                                                            </span>
                                                            {message.edited && (
                                                                <span style={{ 
                                                                    fontSize: '0.6875rem', 
                                                                    color: '#72767D',
                                                                    fontStyle: 'italic',
                                                                    lineHeight: '1.375'
                                                                }}>
                                                                    (edited)
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* Delete button - shown for message owner, admin, or moderator (not for deleted messages) */}
                                                        {!message.isDeleted && message.content !== '[deleted]' && canDeleteMessage(message) && (
                                                            <button
                                                                onClick={() => handleDeleteMessage(message.id)}
                                                                className="message-delete-btn"
                                                                style={{
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    color: '#f87171',
                                                                    cursor: 'pointer',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    opacity: 0,
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
                                                                    e.currentTarget.style.opacity = 0;
                                                                    e.currentTarget.style.background = 'transparent';
                                                                }}
                                                                title="Delete message"
                                                            >
                                                                <FaTrash size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {/* Delete button for grouped messages */}
                                                {isGrouped && !message.isDeleted && message.content !== '[deleted]' && canDeleteMessage(message) && (
                                                    <div className="message-delete-grouped" style={{ 
                                                        position: 'absolute', 
                                                        right: '16px', 
                                                        top: '2px',
                                                        opacity: 0,
                                                        transition: 'opacity 0.2s ease'
                                                    }}>
                                                        <button
                                                            onClick={() => handleDeleteMessage(message.id)}
                                                            className="message-delete-btn"
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#f87171',
                                                                cursor: 'pointer',
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.85rem',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'transparent';
                                                            }}
                                                            title="Delete message"
                                                        >
                                                            <FaTrash size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            <div className={`message-text ${message.isDeleted ? 'message-deleted' : ''}`}>
                                                {/* Deleted message */}
                                                {message.isDeleted || message.content === '[deleted]' ? (
                                                    <span style={{ 
                                                        color: '#72767D', 
                                                        fontStyle: 'italic',
                                                        opacity: 0.7
                                                    }}>
                                                        [message deleted]
                                                    </span>
                                                ) : message.isWelcomeMessage ? (
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
                                                    (() => {
                                                        // Parse message content for GIFs and images; render **bold** as bold (no asterisks shown)
                                                        let content = message.content || '';
                                                        // Remove file references: [File: ...], [FILE: ...], etc.
                                                        content = content.replace(/\[File:[^\]]*\]/gi, '').replace(/\[FILE:[^\]]*\]/gi, '').trim();
                                                        
                                                        // If message has a file attachment, don't show content if it's empty or only file references
                                                        if (message.file && !content) {
                                                            return null; // Don't render empty content when file is present
                                                        }
                                                        
                                                        if (!content) return null;
                                                        
                                                        // Helper: render text with **segments** as bold (asterisks not shown)
                                                        const renderTextWithBold = (text) => {
                                                            const segs = text.split(/\*\*([^*]+)\*\*/g);
                                                            return segs.map((seg, i) => i % 2 === 1 ? <strong key={i}>{seg}</strong> : <span key={i}>{seg}</span>);
                                                        };
                                                        
                                                        // Check for markdown image syntax: ![alt](url)
                                                        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
                                                        const parts = [];
                                                        let lastIndex = 0;
                                                        let match;
                                                        let keyCounter = 0;
                                                        
                                                        while ((match = imageRegex.exec(content)) !== null) {
                                                            // Add text before image (with bold rendering)
                                                            if (match.index > lastIndex) {
                                                                const slice = content.substring(lastIndex, match.index);
                                                                parts.push(<span key={`text-${keyCounter++}`}>{renderTextWithBold(slice)}</span>);
                                                            }
                                                            const imageUrl = match[2];
                                                            const imageAlt = match[1] || 'GIF';
                                                            parts.push(
                                                                <img
                                                                    key={`img-${keyCounter++}`}
                                                                    src={imageUrl}
                                                                    alt={imageAlt}
                                                                    style={{
                                                                        maxWidth: '180px',
                                                                        maxHeight: '180px',
                                                                        borderRadius: '8px',
                                                                        marginTop: '6px',
                                                                        display: 'block',
                                                                        cursor: 'pointer',
                                                                        objectFit: 'contain'
                                                                    }}
                                                                    onClick={() => {
                                                                        if (imageUrl) {
                                                                            window.open(imageUrl, '_blank');
                                                                        }
                                                                    }}
                                                                />
                                                            );
                                                            lastIndex = match.index + match[0].length;
                                                        }
                                                        
                                                        // Add remaining text (with bold rendering)
                                                        if (lastIndex < content.length) {
                                                            const slice = content.substring(lastIndex);
                                                            parts.push(<span key={`text-${keyCounter++}`}>{renderTextWithBold(slice)}</span>);
                                                        }
                                                        
                                                        return parts.length > 0 ? parts : renderTextWithBold(content);
                                                    })()
                                                )}
                                            </div>
                                            
                                            {message.isWelcomeMessage && (entitlements?.needsOnboardingReaccept || !hasReadWelcome) && (
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
                                            {message.file && message.file.preview && message.file.type && message.file.type.startsWith('image/') && (
                                                <div 
                                                    className="message-attachment clickable-file"
                                                    onClick={() => handleFileClick(message.file)}
                                                    style={{
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        marginTop: '8px',
                                                        borderRadius: '12px',
                                                        overflow: 'hidden',
                                                        background: 'var(--bg-elevated)',
                                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'scale(1.01)';
                                                        e.currentTarget.style.borderColor = 'var(--accent-blue)';
                                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(88, 101, 242, 0.3)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                                                    }}
                                                    title="Click to open in new window"
                                                >
                                                    <img 
                                                        src={message.file.preview} 
                                                        alt={getDisplayFileName(message.file.name, message.file.type)}
                                                        style={{
                                                            width: 'auto',
                                                            maxWidth: '180px',
                                                            maxHeight: '180px',
                                                            objectFit: 'contain',
                                                            display: 'block',
                                                            pointerEvents: 'none',
                                                            background: 'var(--bg-tertiary)'
                                                        }}
                                                    />
                                                    <div style={{
                                                        padding: '8px 12px',
                                                        background: 'var(--bg-elevated)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                                                    }}>
                                                        <FaImage style={{ fontSize: '0.875rem', color: 'var(--accent-blue)', flexShrink: 0 }} />
                                                        <span style={{ 
                                                            flex: 1, 
                                                            fontSize: '0.875rem',
                                                            color: '#ffffff',
                                                            fontWeight: 500,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {getDisplayFileName(message.file.name, message.file.type)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            {message.file && (!message.file.preview || !message.file.type || !message.file.type.startsWith('image/')) && (
                                                <div 
                                                    className="message-file clickable-file"
                                                    onClick={() => handleFileClick(message.file)}
                                                    style={{
                                                        marginTop: '8px',
                                                        padding: '14px 16px',
                                                        background: 'var(--bg-elevated)',
                                                        borderRadius: '12px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'var(--hover-bg)';
                                                        e.currentTarget.style.borderColor = 'var(--accent-blue)';
                                                        e.currentTarget.style.transform = 'translateX(4px)';
                                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(88, 101, 242, 0.25)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'var(--bg-elevated)';
                                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                                                    }}
                                                    title="Click to download"
                                                >
                                                    <div style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        borderRadius: '10px',
                                                        background: 'linear-gradient(135deg, var(--accent-blue), var(--purple-primary))',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0
                                                    }}>
                                                        <FaPaperclip style={{ fontSize: '1.1rem', color: '#ffffff' }} />
                                                    </div>
                                                    <span style={{ 
                                                        flex: 1, 
                                                        fontWeight: 600,
                                                        fontSize: '0.9375rem',
                                                        color: '#ffffff',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {getDisplayFileName(message.file.name, message.file.type)}
                                                    </span>
                                                </div>
                                            )}
                                            
                                            {/* Emoji Reactions - At the bottom of message */}
                                            {messageReactions[message.id] && Object.keys(messageReactions[message.id]).length > 0 && (
                                                <div className="message-reactions" style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: '6px',
                                                    marginTop: '8px',
                                                    alignItems: 'center'
                                                }}>
                                                    {Object.entries(messageReactions[message.id]).map(([emoji, count]) => (
                                                        <button
                                                            key={emoji}
                                                            className="reaction-button"
                                                            onClick={() => {
                                                                // Toggle reaction
                                                                setMessageReactions(prev => {
                                                                    const current = prev[message.id] || {};
                                                                    const newCount = (current[emoji] || 0) - 1;
                                                                    if (newCount <= 0) {
                                                                        const { [emoji]: removed, ...rest } = current;
                                                                        if (Object.keys(rest).length === 0) {
                                                                            const { [message.id]: removedMsg, ...restMsgs } = prev;
                                                                            return restMsgs;
                                                                        }
                                                                        return { ...prev, [message.id]: rest };
                                                                    }
                                                                    return { ...prev, [message.id]: { ...current, [emoji]: newCount } };
                                                                });
                                                            }}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                padding: '4px 8px',
                                                                background: 'rgba(255, 255, 255, 0.1)',
                                                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                                                borderRadius: '12px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.85rem',
                                                                color: '#ffffff',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                                            }}
                                                        >
                                                            <span>{emoji}</span>
                                                            <span>{count}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        
                        {/* WebSocket reconnect failed banner */}
                        {reconnectBanner && (
                            <div className="ws-reconnect-banner" style={{
                                padding: '12px 16px',
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.15) 100%)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                borderRadius: '8px',
                                margin: '0 16px 12px',
                                color: '#FCA5A5',
                                fontSize: '14px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap'
                            }}>
                                <span>Real-time connection unavailable. Messages will update via polling.</span>
                                <button
                                    type="button"
                                    onClick={() => retryWebSocket && retryWebSocket()}
                                    style={{
                                        padding: '6px 14px',
                                        background: 'rgba(255, 255, 255, 0.15)',
                                        border: '1px solid rgba(255, 255, 255, 0.3)',
                                        borderRadius: '6px',
                                        color: '#fff',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        fontSize: '13px'
                                    }}
                                >
                                    Retry connection
                                </button>
                            </div>
                        )}
                        
                        {/* Chat Input */}
                        <div className="chat-input-container">
                            <div className="connection-status">
                                <span className={`status-dot ${
                                    connectionStatus === 'connected' ? 'connected' : 
                                    connectionStatus === 'server-issue' || connectionStatus === 'wifi-issue' ? 'error' : 
                                    'connecting'
                                }`}></span>
                                <span style={{ 
                                    color: connectionStatus === 'connected' ? 'var(--accent-green)' : 
                                           connectionStatus === 'server-issue' || connectionStatus === 'wifi-issue' ? '#EF4444' : 
                                           '#F59E0B',
                                    fontWeight: 600
                                }}>
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
                            
                            {selectedChannel && selectedChannel.canWrite === false && (
                                <div className="chat-input-locked" style={{
                                    padding: '12px 16px',
                                    marginBottom: '12px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '8px',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.875rem'
                                }}>
                                    This channel is read-only. Upgrade to post here.
                                </div>
                            )}
                            <form className="chat-form" onSubmit={handleSendMessage}>
                                {editingMessageId && (
                                    <div style={{
                                        padding: '12px 16px',
                                        background: 'linear-gradient(135deg, rgba(88, 101, 242, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)',
                                        border: '1px solid rgba(88, 101, 242, 0.3)',
                                        borderRadius: '8px',
                                        marginBottom: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '0.875rem',
                                        boxShadow: '0 2px 8px rgba(88, 101, 242, 0.1)',
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '6px',
                                                background: 'rgba(88, 101, 242, 0.2)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'var(--accent-blue)'
                                            }}>
                                                <FaEdit size={14} />
                                            </div>
                                            <div>
                                                <div style={{ 
                                                    color: 'var(--accent-blue)', 
                                                    fontWeight: 600,
                                                    fontSize: '0.875rem'
                                                }}>
                                                    Editing message
                                                </div>
                                                <div style={{ 
                                                    color: 'var(--text-muted)', 
                                                    fontSize: '0.75rem',
                                                    marginTop: '2px'
                                                }}>
                                                    Make your changes and click Save
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                color: 'var(--text-normal)',
                                                cursor: 'pointer',
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                fontSize: '0.8125rem',
                                                fontWeight: 500,
                                                transition: 'all 0.2s ease'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                                <div className="chat-input-wrapper" style={{ position: 'relative' }}>
                                    <textarea
                                        id="community-message-input"
                                        name="message"
                                        ref={messageInputRef}
                                        className="chat-input"
                                        value={newMessage}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setNewMessage(value);
                                            
                                            // Check for @mention
                                            const cursorPos = e.target.selectionStart;
                                            const textBeforeCursor = value.substring(0, cursorPos);
                                            const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                                            
                                            if (lastAtIndex !== -1) {
                                                const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
                                                // Check if we're still in a word (no space after @)
                                                if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
                                                    const query = textAfterAt.toLowerCase();
                                                    setMentionQuery(query);
                                                    setMentionAutocomplete({
                                                        show: true,
                                                        query: query,
                                                        position: { x: 0, y: 0 } // Will be calculated
                                                    });
                                                } else {
                                                    setMentionAutocomplete(null);
                                                }
                                            } else {
                                                setMentionAutocomplete(null);
                                            }
                                            
                                            // Auto-resize textarea
                                            e.target.style.height = 'auto';
                                            e.target.style.height = `${Math.min(e.target.scrollHeight, 400)}px`;
                                        }}
                                        onPaste={handlePaste}
                                        onKeyDown={(e) => {
                                            // Handle autocomplete selection
                                            if (mentionAutocomplete?.show) {
                                                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab') {
                                                    e.preventDefault();
                                                    // Autocomplete selection will be handled by the dropdown
                                                    return;
                                                }
                                                if (e.key === 'Escape') {
                                                    setMentionAutocomplete(null);
                                                    return;
                                                }
                                            }
                                            
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage(e);
                                            }
                                            if (e.key === 'Escape' && editingMessageId) {
                                                handleCancelEdit();
                                            }
                                        }}
                                        placeholder={
                                            editingMessageId
                                                ? 'Edit your message...'
                                                : selectedChannel?.canWrite !== false
                                                    ? `Message #${selectedChannel?.name || ''}`
                                                    : 'Read-only channel. Upgrade to post here.'
                                        }
                                        disabled={selectedChannel?.canWrite === false}
                                        rows="3"
                                        style={{ 
                                            paddingRight: '120px',
                                            minHeight: '60px',
                                            maxHeight: '400px',
                                            overflowY: 'auto',
                                            fontSize: '0.9375rem',
                                            lineHeight: '1.6'
                                        }}
                                    />
                                    
                                    {/* @Mention Autocomplete Dropdown */}
                                    {mentionAutocomplete?.show && (
                                        <div className="mention-autocomplete" style={{
                                            position: 'absolute',
                                            bottom: '100%',
                                            left: '0',
                                            right: '0',
                                            marginBottom: '8px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            zIndex: 1000,
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                                        }}>
                                            {(() => {
                                                const query = mentionQuery.toLowerCase();
                                                const filteredUsers = allUsers.filter(u => {
                                                    const username = (u.username || u.name || '').toLowerCase();
                                                    return username.includes(query) && String(u.id) !== String(userId);
                                                }).slice(0, 10); // Limit to 10 results
                                                
                                                // Add @admin option if query matches
                                                const showAdmin = query === '' || 'admin'.includes(query);
                                                
                                                return (
                                                    <>
                                                        {showAdmin && (
                                                            <div
                                                                className="mention-item"
                                                                onClick={() => {
                                                                    const cursorPos = messageInputRef.current.selectionStart;
                                                                    const textBeforeCursor = newMessage.substring(0, cursorPos);
                                                                    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                                                                    const newText = newMessage.substring(0, lastAtIndex + 1) + 'admin ' + newMessage.substring(cursorPos);
                                                                    setNewMessage(newText);
                                                                    setMentionAutocomplete(null);
                                                                    setTimeout(() => {
                                                                        messageInputRef.current.focus();
                                                                        const newPos = lastAtIndex + 6; // '@admin '
                                                                        messageInputRef.current.setSelectionRange(newPos, newPos);
                                                                    }, 0);
                                                                }}
                                                                style={{
                                                                    padding: '10px 16px',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '10px',
                                                                    borderBottom: '1px solid var(--border-color)',
                                                                    background: query === '' ? 'rgba(139, 92, 246, 0.2)' : 'transparent'
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.background = query === '' ? 'rgba(139, 92, 246, 0.2)' : 'transparent';
                                                                }}
                                                            >
                                                                <div style={{
                                                                    width: '32px',
                                                                    height: '32px',
                                                                    borderRadius: '50%',
                                                                    background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: 'white',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '0.875rem'
                                                                }}>A</div>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, color: '#fff' }}>@admin</div>
                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Notify all admins</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {filteredUsers.map(user => (
                                                            <div
                                                                key={user.id}
                                                                className="mention-item"
                                                                onClick={() => {
                                                                    const cursorPos = messageInputRef.current.selectionStart;
                                                                    const textBeforeCursor = newMessage.substring(0, cursorPos);
                                                                    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                                                                    const username = user.username || user.name || 'user';
                                                                    const newText = newMessage.substring(0, lastAtIndex + 1) + username + ' ' + newMessage.substring(cursorPos);
                                                                    setNewMessage(newText);
                                                                    setMentionAutocomplete(null);
                                                                    setTimeout(() => {
                                                                        messageInputRef.current.focus();
                                                                        const newPos = lastAtIndex + username.length + 1;
                                                                        messageInputRef.current.setSelectionRange(newPos, newPos);
                                                                    }, 0);
                                                                }}
                                                                style={{
                                                                    padding: '10px 16px',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '10px'
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.background = 'transparent';
                                                                }}
                                                            >
                                                                <div style={{
                                                                    width: '32px',
                                                                    height: '32px',
                                                                    borderRadius: '50%',
                                                                    overflow: 'hidden',
                                                                    background: 'linear-gradient(135deg, var(--purple-primary), var(--purple-dark))',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: 'white',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '0.875rem',
                                                                    flexShrink: 0
                                                                }}>
                                                                    {user.avatar && user.avatar !== '/avatars/avatar_ai.png' ? (
                                                                        <img 
                                                                            src={user.avatar} 
                                                                            alt={user.username || user.name || 'User'}
                                                                            style={{
                                                                                width: '100%',
                                                                                height: '100%',
                                                                                objectFit: 'cover'
                                                                            }}
                                                                            onError={(e) => {
                                                                                // Fallback to initials if image fails to load
                                                                                e.target.style.display = 'none';
                                                                                e.target.parentElement.textContent = (user.username || user.name || 'U').substring(0, 2).toUpperCase();
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <span>{(user.username || user.name || 'U').substring(0, 2).toUpperCase()}</span>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, color: '#fff' }}>@{user.username || user.name || 'user'}</div>
                                                                    {user.role && (
                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                            {user.role === 'admin' || user.role === 'super_admin' ? 'Admin' : user.role}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {filteredUsers.length === 0 && !showAdmin && (
                                                            <div style={{
                                                                padding: '16px',
                                                                textAlign: 'center',
                                                                color: 'var(--text-muted)',
                                                                fontSize: '0.875rem'
                                                            }}>
                                                                No users found
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                                    
                                    <div className="chat-input-buttons">
                                        {/* File Upload Button */}
                                        <button
                                            type="button"
                                            className="chat-input-btn"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={selectedChannel?.canWrite === false}
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
                                            onClick={() => {
                                                setShowEmojiPicker(!showEmojiPicker);
                                                setShowGifPicker(false);
                                            }}
                                            disabled={selectedChannel?.canWrite === false}
                                        >
                                            <FaSmile />
                                        </button>
                                        
                                        {/* GIF Button */}
                                        <button
                                            type="button"
                                            className="chat-input-btn"
                                            onClick={() => {
                                                setShowGifPicker(!showGifPicker);
                                                setShowEmojiPicker(false);
                                            }}
                                            disabled={selectedChannel?.canWrite === false}
                                        >
                                            <FaImage />
                                        </button>
                                    </div>
                                </div>
                                
                                <button 
                                    type="submit" 
                                    className="send-btn"
                                    disabled={(!newMessage.trim() && !selectedFile) || selectedChannel?.canWrite === false}
                                >
                                    <FaPaperPlane />
                                    <span>{editingMessageId ? 'Save' : 'Send'}</span>
                                </button>
                            </form>
                        </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="no-channel-selected">
                        <h2>Welcome to AURA FX Community</h2>
                        <p>Select a channel to start chatting</p>
                    </div>
                )}
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
                                        <option value="general">General</option>
                                        <option value="support">Support</option>
                                        <option value="premium">Premium</option>
                                        <option value="a7fx">A7FX</option>
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
                                        <option value="free">Free - No subscription required</option>
                                        <option value="open">Open - Everyone can view and post</option>
                                        <option value="read-only">Read Only - View only</option>
                                        <option value="admin-only">Admin Only</option>
                                        <option value="premium">Premium - Subscription required (Aura FX £99/mo)</option>
                                        <option value="a7fx">A7FX Elite - Subscription required (A7FX £250/mo)</option>
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
                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, #6D28D9 100%)',
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
                    onEmojiSelect={(emoji) => {
                        if (selectedMessageForReaction) {
                            // Add reaction to message
                            setMessageReactions(prev => {
                                const current = prev[selectedMessageForReaction] || {};
                                return {
                                    ...prev,
                                    [selectedMessageForReaction]: {
                                        ...current,
                                        [emoji]: (current[emoji] || 0) + 1
                                    }
                                };
                            });
                            setSelectedMessageForReaction(null);
                        } else {
                            // Insert emoji into message input
                            handleEmojiSelect(emoji);
                        }
                        setShowEmojiPicker(false);
                    }}
                    onClose={() => {
                        setShowEmojiPicker(false);
                        setSelectedMessageForReaction(null);
                    }}
                />
            )}
            
            {/* GIF Picker */}
            {showGifPicker && (
                <GifPicker
                    onGifSelect={handleGifSelect}
                    onClose={() => setShowGifPicker(false)}
                />
            )}
            
            {/* Channel Context Menu - Super Admin Only */}
            {channelContextMenu && isSuperAdminUser && (
                <div
                    className="message-context-menu"
                    style={{
                        position: 'fixed',
                        top: `${channelContextMenu.y}px`,
                        left: `${channelContextMenu.x}px`,
                        background: '#2B2D31',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '4px',
                        minWidth: '200px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                        zIndex: 10000,
                        display: 'flex',
                        flexDirection: 'column',
                        pointerEvents: 'auto'
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            const channel = channelContextMenu.channel;
                            setEditingChannel({
                                id: channel.id,
                                name: channel.name,
                                displayName: channel.displayName || channel.name,
                                description: channel.description || '',
                                category: channel.category || 'general',
                                accessLevel: channel.accessLevel || 'open',
                                permissionType: channel.permissionType || 'read-write'
                            });
                            setChannelContextMenu(null);
                        }}
                    >
                        <FaEdit size={14} /> Edit Channel
                    </button>
                    {!protectedChannelIds.includes(channelContextMenu.channelId) && (
                        <>
                            <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '4px 0' }} />
                            <button
                                className="context-menu-item"
                                onClick={() => {
                                    handleDeleteChannel(channelContextMenu.channel);
                                }}
                                style={{ color: '#f87171' }}
                            >
                                <FaTrash size={14} /> Delete Channel
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Category Context Menu - Super Admin Only */}
            {categoryContextMenu && isSuperAdminUser && (
                <div
                    className="message-context-menu"
                    style={{
                        position: 'fixed',
                        top: `${categoryContextMenu.y}px`,
                        left: `${categoryContextMenu.x}px`,
                        background: '#2B2D31',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '4px',
                        minWidth: '200px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                        zIndex: 10000,
                        display: 'flex',
                        flexDirection: 'column',
                        pointerEvents: 'auto'
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            setEditingCategory({
                                oldName: categoryContextMenu.categoryName,
                                newName: categoryContextMenu.categoryName
                            });
                            setCategoryContextMenu(null);
                        }}
                    >
                        <FaEdit size={14} /> Edit Category
                    </button>
                    <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '4px 0' }} />
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            handleDeleteCategory(categoryContextMenu.categoryName);
                        }}
                        style={{ color: '#f87171' }}
                    >
                        <FaTrash size={14} /> Delete Category
                    </button>
                </div>
            )}

            {/* Edit Channel Modal */}
            {editingChannel && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10001,
                    padding: '20px'
                }} onClick={() => setEditingChannel(null)}>
                    <div style={{
                        background: '#1E1E1E',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '500px',
                        width: '100%',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
                    }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '1.5rem' }}>Edit Channel</h3>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '0.9rem' }}>Channel Name</label>
                            <input
                                type="text"
                                value={editingChannel.displayName || editingChannel.name}
                                onChange={(e) => setEditingChannel({ ...editingChannel, displayName: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2B2D31',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '0.9rem'
                                }}
                            />
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '0.9rem' }}>Description</label>
                            <textarea
                                value={editingChannel.description}
                                onChange={(e) => setEditingChannel({ ...editingChannel, description: e.target.value })}
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2B2D31',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    resize: 'vertical'
                                }}
                            />
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '0.9rem' }}>Category</label>
                            <select
                                value={editingChannel.category}
                                onChange={(e) => setEditingChannel({ ...editingChannel, category: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2B2D31',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '0.9rem'
                                }}
                            >
                                <option value="general">General</option>
                                <option value="trading">Trading</option>
                                <option value="premium">Premium</option>
                                <option value="a7fx">A7FX</option>
                                <option value="announcements">Announcements</option>
                                <option value="staff">Staff</option>
                                <option value="support">Support</option>
                            </select>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '0.9rem' }}>Access Level</label>
                            <select
                                value={editingChannel.accessLevel}
                                onChange={(e) => setEditingChannel({ ...editingChannel, accessLevel: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2B2D31',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '0.9rem'
                                }}
                            >
                                <option value="free">Free - No subscription required</option>
                                <option value="open">Open - Everyone can view and post</option>
                                <option value="read-only">Read-Only - Everyone can view, only admins can post</option>
                                <option value="admin-only">Admin-Only - Only admins can view and post</option>
                                <option value="premium">Premium - Subscription required (Aura FX £99/mo)</option>
                                <option value="a7fx">A7FX Elite - Subscription required (A7FX £250/mo)</option>
                            </select>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '0.9rem' }}>Permission Type</label>
                            <select
                                value={editingChannel.permissionType || 'read-write'}
                                onChange={(e) => setEditingChannel({ ...editingChannel, permissionType: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2B2D31',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '0.9rem'
                                }}
                            >
                                <option value="read-write">Read & Write - Users can text in channel</option>
                                <option value="read-only">Read Only - Users can only see channel (cannot text)</option>
                            </select>
                            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem', marginTop: '6px', marginBottom: 0 }}>
                                This controls whether users with access can text or just view the channel
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setEditingChannel(null)}
                                style={{
                                    padding: '10px 20px',
                                    background: 'transparent',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleEditChannel(editingChannel)}
                                disabled={channelActionLoading}
                                style={{
                                    padding: '10px 20px',
                                    background: 'linear-gradient(135deg, var(--purple-primary), var(--purple-dark))',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    cursor: channelActionLoading ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    opacity: channelActionLoading ? 0.6 : 1
                                }}
                            >
                                {channelActionLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Category Modal */}
            {editingCategory && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10001,
                    padding: '20px'
                }} onClick={() => setEditingCategory(null)}>
                    <div style={{
                        background: '#1E1E1E',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '400px',
                        width: '100%',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
                    }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '1.5rem' }}>Edit Category</h3>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#fff', marginBottom: '8px', fontSize: '0.9rem' }}>Category Name</label>
                            <input
                                type="text"
                                value={editingCategory.newName}
                                onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2B2D31',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '0.9rem'
                                }}
                                placeholder="Enter category name"
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setEditingCategory(null)}
                                style={{
                                    padding: '10px 20px',
                                    background: 'transparent',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleEditCategory(editingCategory.oldName, editingCategory.newName)}
                                style={{
                                    padding: '10px 20px',
                                    background: 'linear-gradient(135deg, var(--purple-primary), var(--purple-dark))',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600'
                                }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Subscription Selection Modal */}
            {showSubscriptionModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10002,
                    padding: '20px'
                }} onClick={() => setShowSubscriptionModal(false)}>
                    <div style={{
                        background: '#1E1E1E',
                        borderRadius: '16px',
                        padding: '32px',
                        maxWidth: '800px',
                        width: '100%',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ 
                                color: '#fff', 
                                margin: 0, 
                                fontSize: '1.75rem',
                                fontWeight: 'bold',
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text'
                            }}>
                                Choose Your Subscription Plan
                            </h2>
                            <button
                                onClick={() => setShowSubscriptionModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.background = 'transparent';
                                }}
                            >
                                ×
                            </button>
                        </div>
                        
                        {requiredSubscriptionType && (
                            <div style={{
                                background: 'rgba(139, 92, 246, 0.2)',
                                border: '1px solid rgba(139, 92, 246, 0.4)',
                                borderRadius: '8px',
                                padding: '12px 16px',
                                marginBottom: '24px'
                            }}>
                                <p style={{ color: '#fff', margin: 0, fontSize: '0.9rem' }}>
                                    <strong>💡 This channel requires:</strong> {requiredSubscriptionType === 'premium' ? 'Aura FX Premium (£99/month)' : 'A7FX Elite (£250/month)'}
                                </p>
                            </div>
                        )}
                        
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '20px',
                            marginBottom: '24px'
                        }}>
                            {/* Free Monthly Plan */}
                            <div style={{
                                padding: '24px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                textAlign: 'center',
                                position: 'relative',
                                transition: 'all 0.3s ease'
                            }}>
                                <h3 style={{ color: '#fff', fontSize: '22px', marginBottom: '12px', fontWeight: 'bold' }}>Free Monthly</h3>
                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8B5CF6', marginBottom: '8px' }}>£0</div>
                                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px', marginBottom: '20px' }}>per month</div>
                                <ul style={{ 
                                    textAlign: 'left', 
                                    color: 'rgba(255, 255, 255, 0.8)', 
                                    fontSize: '13px', 
                                    marginBottom: '20px', 
                                    paddingLeft: '20px',
                                    listStyle: 'none'
                                }}>
                                    <li style={{ marginBottom: '8px' }}>✅ General, welcome & announcements</li>
                                    <li style={{ marginBottom: '8px' }}>✅ No payment required</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Instant access to community</li>
                                </ul>
                                {subscriptionModalError && (
                                    <div role="alert" style={{ color: '#fa755a', fontSize: '13px', marginBottom: '12px' }}>{subscriptionModalError}</div>
                                )}
                                <button
                                    onClick={() => handleSelectSubscription('free')}
                                    disabled={selectingFreePlan}
                                    style={{
                                        width: '100%',
                                        background: selectingFreePlan ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.3)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '12px 24px',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        cursor: selectingFreePlan ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.3s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!selectingFreePlan) {
                                            e.target.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)';
                                            e.target.style.transform = 'translateY(-2px)';
                                            e.target.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!selectingFreePlan) {
                                            e.target.style.background = 'rgba(139, 92, 246, 0.3)';
                                            e.target.style.transform = 'translateY(0)';
                                            e.target.style.boxShadow = 'none';
                                        }
                                    }}
                                >
                                    {selectingFreePlan ? 'Activating...' : 'Get Free Monthly'}
                                </button>
                            </div>

                            {/* Aura FX Premium Plan */}
                            <div style={{
                                padding: '24px',
                                background: requiredSubscriptionType === 'premium' 
                                    ? 'rgba(139, 92, 246, 0.2)' 
                                    : 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '12px',
                                border: requiredSubscriptionType === 'premium'
                                    ? '2px solid rgba(139, 92, 246, 0.6)'
                                    : '1px solid rgba(255, 255, 255, 0.1)',
                                textAlign: 'center',
                                position: 'relative',
                                transition: 'all 0.3s ease'
                            }}>
                                {requiredSubscriptionType === 'premium' && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '12px',
                                        right: '12px',
                                        background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                        color: 'white',
                                        padding: '4px 12px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        fontWeight: 'bold'
                                    }}>REQUIRED</div>
                                )}
                                <h3 style={{ color: '#fff', fontSize: '22px', marginBottom: '12px', fontWeight: 'bold' }}>Aura FX</h3>
                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8B5CF6', marginBottom: '8px' }}>£99</div>
                                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px', marginBottom: '20px' }}>per month</div>
                                <ul style={{ 
                                    textAlign: 'left', 
                                    color: 'rgba(255, 255, 255, 0.8)', 
                                    fontSize: '13px', 
                                    marginBottom: '20px', 
                                    paddingLeft: '20px',
                                    listStyle: 'none'
                                }}>
                                    <li style={{ marginBottom: '8px' }}>✅ Access to premium channels</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Market analysis</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Community access</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Weekly Briefs</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Premium AURA AI</li>
                                </ul>
                                <button
                                    onClick={() => handleSelectSubscription('aura')}
                                    style={{
                                        width: '100%',
                                        background: requiredSubscriptionType === 'premium'
                                            ? 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)'
                                            : 'rgba(139, 92, 246, 0.3)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '12px 24px',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        boxShadow: requiredSubscriptionType === 'premium'
                                            ? '0 4px 12px rgba(139, 92, 246, 0.4)'
                                            : 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)';
                                        e.target.style.transform = 'translateY(-2px)';
                                        e.target.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (requiredSubscriptionType !== 'premium') {
                                            e.target.style.background = 'rgba(139, 92, 246, 0.3)';
                                            e.target.style.boxShadow = 'none';
                                        }
                                        e.target.style.transform = 'translateY(0)';
                                    }}
                                >
                                    Select Aura FX
                                </button>
                            </div>

                            {/* A7FX Elite Plan */}
                            <div style={{
                                padding: '24px',
                                background: requiredSubscriptionType === 'a7fx'
                                    ? 'rgba(139, 92, 246, 0.2)'
                                    : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(167, 139, 250, 0.1) 100%)',
                                borderRadius: '12px',
                                border: requiredSubscriptionType === 'a7fx'
                                    ? '2px solid rgba(139, 92, 246, 0.6)'
                                    : '2px solid rgba(139, 92, 246, 0.4)',
                                textAlign: 'center',
                                position: 'relative',
                                transition: 'all 0.3s ease'
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    top: '12px',
                                    right: '12px',
                                    background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                    color: 'white',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 'bold'
                                }}>{requiredSubscriptionType === 'a7fx' ? 'REQUIRED' : 'ELITE'}</div>
                                <h3 style={{ color: '#fff', fontSize: '22px', marginBottom: '12px', fontWeight: 'bold' }}>A7FX Elite</h3>
                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8B5CF6', marginBottom: '8px' }}>£250</div>
                                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px', marginBottom: '20px' }}>per month</div>
                                <ul style={{ 
                                    textAlign: 'left', 
                                    color: 'rgba(255, 255, 255, 0.8)', 
                                    fontSize: '13px', 
                                    marginBottom: '20px', 
                                    paddingLeft: '20px',
                                    listStyle: 'none'
                                }}>
                                    <li style={{ marginBottom: '8px' }}>✅ Everything in Aura FX</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Elite-only channels</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Direct founder access</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Daily Briefs</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Weekly Briefs</li>
                                    <li style={{ marginBottom: '8px' }}>✅ Premium AURA AI</li>
                                </ul>
                                <button
                                    onClick={() => handleSelectSubscription('a7fx')}
                                    style={{
                                        width: '100%',
                                        background: requiredSubscriptionType === 'a7fx'
                                            ? 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)'
                                            : 'rgba(139, 92, 246, 0.3)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '12px 24px',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        boxShadow: requiredSubscriptionType === 'a7fx'
                                            ? '0 4px 12px rgba(139, 92, 246, 0.4)'
                                            : 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)';
                                        e.target.style.transform = 'translateY(-2px)';
                                        e.target.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (requiredSubscriptionType !== 'a7fx') {
                                            e.target.style.background = 'rgba(139, 92, 246, 0.3)';
                                            e.target.style.boxShadow = 'none';
                                        }
                                        e.target.style.transform = 'translateY(0)';
                                    }}
                                >
                                    Select A7FX Elite
                                </button>
                            </div>
                        </div>
                        
                        <p style={{
                            textAlign: 'center',
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: '12px',
                            marginTop: '20px',
                            marginBottom: 0
                        }}>
                            Cancel anytime • No hidden fees • Switch plans anytime
                        </p>
                    </div>
                </div>
            )}
            
            {/* Context Menu */}
            {contextMenu && (() => {
                const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
                const menuWidth = 200;
                const menuMaxHeight = 360;
                let top = contextMenu.y;
                let left = contextMenu.x;
                if (isMobile) {
                    const pad = 12;
                    left = Math.min(Math.max(left, pad), window.innerWidth - menuWidth - pad);
                    top = Math.min(Math.max(top, pad), window.innerHeight - menuMaxHeight - pad);
                }
                return (
                <div
                    className="message-context-menu"
                    style={{
                        position: 'fixed',
                        top: `${top}px`,
                        left: `${left}px`,
                        background: '#2B2D31',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '4px',
                        minWidth: `${menuWidth}px`,
                        maxHeight: isMobile ? '400px' : undefined,
                        overflowY: isMobile ? 'auto' : undefined,
                        WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                        zIndex: 10000,
                        display: 'flex',
                        flexDirection: 'column',
                        pointerEvents: 'auto'
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {(() => {
                        const message = messages.find(m => m.id === contextMenu.messageId);
                        const isOwnMessage = message && String(message.userId) === String(userId);
                        return (
                            <>
                                {isOwnMessage && (
                                    <button
                                        className="context-menu-item"
                                        onClick={() => {
                                            handleEditMessage(contextMenu.messageId);
                                        }}
                                    >
                                        <FaEdit size={14} /> Edit
                                    </button>
                                )}
                                <button
                                    className="context-menu-item"
                                    onClick={() => {
                                        // Reply functionality - could focus input and add @mention
                                        if (message) {
                                            setNewMessage(`@${message.sender?.username || 'user'} `);
                                            messageInputRef.current?.focus();
                                        }
                                        setContextMenu(null);
                                    }}
                                >
                                    <FaReply size={14} /> Reply
                                </button>
                                <button
                                    className="context-menu-item"
                                    onClick={() => {
                                        setShowEmojiPicker(true);
                                        setSelectedMessageForReaction(contextMenu.messageId);
                                        setContextMenu(null);
                                    }}
                                >
                                    <FaSmile size={14} /> Add Reaction
                                </button>
                                <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '4px 0' }} />
                            </>
                        );
                    })()}
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            const message = messages.find(m => m.id === contextMenu.messageId);
                            if (message) {
                                navigator.clipboard.writeText(message.content);
                                setContextMenu(null);
                            }
                        }}
                    >
                        <FaCopy size={14} /> Copy message text
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            const messageLink = `${window.location.origin}${window.location.pathname}?message=${contextMenu.messageId}`;
                            navigator.clipboard.writeText(messageLink);
                            setContextMenu(null);
                        }}
                    >
                        <FaLink size={14} /> Copy message link
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            // Save message functionality
                            setContextMenu(null);
                        }}
                    >
                        <FaBookmark size={14} /> Save Message
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            // Notify on replies functionality
                            setContextMenu(null);
                        }}
                    >
                        <FaBell size={14} /> Notify on Replies
                    </button>
                    <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '4px 0' }} />
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            // Mark as unread functionality
                            setContextMenu(null);
                        }}
                    >
                        Mark as Unread
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => {
                            // Report message functionality
                            setContextMenu(null);
                        }}
                        style={{ color: '#f87171' }}
                    >
                        <FaFlag size={14} /> Report message
                    </button>
                    {/* Delete message - show for message owner, admin, or moderator */}
                    {(() => {
                        const message = messages.find(m => m.id === contextMenu.messageId);
                        if (message && canDeleteMessage(message)) {
                            return (
                                <button
                                    className="context-menu-item"
                                    onClick={() => {
                                        handleDeleteMessage(contextMenu.messageId);
                                        setContextMenu(null);
                                    }}
                                    style={{ color: '#ef4444' }}
                                >
                                    <FaTrash size={14} /> Delete message
                                </button>
                            );
                        }
                        return null;
                    })()}
                </div>
                );
            })()}

            {/* Channel Access Modal - Shows when clicking locked channels */}
            {showChannelAccessModal && lockedChannelInfo && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10003,
                    padding: '20px'
                }} onClick={() => {
                    setShowChannelAccessModal(false);
                    setLockedChannelInfo(null);
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: '16px',
                        padding: '32px',
                        maxWidth: '500px',
                        width: '100%',
                        border: '2px solid rgba(139, 92, 246, 0.3)',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.2)',
                        position: 'relative'
                    }} onClick={(e) => e.stopPropagation()}>
                        {/* Close button */}
                        <button
                            onClick={() => {
                                setShowChannelAccessModal(false);
                                setLockedChannelInfo(null);
                            }}
                            style={{
                                position: 'absolute',
                                top: '16px',
                                right: '16px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                color: '#fff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '20px',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                e.currentTarget.style.transform = 'rotate(90deg)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.style.transform = 'rotate(0deg)';
                            }}
                        >
                            ×
                        </button>

                        {/* Lock icon */}
                        <div style={{
                            textAlign: 'center',
                            marginBottom: '24px'
                        }}>
                            <div style={{
                                fontSize: '48px',
                                marginBottom: '16px',
                                filter: 'drop-shadow(0 0 10px rgba(139, 92, 246, 0.5))'
                            }}>🔒</div>
                            <h2 style={{
                                color: '#fff',
                                fontSize: '24px',
                                fontWeight: 'bold',
                                margin: 0,
                                marginBottom: '8px'
                            }}>
                                Subscription Required
                            </h2>
                            <p style={{
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: '16px',
                                margin: 0
                            }}>
                                #{lockedChannelInfo.channelName}
                            </p>
                        </div>

                        {/* Message based on user type */}
                        <div style={{
                            background: 'rgba(139, 92, 246, 0.1)',
                            borderRadius: '12px',
                            padding: '20px',
                            marginBottom: '24px',
                            border: '1px solid rgba(139, 92, 246, 0.3)'
                        }}>
                            {lockedChannelInfo.accessLevel === 'premium' ? (
                                <>
                                    <p style={{
                                        color: '#fff',
                                        fontSize: '16px',
                                        lineHeight: '1.6',
                                        margin: '0 0 16px 0'
                                    }}>
                                        This channel requires an <strong style={{ color: '#8B5CF6' }}>Aura FX Premium</strong> subscription (£99/month) to access.
                                    </p>
                                    {lockedChannelInfo.currentRole === 'free' ? (
                                        <div style={{
                                            background: 'rgba(251, 191, 36, 0.1)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            border: '1px solid rgba(251, 191, 36, 0.3)'
                                        }}>
                                            <p style={{
                                                color: '#fbbf24',
                                                fontSize: '14px',
                                                margin: 0,
                                                fontWeight: '600'
                                            }}>
                                                Your Status: Free User
                                            </p>
                                            <p style={{
                                                color: 'rgba(255, 255, 255, 0.8)',
                                                fontSize: '14px',
                                                margin: '8px 0 0 0'
                                            }}>
                                                Upgrade to Premium to unlock this channel and access exclusive trading content.
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: 'rgba(139, 92, 246, 0.2)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            border: '1px solid rgba(139, 92, 246, 0.4)'
                                        }}>
                                            <p style={{
                                                color: '#A78BFA',
                                                fontSize: '14px',
                                                margin: 0,
                                                fontWeight: '600'
                                            }}>
                                                Your Status: Premium User
                                            </p>
                                            <p style={{
                                                color: 'rgba(255, 255, 255, 0.8)',
                                                fontSize: '14px',
                                                margin: '8px 0 0 0'
                                            }}>
                                                Your subscription may be inactive or expired. Please check your subscription status or renew to access this channel.
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p style={{
                                        color: '#fff',
                                        fontSize: '16px',
                                        lineHeight: '1.6',
                                        margin: '0 0 16px 0'
                                    }}>
                                        This channel requires an <strong style={{ color: '#fbbf24' }}>A7FX Elite</strong> subscription (£250/month) to access.
                                    </p>
                                    {lockedChannelInfo.currentRole === 'free' ? (
                                        <div style={{
                                            background: 'rgba(251, 191, 36, 0.1)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            border: '1px solid rgba(251, 191, 36, 0.3)'
                                        }}>
                                            <p style={{
                                                color: '#fbbf24',
                                                fontSize: '14px',
                                                margin: 0,
                                                fontWeight: '600'
                                            }}>
                                                Your Status: Free User
                                            </p>
                                            <p style={{
                                                color: 'rgba(255, 255, 255, 0.8)',
                                                fontSize: '14px',
                                                margin: '8px 0 0 0'
                                            }}>
                                                Upgrade to A7FX Elite to unlock this channel and access the most exclusive trading content and signals.
                                            </p>
                                        </div>
                                    ) : lockedChannelInfo.currentRole === 'premium' ? (
                                        <div style={{
                                            background: 'rgba(139, 92, 246, 0.2)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            border: '1px solid rgba(139, 92, 246, 0.4)'
                                        }}>
                                            <p style={{
                                                color: '#A78BFA',
                                                fontSize: '14px',
                                                margin: 0,
                                                fontWeight: '600'
                                            }}>
                                                Your Status: Premium User
                                            </p>
                                            <p style={{
                                                color: 'rgba(255, 255, 255, 0.8)',
                                                fontSize: '14px',
                                                margin: '8px 0 0 0'
                                            }}>
                                                This channel requires A7FX Elite. Upgrade from Premium to Elite to access the most exclusive content.
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: 'rgba(251, 191, 36, 0.1)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            border: '1px solid rgba(251, 191, 36, 0.3)'
                                        }}>
                                            <p style={{
                                                color: '#fbbf24',
                                                fontSize: '14px',
                                                margin: 0,
                                                fontWeight: '600'
                                            }}>
                                                Your Status: A7FX Elite User
                                            </p>
                                            <p style={{
                                                color: 'rgba(255, 255, 255, 0.8)',
                                                fontSize: '14px',
                                                margin: '8px 0 0 0'
                                            }}>
                                                Your subscription may be inactive or expired. Please check your subscription status or renew to access this channel.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                onClick={() => {
                                    setShowChannelAccessModal(false);
                                    setLockedChannelInfo(null);
                                }}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    color: '#fff',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowChannelAccessModal(false);
                                    setLockedChannelInfo(null);
                                    handleSubscribe(lockedChannelInfo.accessLevel === 'premium' ? 'premium' : 'a7fx');
                                }}
                                style={{
                                    background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 4px 12px rgba(139, 92, 234, 0.4)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 234, 0.6)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 234, 0.4)';
                                }}
                            >
                                Subscribe Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Profile Modal */}
            <ProfileModal 
                isOpen={showProfileModal} 
                onClose={() => setShowProfileModal(false)}
                userId={profileModalData?.id || storedUser?.id}
                userData={profileModalData}
                onViewProfile={() => {
                    setShowProfileModal(false);
                    navigate('/profile');
                }}
            />
        </div>
    );
};

export default Community;
