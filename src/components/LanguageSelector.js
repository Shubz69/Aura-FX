import React from 'react';
import { useTranslation } from 'react-i18next';
import { SITE_LANGUAGES, applySiteLanguage } from '../utils/siteLanguage';

export default function LanguageSelector({ value, onChange, className = '' }) {
  const { t } = useTranslation();

  const handleChange = async (e) => {
    const next = e.target.value || 'en';
    await applySiteLanguage(next, { persist: true });
    if (typeof onChange === 'function') onChange(next);
  };

  return (
    <div className={className}>
      <label htmlFor="site-language-select">{t('languageSelector.label')}</label>
      <select id="site-language-select" value={value} onChange={handleChange}>
        {SITE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
