import { useEffect } from 'react';
import {
  applySiteLanguage,
  getPreferredSiteLanguage,
  SITE_LANGUAGE_CHANGED_EVENT,
  SITE_LANGUAGES,
} from '../utils/siteLanguage';

const TRANSLATE_ROOT_ID = 'aura-google-translate-root';
const TRANSLATE_SCRIPT_ID = 'aura-google-translate-script';
const TRANSLATE_CALLBACK = 'auraGoogleTranslateInit';

function ensureHiddenRoot() {
  let root = document.getElementById(TRANSLATE_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = TRANSLATE_ROOT_ID;
    root.style.display = 'none';
    document.body.appendChild(root);
  }
  return root;
}

function initTranslateWidget() {
  if (!window.google?.translate?.TranslateElement) return;
  ensureHiddenRoot();
  if (window.__auraGoogleTranslateLoaded) return;

  // Keep language list in sync with settings select.
  const includedLanguages = SITE_LANGUAGES.map((l) => l.code).join(',');
  // eslint-disable-next-line no-new
  new window.google.translate.TranslateElement(
    {
      pageLanguage: 'en',
      autoDisplay: false,
      includedLanguages,
      layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
    },
    TRANSLATE_ROOT_ID,
  );
  window.__auraGoogleTranslateLoaded = true;
}

function shouldLoadTranslateForLanguage(lang) {
  return !!lang && lang !== 'en';
}

function ensureTranslateScriptLoaded() {
  if (window.google?.translate?.TranslateElement) {
    return;
  }
  if (document.getElementById(TRANSLATE_SCRIPT_ID)) {
    return;
  }
  const script = document.createElement('script');
  script.id = TRANSLATE_SCRIPT_ID;
  script.src = `https://translate.google.com/translate_a/element.js?cb=${TRANSLATE_CALLBACK}`;
  script.async = true;
  document.body.appendChild(script);
}

export default function SiteLanguageBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const onLanguageChanged = (e) => {
      const lang = e?.detail?.language || getPreferredSiteLanguage();
      if (shouldLoadTranslateForLanguage(lang)) {
        if (window.google?.translate?.TranslateElement) {
          initTranslateWidget();
        } else {
          ensureTranslateScriptLoaded();
        }
      }
    };
    window.addEventListener(SITE_LANGUAGE_CHANGED_EVENT, onLanguageChanged);

    window[TRANSLATE_CALLBACK] = () => {
      initTranslateWidget();
      applySiteLanguage(getPreferredSiteLanguage(), {
        persist: false,
        forceReloadFallback: false,
      });
    };

    const preferredLanguage = getPreferredSiteLanguage();
    if (!shouldLoadTranslateForLanguage(preferredLanguage)) {
      return () => {
        window.removeEventListener(SITE_LANGUAGE_CHANGED_EVENT, onLanguageChanged);
      };
    }

    if (window.google?.translate?.TranslateElement) {
      window[TRANSLATE_CALLBACK]();
    } else {
      ensureTranslateScriptLoaded();
    }

    return () => {
      window.removeEventListener(SITE_LANGUAGE_CHANGED_EVENT, onLanguageChanged);
    };
  }, []);

  return null;
}
