export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'ar', label: 'Arabic' },
  { code: 'bn', label: 'Bengali' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ur', label: 'Urdu' },
];

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((lang) => lang.code);

export const RTL_LANGUAGES = new Set(['ar', 'ur']);
