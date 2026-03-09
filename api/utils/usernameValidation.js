// utils/usernameValidation.js

/**
 * Validates a username for format requirements
 * @param {string} username - The username to validate
 * @returns {Object} - Validation result with isValid boolean and error message
 */
export const validateUsername = (username) => {
    if (!username || typeof username !== 'string') {
        return {
            isValid: false,
            error: "Username is required"
        };
    }

    const trimmed = username.trim();
    
    // Check if empty after trimming
    if (trimmed.length === 0) {
        return {
            isValid: false,
            error: "Username cannot be empty"
        };
    }
    
    // Check length (3-20 characters)
    if (trimmed.length < 3) {
        return {
            isValid: false,
            error: "Username must be at least 3 characters long"
        };
    }
    
    if (trimmed.length > 20) {
        return {
            isValid: false,
            error: "Username cannot exceed 20 characters"
        };
    }
    
    // Check allowed characters (letters, numbers, underscores, hyphens)
    const allowedCharsRegex = /^[a-zA-Z0-9_-]+$/;
    if (!allowedCharsRegex.test(trimmed)) {
        return {
            isValid: false,
            error: "Username can only contain letters, numbers, underscores (_), and hyphens (-)"
        };
    }
    
    // Check if starts/ends with valid character (not underscore or hyphen at boundaries)
    if (trimmed.startsWith('_') || trimmed.startsWith('-')) {
        return {
            isValid: false,
            error: "Username cannot start with underscore (_) or hyphen (-)"
        };
    }
    
    if (trimmed.endsWith('_') || trimmed.endsWith('-')) {
        return {
            isValid: false,
            error: "Username cannot end with underscore (_) or hyphen (-)"
        };
    }
    
    // Check for consecutive special characters
    if (trimmed.includes('__') || trimmed.includes('--') || 
        trimmed.includes('_-') || trimmed.includes('-_')) {
        return {
            isValid: false,
            error: "Username cannot contain consecutive special characters"
        };
    }
    
    // Check for profanity (you can expand this list)
    const profanityList = ['admin', 'root', 'system', 'moderator', 'support']; // Add more as needed
    const lowercased = trimmed.toLowerCase();
    if (profanityList.some(word => lowercased.includes(word))) {
        return {
            isValid: false,
            error: "Username contains restricted words"
        };
    }
    
    return {
        isValid: true,
        error: null
    };
};

/**
 * Checks if a user can change their username based on cooldown period
 * @param {string} lastChangeDate - ISO date string of last username change
 * @returns {Object} - Result with canChange boolean and daysRemaining
 */
export const canChangeUsername = (lastChangeDate) => {
    if (!lastChangeDate) {
        return { 
            canChange: true, 
            daysRemaining: 0,
            hoursRemaining: 0
        };
    }
    
    const lastChange = new Date(lastChangeDate);
    const now = new Date();
    
    // Calculate difference in milliseconds
    const diffTime = Math.abs(now - lastChange);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    
    const cooldownDays = 30; // 30 day cooldown period
    
    return {
        canChange: diffDays >= cooldownDays,
        daysRemaining: Math.max(0, cooldownDays - diffDays),
        hoursRemaining: Math.max(0, (cooldownDays * 24) - diffHours),
        lastChangeDate: lastChangeDate
    };
};

/**
 * Gets a user-friendly message about username change cooldown
 * @param {string} lastChangeDate - ISO date string of last username change
 * @returns {string} - Cooldown message
 */
export const getCooldownMessage = (lastChangeDate) => {
    if (!lastChangeDate) {
        return "You can change your username now";
    }
    
    const { canChange, daysRemaining, hoursRemaining, lastChangeDate: lastChange } = canChangeUsername(lastChangeDate);
    
    if (canChange) {
        return "You can change your username now";
    }
    
    // Format the last change date for display
    const lastChangeObj = new Date(lastChange);
    const formattedDate = lastChangeObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    if (daysRemaining > 0) {
        return `You can change your username in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (last changed: ${formattedDate})`;
    } else {
        return `You can change your username in ${hoursRemaining} hour${hoursRemaining === 1 ? '' : 's'} (last changed: ${formattedDate})`;
    }
};

/**
 * Formats the last username change date for display
 * @param {string} lastChangeDate - ISO date string
 * @returns {string} - Formatted date string
 */
export const formatLastUsernameChange = (lastChangeDate) => {
    if (!lastChangeDate) return 'Never';
    
    const date = new Date(lastChangeDate);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};