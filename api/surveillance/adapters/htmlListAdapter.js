const cheerio = require('cheerio');
const { URL } = require('url');
const { fetchWithRetry } = require('../httpFetch');
const { bodySnippetFromHtml } = require('../normalize');

function absolutize(baseUrl, href) {
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function collectLinks(html, baseUrl, allowHosts, linkFilter) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const out = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const abs = absolutize(baseUrl, href);
    if (!abs) return;
    let host;
    try {
      host = new URL(abs).hostname;
    } catch {
      return;
    }
    if (!allowHosts.includes(host)) return;
    if (linkFilter && !linkFilter(abs)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  });
  return out;
}

/**
 * If primary link filter yields too few rows, retry with a broader filter (mark-up drift resilience).
 */
function collectLinksWithFallback(html, baseUrl, allowHosts, primaryFilter, fallbackFilter, minPrimary = 2) {
  let links = collectLinks(html, baseUrl, allowHosts, primaryFilter);
  let usedLinkFallback = false;
  if (links.length < minPrimary && typeof fallbackFilter === 'function') {
    const alt = collectLinks(html, baseUrl, allowHosts, fallbackFilter);
    if (alt.length > links.length) {
      links = alt;
      usedLinkFallback = true;
    }
  }
  return { links, usedLinkFallback };
}

async function fetchListing(url, opts) {
  const { allowHosts } = opts;
  const { text } = await fetchWithRetry(url, { allowHosts, cacheListing: true });
  return text;
}

/**
 * Default article parse: og:title, meta description, article body, time
 */
function defaultArticleParse(html, pageUrl, sourceId) {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text() ||
    $('title').text() ||
    'Untitled';
  const summary =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';
  const image_url = $('meta[property="og:image"]').attr('content') || null;
  let body =
    $('article').html() ||
    $('main').html() ||
    $('.field--name-body').html() ||
    $('.press-release').html() ||
    '';
  const body_snippet = bodySnippetFromHtml(body || summary || title, 450);

  let published_at = null;
  const tMeta =
    $('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').attr('datetime') ||
    $('meta[name="date"]').attr('content');
  if (tMeta) {
    const d = new Date(tMeta);
    if (!Number.isNaN(d.getTime())) published_at = d.toISOString().slice(0, 19).replace('T', ' ');
  }

  return {
    source: sourceId,
    source_type: 'official_html',
    title: String(title).trim().slice(0, 500),
    summary: String(summary).trim().slice(0, 1200),
    body_snippet,
    url: pageUrl,
    published_at,
    image_url,
    confidence: 0.72,
    verification_state: 'official_source',
    tags: [sourceId],
    source_meta: { fetched: 'html' },
  };
}

module.exports = {
  collectLinks,
  collectLinksWithFallback,
  fetchListing,
  defaultArticleParse,
};
