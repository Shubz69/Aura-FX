import i18n from '../../i18n/config';
import { sessionStateDisplayLabel } from '../../data/marketIntelligence';

export function formatSessionStateLabel(stateKey) {
  return sessionStateDisplayLabel(stateKey);
}

/** Relative freshness from ISO timestamp (client clock). */
export function formatRelativeFreshness(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return i18n.t('traderDeck.freshness.justNow');
  if (m < 60) return i18n.t('traderDeck.freshness.minutesAgo', { m });
  const h = Math.floor(m / 60);
  if (h < 48) return i18n.t('traderDeck.freshness.hoursAgo', { h });
  const dateStr = iso.slice(0, 10);
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      const loc =
        i18n.language === 'zh-CN'
          ? 'zh-CN'
          : i18n.language === 'hi'
            ? 'hi-IN'
            : i18n.language === 'ar'
              ? 'ar'
              : i18n.language === 'bn'
                ? 'bn-BD'
                : i18n.language === 'ur'
                  ? 'ur-PK'
                  : i18n.language || 'en-GB';
      const formatted = d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
      return i18n.t('traderDeck.freshness.dateStamp', { date: formatted });
    }
  } catch {
    /* fall through */
  }
  return i18n.t('traderDeck.freshness.dateStamp', { date: dateStr });
}

export function currentSessionShortLabel(key) {
  const k = String(key || '').toLowerCase().replace(/-/g, '_');
  const map = {
    asia: 'traderDeck.sessionShort.asia',
    london: 'traderDeck.sessionShort.london',
    new_york: 'traderDeck.sessionShort.new_york',
    overlap: 'traderDeck.sessionShort.overlap',
    closed: 'traderDeck.sessionShort.closed',
  };
  const i18nKey = map[k];
  if (i18nKey) return i18n.t(i18nKey);
  return k ? k.replace(/_/g, ' ') : '';
}
