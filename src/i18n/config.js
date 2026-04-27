import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { SUPPORTED_LANGUAGE_CODES } from './languages';

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .use(
      resourcesToBackend((language) =>
        import(`./locales/${language}/common.json`)
      )
    )
    .init({
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LANGUAGE_CODES,
      defaultNS: 'common',
      ns: ['common'],
      interpolation: {
        escapeValue: false,
      },
      returnNull: false,
      react: {
        useSuspense: false,
      },
    });
}

export default i18n;
