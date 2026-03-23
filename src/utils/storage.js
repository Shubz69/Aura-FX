export const safeParseJSON = (raw, fallback = {}) => {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const getStoredUser = () => {
  if (typeof window === 'undefined') return {};
  return safeParseJSON(window.localStorage.getItem('user'), {});
};
