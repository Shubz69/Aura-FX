const crypto = require('crypto');

/**
 * Strip tracking params so the same article URL dedupes across campaigns.
 */
function canonicalUrlForDedupe(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim().split('#')[0]);
    const drop = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_eid']);
    [...u.searchParams.keys()].forEach((k) => {
      if (drop.has(k.toLowerCase())) u.searchParams.delete(k);
    });
    u.hash = '';
    return u.href;
  } catch {
    return String(url).split('#')[0].trim();
  }
}

function normalizeDedupeText(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .slice(0, 500);
}

function buildDedupeKeys({ url, title, publishedAt }) {
  const u = canonicalUrlForDedupe(url || '');
  const t = normalizeDedupeText(title);
  const day = publishedAt ? String(publishedAt).slice(0, 10) : '';
  return { urlCanonical: u, titleNorm: t, day };
}

function contentHash(parts) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(parts));
  return h.digest('hex');
}

module.exports = { normalizeDedupeText, buildDedupeKeys, contentHash, canonicalUrlForDedupe };
