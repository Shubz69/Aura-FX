/**
 * AURA FX XP System
 * Premium gamified XP and leveling system with trading-focused ranks
 */

// XP Rewards
export const XP_REWARDS = {
    MESSAGE: 10,
    FILE_ATTACHMENT: 5,
    EMOJI_BONUS: 0.1,
    DAILY_LOGIN: 25,
    COURSE_COMPLETION: 50,
    HELPING_USER: 100,
    JOURNAL_ENTRY: 15,
    RULE_VIOLATION: -200
};

// Cooldowns (in milliseconds) - Anti-spam protection
export const XP_COOLDOWNS = {
    MESSAGE: 5000, // 5 seconds between messages
    DAILY_LOGIN: 86400000, // 24 hours
    JOURNAL_ENTRY: 3600000, // 1 hour
    HELPING_USER: 300000 // 5 minutes
};

// Trading Rank Titles (Every 10 levels from 1-1000)
export const TRADING_RANKS = {
    // Beginner Tier (1-90)
    10: 'Market Observer',
    20: 'Chart Reader',
    30: 'Price Action Student',
    40: 'Risk Apprentice',
    50: 'Session Trader',
    60: 'Breakout Hunter',
    70: 'Trend Rider',
    80: 'Liquidity Scout',
    90: 'Structure Analyst',
    
    // Intermediate Tier (100-190)
    100: 'Junior Trader',
    110: 'Technical Specialist',
    120: 'Market Strategist',
    130: 'Volume Analyst',
    140: 'Pattern Master',
    150: 'Risk Manager',
    160: 'Session Dominator',
    170: 'Momentum Trader',
    180: 'Precision Sniper',
    190: 'Consistency Builder',
    
    // Advanced Tier (200-290)
    200: 'Advanced Trader',
    210: 'Market Engineer',
    220: 'Institutional Reader',
    230: 'Liquidity Technician',
    240: 'Algorithmic Thinker',
    250: 'Smart Money Trader',
    260: 'Macro Analyst',
    270: 'Scalping Specialist',
    280: 'Swing Commander',
    290: 'Strategy Architect',
    
    // Professional Tier (300-390)
    300: 'Pro Trader',
    310: 'Market Controller',
    320: 'Execution Specialist',
    330: 'Risk Architect',
    340: 'Trading Mentor',
    350: 'Market Professor',
    360: 'Hedge Strategist',
    370: 'Alpha Generator',
    380: 'Capital Protector',
    390: 'Performance Coach',
    
    // Elite Tier (400-490)
    400: 'Elite Trader',
    410: 'Institutional Operative',
    420: 'Liquidity Commander',
    430: 'Fund Manager',
    440: 'Prop Firm Trader',
    450: 'Portfolio Architect',
    460: 'Market Dominator',
    470: 'Capital General',
    480: 'Alpha Lord',
    490: 'Risk Emperor',
    
    // Master Tier (500-590)
    500: 'Trading Master',
    510: 'Market Grandmaster',
    520: 'Capital Controller',
    530: 'Liquidity King',
    540: 'Hedge Fund Mind',
    550: 'Strategy Overlord',
    560: 'Institutional Elite',
    570: 'Execution God',
    580: 'Risk Titan',
    590: 'Market Titan',
    
    // Legend Tier (600-690)
    600: 'Trading Legend',
    610: 'Market Phantom',
    620: 'Liquidity Beast',
    630: 'Alpha Hunter',
    640: 'Capital Predator',
    650: 'Market Warlord',
    660: 'Institutional Beast',
    670: 'Strategy Demon',
    680: 'Risk Assassin',
    690: 'Chart God',
    
    // Mythical Tier (700-790)
    700: 'Mythical Trader',
    710: 'Market Deity',
    720: 'Liquidity God',
    730: 'Alpha Reaper',
    740: 'Capital Emperor',
    750: 'Market Destroyer',
    760: 'Institutional Lord',
    770: 'Strategy King',
    780: 'Risk Immortal',
    790: 'Chart Immortal',
    
    // Immortal Tier (800-890)
    800: 'Immortal Trader',
    810: 'Market Immortal',
    820: 'Liquidity Immortal',
    830: 'Alpha Immortal',
    840: 'Capital Immortal',
    850: 'Strategy Immortal',
    860: 'Risk Immortal',
    870: 'Chart Immortal',
    880: 'Institutional Immortal',
    890: 'Trading Immortal',
    
    // God Tier (900-1000)
    900: 'Trading God',
    910: 'Market God',
    920: 'Liquidity God',
    930: 'Alpha God',
    940: 'Capital God',
    950: 'Strategy God',
    960: 'Risk God',
    970: 'Chart God',
    980: 'Institutional God',
    990: 'Supreme Trader',
    1000: 'Aura FX Legend'
};

