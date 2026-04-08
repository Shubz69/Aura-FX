const VERSION = 1;

function key(userId) {
  return `aura_analysis_filter_presets_v${VERSION}_${userId != null ? String(userId) : 'anon'}`;
}

export function readFilterPresets(userId) {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function writeFilterPresets(userId, presets) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(presets));
  } catch {
    /* quota */
  }
}
