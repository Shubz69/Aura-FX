const crypto = require('crypto');
const cheerio = require('cheerio');
const { bodySnippetFromHtml } = require('./normalize');

/**
 * Coarse fingerprint of listing HTML (length + anchor density). Detects large markup rewrites without storing bodies.
 */
function listingHtmlFingerprint(html) {
  const raw = String(html || '');
  const len = Buffer.byteLength(raw, 'utf8');
  const anchors = (raw.match(/<a\s/gi) || []).length;
  const h = crypto.createHash('sha256').update(`len=${len};a=${anchors}`).digest('hex');
  return h.slice(0, 24);
}

/**
 * True when primary vs fallback listing fingerprints differ strongly (optional heuristic for ops).
 */
function listingFingerprintDrift(a, b) {
  if (!a || !b) return false;
  return a !== b;
}

/**
 * Multi-strategy article parse for government / institutional HTML drift.
 * Returns { record, parseTier, warnings }.
 */
function parseArticleWithFallbacks(html, pageUrl, sourceId) {
  const warnings = [];
  const $ = cheerio.load(html || '');

  const tryTitle = () =>
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('article h1').first().text() ||
    $('main h1').first().text() ||
    $('.content h1').first().text() ||
    $('h1').first().text() ||
    $('title').text();

  const trySummary = () =>
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="twitter:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    $('article .summary').first().text() ||
    '';

  const tryBodyHtml = () =>
    $('article .field--name-body').html() ||
    $('article .article-body').html() ||
    $('article .content').html() ||
    $('article').html() ||
    $('main article').html() ||
    $('main .content').html() ||
    $('main').html() ||
    $('.press-release').html() ||
    $('.node-content').html() ||
    '';

  let parseTier = 'primary';
  let title = String(tryTitle() || 'Untitled').trim().slice(0, 500);
  let summary = String(trySummary() || '').trim().slice(0, 1200);
  let body = tryBodyHtml() || '';

  if (title.length < 6 || (!summary && !body)) {
    parseTier = 'fallback';
    warnings.push('sparse_meta');
    const t2 =
      $('.page-header h1').text() ||
      $('.govuk-heading-xl').text() ||
      $('.field-title').text();
    if (t2 && String(t2).trim().length > title.length) title = String(t2).trim().slice(0, 500);
    const b2 =
      $('.field--name-body').html() ||
      $('.gem-c-govspeak').html() ||
      $('#content').html() ||
      '';
    if (b2) body = b2;
    if (!summary) summary = bodySnippetFromHtml(body || title, 400);
  }

  const body_snippet = bodySnippetFromHtml(body || summary || title, 450);
  if (!body_snippet || body_snippet.length < 24) warnings.push('thin_body');

  let published_at = null;
  const tMeta =
    $('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    $('meta[name="date"]').attr('content') ||
    $('meta[name="DC.date"]').attr('content');
  if (tMeta) {
    const d = new Date(tMeta);
    if (!Number.isNaN(d.getTime())) published_at = d.toISOString().slice(0, 19).replace('T', ' ');
  }

  const image_url = $('meta[property="og:image"]').attr('content') || null;
  const confidence = parseTier === 'primary' ? 0.72 : 0.62;

  return {
    record: {
      source: sourceId,
      source_type: 'official_html',
      title,
      summary,
      body_snippet,
      url: pageUrl,
      published_at,
      image_url,
      confidence,
      verification_state: 'official_source',
      tags: [sourceId],
      source_meta: { fetched: 'html', parse_tier: parseTier },
    },
    parseTier,
    warnings,
  };
}

/**
 * Merge ingest meta (fingerprints, flags) into a raw event source_meta object.
 */
function attachIngestMeta(record, patch) {
  const prev = record.source_meta && typeof record.source_meta === 'object' ? record.source_meta : {};
  return { ...record, source_meta: { ...prev, ...patch } };
}

/**
 * Summarise listing health for adapter run meta (admin-only).
 */
function summarizeListingHealth({ linksFound, usedLinkFallback, parseFallbackCount, zeroExtract }) {
  const staleMarkupRisk = zeroExtract && linksFound > 0;
  return {
    links_found: linksFound,
    used_link_filter_fallback: !!usedLinkFallback,
    parse_fallback_count: parseFallbackCount || 0,
    zero_extract: !!zeroExtract,
    stale_markup_risk: staleMarkupRisk,
  };
}

module.exports = {
  listingHtmlFingerprint,
  listingFingerprintDrift,
  parseArticleWithFallbacks,
  attachIngestMeta,
  summarizeListingHealth,
};
