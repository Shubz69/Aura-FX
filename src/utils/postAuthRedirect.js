const STORAGE_KEY = 'postAuthRedirect';
const DEFAULT_FALLBACK = '/choose-plan';

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const sanitizeInternalPath = (input, fallback = DEFAULT_FALLBACK) => {
    if (!input || typeof input !== 'string') {
        return fallback;
    }

    const trimmed = input.trim();
    if (!trimmed) {
        return fallback;
    }

    // Reject absolute URLs that don't match current origin
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        if (!isBrowser()) {
            return fallback;
        }

        try {
            const url = new URL(trimmed);
            if (url.origin !== window.location.origin) {
                return fallback;
            }
            return `${url.pathname}${url.search}`;
        } catch (err) {
            console.warn('Failed to parse redirect URL, falling back to default', err);
            return fallback;
        }
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const extractPlanFromPath = (path) => {
    if (!path || typeof path !== 'string') {
        return null;
    }

    try {
        const [, search = ''] = path.split('?');
        if (!search) {
            return null;
        }
        const params = new URLSearchParams(search);
        const plan = params.get('plan');
        return plan ? plan.toLowerCase() : null;
    } catch {
        return null;
    }
};

export const savePostAuthRedirect = ({ next, plan, from }) => {
    if (!isBrowser()) {
        return;
    }

    const sanitizedNext = sanitizeInternalPath(next);
    if (!sanitizedNext) {
        return;
    }

    const normalizedPlan = (plan || extractPlanFromPath(sanitizedNext) || '').toLowerCase() || null;

    const payload = {
        next: sanitizedNext,
        plan: normalizedPlan,
        from: typeof from === 'string' ? from : null,
        timestamp: Date.now()
    };

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn('Unable to persist post-auth redirect', err);
    }
};

export const loadPostAuthRedirect = () => {
    if (!isBrowser()) {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            window.localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch (err) {
        console.warn('Failed to read post-auth redirect from storage', err);
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
    }
};

export const clearPostAuthRedirect = () => {
    if (!isBrowser()) {
        return;
    }

    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear post-auth redirect', err);
    }
};

export const consumePostAuthRedirect = () => {
    const data = loadPostAuthRedirect();
    if (data) {
        clearPostAuthRedirect();
    }
    return data;
};

export const getPostAuthRedirectKey = () => STORAGE_KEY;

export const ensurePostAuthRedirect = (options = {}) => {
    const { next = DEFAULT_FALLBACK, plan, from } = options;
    savePostAuthRedirect({ next, plan, from });
};

const postAuthRedirect = {
    savePostAuthRedirect,
    loadPostAuthRedirect,
    consumePostAuthRedirect,
    clearPostAuthRedirect,
    ensurePostAuthRedirect,
    extractPlanFromPath,
    getPostAuthRedirectKey
};

export default postAuthRedirect;