/**
 * Get rank title for a given level
 */
export const getRankTitle = (level) => {
    if (level >= 1000) return TRADING_RANKS[1000];
    if (level >= 990) return TRADING_RANKS[990];
    if (level >= 980) return TRADING_RANKS[980];
    if (level >= 970) return TRADING_RANKS[970];
    if (level >= 960) return TRADING_RANKS[960];
    if (level >= 950) return TRADING_RANKS[950];
    if (level >= 940) return TRADING_RANKS[940];
    if (level >= 930) return TRADING_RANKS[930];
    if (level >= 920) return TRADING_RANKS[920];
    if (level >= 910) return TRADING_RANKS[910];
    if (level >= 900) return TRADING_RANKS[900];
    
    // Find the highest rank milestone the user has reached
    const milestones = Object.keys(TRADING_RANKS).map(Number).sort((a, b) => b - a);
    for (const milestone of milestones) {
        if (level >= milestone) {
            return TRADING_RANKS[milestone];
        }
    }
    
    return 'Trading Novice'; // Default for levels below 10
};

/**
 * Get tier name for a level
 */
export const getTierName = (level) => {
    if (level >= 900) return 'God Tier';
    if (level >= 800) return 'Immortal Tier';
    if (level >= 700) return 'Mythical Tier';
    if (level >= 600) return 'Legend Tier';
    if (level >= 500) return 'Master Tier';
    if (level >= 400) return 'Elite Tier';
    if (level >= 300) return 'Professional Tier';
    if (level >= 200) return 'Advanced Tier';
    if (level >= 100) return 'Intermediate Tier';
    return 'Beginner Tier';
};

/**
 * Get tier color for styling
 */
export const getTierColor = (level) => {
    if (level >= 900) return '#FFD700'; // Gold
    if (level >= 800) return '#C0C0C0'; // Silver
    if (level >= 700) return '#FF69B4'; // Hot Pink
    if (level >= 600) return '#FF4500'; // Orange Red
    if (level >= 500) return '#9370DB'; // Medium Purple
    if (level >= 400) return '#00CED1'; // Dark Turquoise
    if (level >= 300) return '#32CD32'; // Lime Green
    if (level >= 200) return '#1E90FF'; // Dodger Blue
    if (level >= 100) return '#FFA500'; // Orange
    return '#808080'; // Gray
};

/**
 * Calculate level from XP
 * Scaling: Early levels easy, higher levels harder
 * Formula: Level = floor(sqrt(XP / scaling_factor)) + 1
 * 
 * Scaling factors:
 * - Levels 1-10: 50 XP per level (easy start)
 * - Levels 11-50: 100 XP per level
 * - Levels 51-100: 200 XP per level
 * - Levels 101-200: 500 XP per level
 * - Levels 201-500: 1000 XP per level
 * - Levels 501-1000: 2000 XP per level
 */
