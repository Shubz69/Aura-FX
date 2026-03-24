/**
 * AURA TERMINAL XP System (Premium v2)
 * - 100 levels max
 * - Total XP to reach level 100: 1,000,000 (power curve)
 * - Tier ladder preserved: Beginner → Intermediate → Advanced → Professional → Elite → Master → Legend → Mythical → Immortal → GOD
 */

export const MAX_LEVEL = 100;

/** Cumulative XP required to be at level 100 (must match api/utils/xp-system.js). */
export const TOTAL_XP_FOR_LEVEL_100 = 1_000_000;

/** Shape of the level curve; 2.0 = quadratic scaling from level 1→100. */
export const LEVEL_CURVE_GAMMA = 2.0;

const FOUR_DP = 10000;
const round2 = (n) => Math.round((Number(n) || 0) * FOUR_DP) / FOUR_DP;

/** Max XP from a single chat message (anti-spam). */
export const MESSAGE_XP_CAP = 0.45;

// Routine non-chat awards capped at 5 XP; chat kept low (see calculateMessageXP).
export const XP_REWARDS = {
    MESSAGE: 0.12,
    FILE_ATTACHMENT: 0.12,
    EMOJI_BONUS: 0.02,
    DAILY_LOGIN: 3.5,
    COURSE_COMPLETION: 5,
    HELPING_USER: 4,
    JOURNAL_ENTRY: 4,
    RULE_VIOLATION: -50
};

export const XP_COOLDOWNS = {
    MESSAGE: 120000,          // 2 min
    DAILY_LOGIN: 86400000,    // 24h
    JOURNAL_ENTRY: 86400000,  // 24h
    HELPING_USER: 3600000     // 1h
};

const TIER_NAMES = [
    'Beginner Tier',
    'Intermediate Tier',
    'Advanced Tier',
    'Professional Tier',
    'Elite Tier',
    'Master Tier',
    'Legend Tier',
    'Mythical Tier',
    'Immortal Tier',
    'GOD Tier'
];

const TIER_COLORS = [
    '#7d8597',
    '#8f8bff',
    '#3ea0ff',
    '#2ed8a7',
    '#eaa960',
    '#f8c37d',
    '#f59e0b',
    '#d97706',
    '#f5d98b',
    '#ffd700'
];

const TIER_RANK_NAMES = [
    ['Market Initiate', 'Session Observer', 'Chart Apprentice', 'Bias Student', 'Structure Novice', 'Range Reader', 'Risk Learner', 'Execution Rookie', 'Momentum Trainee', 'Pattern Seeker'],
    ['Trend Practitioner', 'Liquidity Reader', 'Zone Apprentice', 'Reaction Analyst', 'Discipline Builder', 'Consistency Seeker', 'Setup Tracker', 'Candle Technician', 'Price Cartographer', 'Signal Operator'],
    ['Session Specialist', 'Structure Specialist', 'Flow Analyst', 'Liquidity Specialist', 'Refinement Analyst', 'Confirmation Specialist', 'Risk Technician', 'Execution Technician', 'Momentum Specialist', 'Precision Trader'],
    ['Model Professional', 'System Professional', 'Process Professional', 'Edge Professional', 'Macro Professional', 'Confluence Professional', 'Execution Professional', 'Risk Professional', 'Performance Professional', 'Capital Professional'],
    ['Institutional Scout', 'Institutional Analyst', 'Institutional Operator', 'Institutional Tactician', 'Institutional Strategist', 'Institutional Executor', 'Institutional Specialist', 'Institutional Architect', 'Institutional Commander', 'Institutional Elite'],
    ['Master of Structure', 'Master of Flow', 'Master of Timing', 'Master of Confirmation', 'Master of Risk', 'Master of Execution', 'Master of Confluence', 'Master of Process', 'Master of Discipline', 'Trading Master'],
    ['Legendary Reader', 'Legendary Operator', 'Legendary Strategist', 'Legendary Executor', 'Legendary Risk Manager', 'Legendary Tactician', 'Legendary Architect', 'Legendary Commander', 'Legendary Specialist', 'Trading Legend'],
    ['Mythic Analyst', 'Mythic Strategist', 'Mythic Executor', 'Mythic Risk Architect', 'Mythic Commander', 'Mythic Operator', 'Mythic Specialist', 'Mythic Mastermind', 'Mythic Sovereign', 'Mythical Trader'],
    ['Immortal Analyst', 'Immortal Strategist', 'Immortal Executor', 'Immortal Risk Lord', 'Immortal Commander', 'Immortal Architect', 'Immortal Specialist', 'Immortal Sovereign', 'Immortal Grandmaster', 'Immortal Trader'],
    ['God of Structure', 'God of Timing', 'God of Confirmation', 'God of Execution', 'God of Risk', 'God of Process', 'God of Discipline', 'God of Edge', 'Supreme Trader', 'AURA TERMINAL God']
];

