import i18n from '../i18n/config';
import { RTL_LANGUAGES, SUPPORTED_LANGUAGES } from '../i18n/languages';

export const SITE_LANGUAGE_STORAGE_KEY = 'aura_site_language_pref';
export const SITE_LANGUAGE_CHANGED_EVENT = 'aura-site-language-changed';
export const SITE_LANGUAGES = SUPPORTED_LANGUAGES;

const SITE_LANGUAGE_SET = new Set(SITE_LANGUAGES.map((l) => l.code));

export function normalizeSiteLanguage(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (SITE_LANGUAGE_SET.has(value)) return value;
  const base = value.split('-')[0];
  if (base === 'zh') return 'zh-CN';
  const found = SITE_LANGUAGES.find((l) => l.code === base);
  return found ? found.code : null;
}

export function isRtlLanguage(language) {
  return RTL_LANGUAGES.has(language);
}

export function applyDocumentLanguage(language) {
  if (typeof document === 'undefined') return;
  const lang = normalizeSiteLanguage(language) || 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtlLanguage(lang) ? 'rtl' : 'ltr';
}

export function detectBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'en';
  const candidates = [
    navigator.language,
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
  ];
  for (const item of candidates) {
    const normalized = normalizeSiteLanguage(item);
    if (normalized) return normalized;
  }
  return 'en';
}

export function getPreferredSiteLanguage() {
  try {
    const raw = localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY);
    const saved = normalizeSiteLanguage(raw);
    if (saved) return saved;
    if (raw && String(raw).trim()) {
      try {
        localStorage.removeItem(SITE_LANGUAGE_STORAGE_KEY);
      } catch {}
    }
  } catch {}
  return detectBrowserLanguage();
}

export async function applySiteLanguage(lang, options = {}) {
  const { persist = true } = options;
  const code = normalizeSiteLanguage(lang) || 'en';

  if (persist) {
    try {
      localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, code);
    } catch {}
  }

  applyDocumentLanguage(code);
  if (i18n.language !== code) {
    await i18n.changeLanguage(code);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SITE_LANGUAGE_CHANGED_EVENT, { detail: { language: code } }));
  }
}