export const getLevelFromXP = (xp) => {
    if (xp <= 0) return 1;
    if (xp >= 1000000) return 1000; // Cap at 1000
    
    // Progressive scaling
    if (xp < 500) {
        // Levels 1-10: Easy start
        return Math.floor(Math.sqrt(xp / 50)) + 1;
    } else if (xp < 5000) {
        // Levels 11-50
        const baseLevel = 10;
        const remainingXP = xp - 500;
        return baseLevel + Math.floor(Math.sqrt(remainingXP / 100)) + 1;
    } else if (xp < 20000) {
        // Levels 51-100
        const baseLevel = 50;
        const remainingXP = xp - 5000;
        return baseLevel + Math.floor(Math.sqrt(remainingXP / 200)) + 1;
    } else if (xp < 100000) {
        // Levels 101-200
        const baseLevel = 100;
        const remainingXP = xp - 20000;
        return baseLevel + Math.floor(Math.sqrt(remainingXP / 500)) + 1;
    } else if (xp < 500000) {
        // Levels 201-500
        const baseLevel = 200;
        const remainingXP = xp - 100000;
        return baseLevel + Math.floor(Math.sqrt(remainingXP / 1000)) + 1;
    } else {
        // Levels 501-1000
        const baseLevel = 500;
        const remainingXP = xp - 500000;
        return Math.min(1000, baseLevel + Math.floor(Math.sqrt(remainingXP / 2000)) + 1);
    }
};

/**
 * Get XP required for next level
 */
export const getXPForNextLevel = (currentLevel) => {
    if (currentLevel >= 1000) return Infinity; // Max level
    
    // Reverse the formula based on level range
    if (currentLevel < 10) {
        return Math.pow(currentLevel, 2) * 50;
    } else if (currentLevel < 50) {
        const baseXP = 500;
        const levelDiff = currentLevel - 10;
        return baseXP + Math.pow(levelDiff, 2) * 100;
    } else if (currentLevel < 100) {
        const baseXP = 5000;
        const levelDiff = currentLevel - 50;
        return baseXP + Math.pow(levelDiff, 2) * 200;
    } else if (currentLevel < 200) {
        const baseXP = 20000;
        const levelDiff = currentLevel - 100;
        return baseXP + Math.pow(levelDiff, 2) * 500;
    } else if (currentLevel < 500) {
        const baseXP = 100000;
        const levelDiff = currentLevel - 200;
        return baseXP + Math.pow(levelDiff, 2) * 1000;
    } else {
        const baseXP = 500000;
        const levelDiff = currentLevel - 500;
        return baseXP + Math.pow(levelDiff, 2) * 2000;
    }
};

/**
 * Get XP progress for current level
 */
export const getXPProgress = (currentXP, currentLevel) => {
    const xpForCurrentLevel = currentLevel > 1 ? getXPForNextLevel(currentLevel - 1) : 0;
    const xpForNextLevel = getXPForNextLevel(currentLevel);
    const xpInCurrentLevel = currentXP - xpForCurrentLevel;
    const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
    
    return {
        current: xpInCurrentLevel,
        needed: xpNeededForNext,
        percentage: Math.min(100, (xpInCurrentLevel / xpNeededForNext) * 100)
    };
};

/**
 * Check if action is on cooldown
 */
export const isOnCooldown = (actionType, lastActionTime) => {
    if (!lastActionTime) return false;
    const cooldown = XP_COOLDOWNS[actionType];
    if (!cooldown) return false;
    return Date.now() - lastActionTime < cooldown;
};

/**
 * Calculate XP for a message
 */
export const calculateMessageXP = (messageContent, hasFile) => {
    let totalXP = XP_REWARDS.MESSAGE;
    
    if (hasFile) {
        totalXP += XP_REWARDS.FILE_ATTACHMENT;
    }
    
    // Emoji bonus
    const emojiRegex = /[\p{Emoji}]/gu;
    const emojiMatches = messageContent.match(emojiRegex);
    if (emojiMatches) {
        totalXP += emojiMatches.length * XP_REWARDS.EMOJI_BONUS;
    }
    
    return Math.round(totalXP * 100) / 100; // Round to 2 decimals
};

/**
 * Get next rank milestone
 */
export const getNextRankMilestone = (currentLevel) => {
    const milestones = Object.keys(TRADING_RANKS).map(Number).sort((a, b) => a - b);
    for (const milestone of milestones) {
        if (currentLevel < milestone) {
            return {
                level: milestone,
                title: TRADING_RANKS[milestone],
                xpNeeded: getXPForNextLevel(currentLevel)
            };
        }
    }
    return null; // Max level reached
};
