export const SITE_LANGUAGE_STORAGE_KEY = 'aura_site_language_pref';
export const SITE_LANGUAGE_CHANGED_EVENT = 'aura-site-language-changed';

// Broad language list backed by Google Translate's client widget.
export const SITE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian' },
  { code: 'am', label: 'Amharic' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hy', label: 'Armenian' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'eu', label: 'Basque' },
  { code: 'be', label: 'Belarusian' },
  { code: 'bn', label: 'Bengali' },
  { code: 'bs', label: 'Bosnian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ca', label: 'Catalan' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'ny', label: 'Chichewa' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'co', label: 'Corsican' },
  { code: 'hr', label: 'Croatian' },
  { code: 'cs', label: 'Czech' },
  { code: 'da', label: 'Danish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'eo', label: 'Esperanto' },
  { code: 'et', label: 'Estonian' },
  { code: 'tl', label: 'Filipino' },
  { code: 'fi', label: 'Finnish' },
  { code: 'fr', label: 'French' },
  { code: 'fy', label: 'Frisian' },
  { code: 'gl', label: 'Galician' },
  { code: 'ka', label: 'Georgian' },
  { code: 'de', label: 'German' },
  { code: 'el', label: 'Greek' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ht', label: 'Haitian Creole' },
  { code: 'ha', label: 'Hausa' },
  { code: 'haw', label: 'Hawaiian' },
  { code: 'iw', label: 'Hebrew' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hmn', label: 'Hmong' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'is', label: 'Icelandic' },
  { code: 'ig', label: 'Igbo' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ga', label: 'Irish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'jw', label: 'Javanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'km', label: 'Khmer' },
  { code: 'ko', label: 'Korean' },
  { code: 'ku', label: 'Kurdish (Kurmanji)' },
  { code: 'ky', label: 'Kyrgyz' },
  { code: 'lo', label: 'Lao' },
  { code: 'la', label: 'Latin' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'lb', label: 'Luxembourgish' },
  { code: 'mk', label: 'Macedonian' },
  { code: 'mg', label: 'Malagasy' },
  { code: 'ms', label: 'Malay' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mt', label: 'Maltese' },
  { code: 'mi', label: 'Maori' },
  { code: 'mr', label: 'Marathi' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'my', label: 'Myanmar (Burmese)' },
  { code: 'ne', label: 'Nepali' },
  { code: 'no', label: 'Norwegian' },
  { code: 'or', label: 'Odia' },
  { code: 'ps', label: 'Pashto' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ro', label: 'Romanian' },
  { code: 'ru', label: 'Russian' },
  { code: 'sm', label: 'Samoan' },
  { code: 'gd', label: 'Scots Gaelic' },
  { code: 'sr', label: 'Serbian' },
  { code: 'st', label: 'Sesotho' },
  { code: 'sn', label: 'Shona' },
  { code: 'sd', label: 'Sindhi' },
  { code: 'si', label: 'Sinhala' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'so', label: 'Somali' },
  { code: 'es', label: 'Spanish' },
  { code: 'su', label: 'Sundanese' },
  { code: 'sw', label: 'Swahili' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tg', label: 'Tajik' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'th', label: 'Thai' },
  { code: 'tr', label: 'Turkish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ug', label: 'Uyghur' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'cy', label: 'Welsh' },
  { code: 'xh', label: 'Xhosa' },
  { code: 'yi', label: 'Yiddish' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'zu', label: 'Zulu' },
  { code: 'ak', label: 'Akan' },
  { code: 'as', label: 'Assamese' },
  { code: 'ay', label: 'Aymara' },
  { code: 'bho', label: 'Bhojpuri' },
  { code: 'dv', label: 'Dhivehi' },
  { code: 'doi', label: 'Dogri' },
  { code: 'ee', label: 'Ewe' },
  { code: 'gn', label: 'Guarani' },
  { code: 'ilo', label: 'Ilocano' },
  { code: 'kri', label: 'Krio' },
  { code: 'ln', label: 'Lingala' },
  { code: 'lg', label: 'Luganda' },
  { code: 'mai', label: 'Maithili' },
  { code: 'mni-Mtei', label: 'Meiteilon (Manipuri)' },
  { code: 'nso', label: 'Northern Sotho' },
  { code: 'om', label: 'Oromo' },
  { code: 'qu', label: 'Quechua' },
  { code: 'sa', label: 'Sanskrit' },
  { code: 'tt', label: 'Tatar' },
  { code: 'ti', label: 'Tigrinya' },
  { code: 'ts', label: 'Tsonga' },
  { code: 'tk', label: 'Turkmen' },
  { code: 'tw', label: 'Twi' },
];

const SITE_LANGUAGE_SET = new Set(SITE_LANGUAGES.map((l) => l.code));

function setCookie(name, value, maxAgeSeconds) {
  const parts = [`${name}=${value}`, 'path=/'];
  if (Number.isFinite(maxAgeSeconds)) parts.push(`max-age=${maxAgeSeconds}`);
  parts.push('SameSite=Lax');
  if (window.location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
}

function syncTranslateCookie(lang) {
  if (lang === 'en') {
    setCookie('googtrans', '/auto/en', 60 * 60 * 24 * 365);
    return;
  }
  const val = `/auto/${lang}`;
  setCookie('googtrans', val, 60 * 60 * 24 * 365);
  try {
    localStorage.setItem('googtrans', val);
  } catch {}
}

function syncWidgetCombo(lang) {
  const combo = document.querySelector('.goog-te-combo');
  if (!combo) return false;
  if (combo.value === lang) return true;
  combo.value = lang;
  combo.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function getPreferredSiteLanguage() {
  try {
    const raw = localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY);
    if (raw && SITE_LANGUAGE_SET.has(raw)) return raw;
  } catch {}
  return 'en';
}

export function applySiteLanguage(lang, options = {}) {
  const { persist = true, forceReloadFallback = true } = options;
  const code = SITE_LANGUAGE_SET.has(lang) ? lang : 'en';

  if (persist) {
    try {
      localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, code);
    } catch {}
  }

  syncTranslateCookie(code);
  const switched = syncWidgetCombo(code);

  window.dispatchEvent(new CustomEvent(SITE_LANGUAGE_CHANGED_EVENT, { detail: { language: code } }));

  if (!switched && forceReloadFallback) {
    window.location.reload();
  }
}
