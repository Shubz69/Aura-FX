/**
 * Promotes Aura desk brief plain-text section labels to Markdown ## headings so
 * ReactMarkdown renders a readable, “document-like” layout.
 *
 * Aligned with section lines in `api/trader-deck/services/autoBriefGenerator.js`
 * (`renderCategoryDailyBrief`, `renderCategoryWeeklyBrief`, `validateRenderedSampleBody`)
 * and headings in `api/trader-deck/services/briefStructureLock.js` (SECTION_HEADINGS).
 *
 * When bodies lose newlines (one long line), a zero-width split before known phrases
 * rebuilds sections with ## headings.
 *
 * Git context: structured bodies were defined in `fd2254a` / `autoBriefGenerator.js`;
 * preview typewriter → markdown was `c946df2`; desk tile layout `79c4a7f`.
 */

'use strict';

/** Longest first so alternation prefers e.g. “Cross-Asset Breakdown” over “Cross-Asset”. */
const KNOWN_SECTION_PHRASES = [
  'WHAT MATTERS THIS WEEK STRUCTURALLY',
  'MARKET THEMES DOMINATING TODAY',
  'WHAT MATTERS AT THIS OPEN',
  'Key Levels and Metrics',
  'Major pair technicals',
  'Market Behaviour Insight',
  'Cross-Asset Breakdown',
  'Cross-Asset Flow',
  'Strategic Takeaway',
  'Key Events Recap',
  'Structural Shift',
  'Detailed Analysis',
  'Weekly Overview',
  'What Matters Next',
  'Trader Takeaway',
  'Key Developments',
  'Market Impact',
  'Market Context',
  'Forward Outlook',
  'Macro Theme',
  'Key Drivers',
  'Instrument Outlook',
  'Session Focus',
  'Risk Radar',
  'Execution Notes',
  'Summary for last week',
];

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} raw
 * @returns {string}
 */
function promoteAuraBriefPlaintextToMarkdown(raw) {
  const t0 = String(raw || '').replace(/\r\n/g, '\n');
  const phrases = [...new Set(KNOWN_SECTION_PHRASES)].sort((a, b) => b.length - a.length);
  const alt = phrases.map(escapeRe).join('|');
  if (!alt.trim()) return t0;

  const segs = t0.split(new RegExp(`(?=(?:${alt})\\b)`, 'gi'));
  return segs
    .map((s) => s.trim())
    .filter((s) => s.length)
    .map((s) => {
      if (/^\s*#{1,6}\s/m.test(s)) return s;
      const m = s.match(new RegExp(`^(${alt})\\b(.*)$`, 'is'));
      if (m) {
        const rawHead = m[1];
        const canon = phrases.find((p) => p.toLowerCase() === rawHead.toLowerCase()) || rawHead;
        const rest = String(m[2] || '').trim();
        return `## ${canon}${rest ? `\n\n${rest}` : ''}`;
      }
      return s;
    })
    .join('\n\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

module.exports = {
  promoteAuraBriefPlaintextToMarkdown,
  KNOWN_SECTION_PHRASES,
};
