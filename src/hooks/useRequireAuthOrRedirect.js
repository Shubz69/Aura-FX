import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    savePostAuthRedirect,
    extractPlanFromPath
} from '../utils/postAuthRedirect';

const DEFAULT_NEXT_PATH = '/choose-plan';
const DEFAULT_REDIRECT_DESTINATION = '/signup';

const sanitizePath = (path) => {
    if (!path || typeof path !== 'string') {
        return DEFAULT_NEXT_PATH;
    }
    const trimmed = path.trim();
    if (!trimmed) {
        return DEFAULT_NEXT_PATH;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const url = new URL(trimmed);
            return `${url.pathname}${url.search}`;
        } catch {
            return DEFAULT_NEXT_PATH;
        }
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const useRequireAuthOrRedirect = (
    defaultNextPath = DEFAULT_NEXT_PATH,
    options = {}
) => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const redirectTarget = options.redirectTo || DEFAULT_REDIRECT_DESTINATION;

    return useCallback(
        (nextPath) => {
            const resolvedNext = sanitizePath(nextPath || defaultNextPath);

            if (isAuthenticated) {
                return true;
            }

            const plan = extractPlanFromPath(resolvedNext);
            const from = `${location.pathname}${location.search}`;

            savePostAuthRedirect({
                next: resolvedNext,
                plan,
                from
            });

            let destination = `${redirectTarget}?next=${encodeURIComponent(resolvedNext)}`;
            if (plan) {
                destination += `&plan=${encodeURIComponent(plan)}`;
            }

            navigate(destination, { replace: false });
            return false;
        },
        [defaultNextPath, isAuthenticated, navigate, redirectTarget, location.pathname, location.search]
    );
};

export default useRequireAuthOrRedirect;
