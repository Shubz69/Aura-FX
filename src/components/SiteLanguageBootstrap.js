import { useEffect } from 'react';
import { applySiteLanguage, getPreferredSiteLanguage } from '../utils/siteLanguage';

export default function SiteLanguageBootstrap() {
  useEffect(() => {
    applySiteLanguage(getPreferredSiteLanguage(), { persist: false });
  }, []);

  return null;
}
