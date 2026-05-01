import React from 'react';
import { useTranslation } from 'react-i18next';
import { SITE_LANGUAGES, applySiteLanguage } from '../utils/siteLanguage';
import '../styles/LanguageSelector.css';

export default function LanguageSelector({ value, onChange, className = '' }) {
  const { t } = useTranslation();

  const handleChange = async (e) => {
    const next = e.target.value || 'en';
    await applySiteLanguage(next, { persist: true });
    if (typeof onChange === 'function') onChange(next);
  };

  const rootClass = ['site-language-selector', className].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      <label htmlFor="site-language-select" className="site-language-selector__label">
        {t('languageSelector.label')}
      </label>
      <div className="site-language-selector__wrap">
        <select
          id="site-language-select"
          className="site-language-selector__select"
          value={value}
          onChange={handleChange}
          aria-label={t('languageSelector.label')}
        >
          {SITE_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
