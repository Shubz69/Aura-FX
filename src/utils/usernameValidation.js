// Username validation utility
// Family-friendly username validation with profanity filter

// List of inappropriate words (family-friendly filter)
const INAPPROPRIATE_WORDS = [
    // Profanity (common words)
    'fuck', 'shit', 'damn', 'hell', 'ass', 'bitch', 'bastard', 'crap',
    // Sexual content
    'sex', 'porn', 'xxx', 'nsfw',
    // Violence
    'kill', 'murder', 'death', 'violence',
    // Drugs
    'drug', 'cocaine', 'heroin', 'marijuana', 'weed',
    // Hate speech
    'hate', 'racist', 'nazi',
    // Other inappropriate
    'stupid', 'idiot', 'moron', 'retard'
];

// Check if username contains inappropriate words
export const containsInappropriateWords = (username) => {
    const lowerUsername = username.toLowerCase();
    return INAPPROPRIATE_WORDS.some(word => lowerUsername.includes(word));
};

// Validate username format and content
export const validateUsername = (username) => {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }

    const trimmed = username.trim();

    // Length check
    if (trimmed.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters long' };
    }

    if (trimmed.length > 30) {
        return { valid: false, error: 'Username must be 30 characters or less' };
    }

    // Check for inappropriate words
    if (containsInappropriateWords(trimmed)) {
        return { valid: false, error: 'Username contains inappropriate content. Please choose a family-friendly username.' };
    }

    // Allow letters, numbers, spaces, hyphens, underscores
    // Spaces are allowed but not at start/end
    if (trimmed.startsWith(' ') || trimmed.endsWith(' ')) {
        return { valid: false, error: 'Username cannot start or end with a space' };
    }

    // Check for valid characters (letters, numbers, spaces, hyphens, underscores)
    const validPattern = /^[a-zA-Z0-9\s_-]+$/;
    if (!validPattern.test(trimmed)) {
        return { valid: false, error: 'Username can only contain letters, numbers, spaces, hyphens, and underscores' };
    }

    // Check for consecutive spaces (more than 1 space in a row)
    if (/\s{2,}/.test(trimmed)) {
        return { valid: false, error: 'Username cannot contain consecutive spaces' };
    }

    return { valid: true, error: null };
};

// Check if user can change username (30-day cooldown)
export const canChangeUsername = (lastUsernameChangeDate) => {
    if (!lastUsernameChangeDate) {
        return { canChange: true, daysRemaining: 0 };
    }

    const lastChange = new Date(lastUsernameChangeDate);
    const now = new Date();
    const daysSinceChange = Math.floor((now - lastChange) / (1000 * 60 * 60 * 24));
    const daysRemaining = 30 - daysSinceChange;

    return {
        canChange: daysRemaining <= 0,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0
    };
};

// Format cooldown message
export const getCooldownMessage = (daysRemaining) => {
    if (daysRemaining === 0) {
        return 'You can change your username now.';
    }
    if (daysRemaining === 1) {
        return 'You can change your username in 1 day.';
    }
    return `You can change your username in ${daysRemaining} days.`;
};