export const TRADING_RANKS = (() => {
    const out = {};
    let level = 1;
    for (let tier = 0; tier < TIER_RANK_NAMES.length; tier += 1) {
        for (let i = 0; i < TIER_RANK_NAMES[tier].length; i += 1) {
            out[level] = TIER_RANK_NAMES[tier][i];
            level += 1;
        }
    }
    return out;
})();

export const xpRequiredForLevel = (level) => {
    if (level <= 1) return 0;
    const l = level - 1;
    return round2(TOTAL_XP_FOR_LEVEL_100 * (l / 99) ** LEVEL_CURVE_GAMMA);
};

/** Daily login XP only (streak milestones are awarded server-side in daily-login). */
export const calculateLoginXP = (_streak) => {
    return round2(XP_REWARDS.DAILY_LOGIN);
};

export const getRankTitle = (level) => {
    const lv = Math.max(1, Math.min(MAX_LEVEL, parseInt(level, 10) || 1));
    return TRADING_RANKS[lv] || 'Market Initiate';
};

export const getTierName = (level) => {
    const lv = Math.max(1, Math.min(MAX_LEVEL, parseInt(level, 10) || 1));
    const tierIdx = Math.floor((lv - 1) / 10);
    return TIER_NAMES[tierIdx] || TIER_NAMES[0];
};

export const getTierColor = (level) => {
    const lv = Math.max(1, Math.min(MAX_LEVEL, parseInt(level, 10) || 1));
    const tierIdx = Math.floor((lv - 1) / 10);
    return TIER_COLORS[tierIdx] || TIER_COLORS[0];
};

export const getLevelFromXP = (xp) => {
    const n = Math.max(0, Number(xp) || 0);
    if (n <= 0) return 1;
    if (n >= xpRequiredForLevel(MAX_LEVEL)) return MAX_LEVEL;
    for (let level = MAX_LEVEL; level >= 1; level -= 1) {
        if (n >= xpRequiredForLevel(level)) return level;
    }
    return 1;
};

export const getXPForNextLevel = (currentLevel) => {
    const lv = Math.max(1, parseInt(currentLevel, 10) || 1);
    if (lv >= MAX_LEVEL) return Infinity;
    return xpRequiredForLevel(lv + 1);
};

/**
 * Get XP progress for current level
 */
export const getXPProgress = (currentXP, currentLevel) => {
    const lv = Math.max(1, Math.min(MAX_LEVEL, parseInt(currentLevel, 10) || 1));
    const xp = Math.max(0, Number(currentXP) || 0);
    if (lv >= MAX_LEVEL) {
        return {
            current: 0,
            needed: 0,
            percentage: 100
        };
    }
    
    // Calculate XP thresholds for current and next level
    const xpForCurrentLevel = lv > 1 ? xpRequiredForLevel(lv) : 0;
    const xpForNextLevel = getXPForNextLevel(lv);
    
    // XP in current level (how much XP the user has earned in this level)
    const xpInCurrentLevel = Math.max(0, xp - xpForCurrentLevel);
    
    // XP needed to reach next level from current level threshold
    const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
    
    // Calculate percentage (ensure it's between 0 and 100)
    const percentage = xpNeededForNext > 0 
        ? Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNext) * 100))
        : 100;
    
    return {
        current: round2(Math.max(0, xpInCurrentLevel)),
        needed: round2(Math.max(0.01, xpNeededForNext)),
        percentage: percentage
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

    const emojiRegex = /[\p{Emoji}]/gu;
    const emojiMatches = messageContent.match(emojiRegex);
    if (emojiMatches) {
        const emojiCount = Math.min(emojiMatches.length, 5);
        totalXP += emojiCount * XP_REWARDS.EMOJI_BONUS;
    }

    return round2(Math.min(MESSAGE_XP_CAP, totalXP));
};

/**
 * Get next rank milestone
 */
export const getNextRankMilestone = (currentLevel) => {
    const lv = Math.max(1, Math.min(MAX_LEVEL, parseInt(currentLevel, 10) || 1));
    const milestones = Object.keys(TRADING_RANKS).map(Number).sort((a, b) => a - b);
    for (const milestone of milestones) {
        if (lv < milestone) {
            return {
                level: milestone,
                title: TRADING_RANKS[milestone],
                xpNeeded: getXPForNextLevel(lv)
            };
        }
    }
    return null; // Max level reached
};
