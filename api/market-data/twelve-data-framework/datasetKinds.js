/**
 * Twelve Data dataset taxonomy — aligns capability registry with cache/refresh policy.
 * Maps1:1 to user-facing "endpoint groups" for admin diagnostics.
 */

const DATASET_KIND = {
  REFERENCE: 'reference',
  CORE: 'core',
  FUNDAMENTALS: 'fundamentals',
  ANALYSIS: 'analysis',
  REGULATORY: 'regulatory',
  CALENDAR: 'calendar',
};

/** Human labels for admin / health JSON. */
const KIND_LABEL = {
  [DATASET_KIND.REFERENCE]: 'Reference & profile',
  [DATASET_KIND.CORE]: 'Core quotes / EOD',
  [DATASET_KIND.FUNDAMENTALS]: 'Fundamentals & filings-style data',
  [DATASET_KIND.ANALYSIS]: 'Analyst estimates & ratings',
  [DATASET_KIND.REGULATORY]: 'Ownership & insider activity',
  [DATASET_KIND.CALENDAR]: 'Calendars & event windows',
};

module.exports = { DATASET_KIND, KIND_LABEL };
