const { fetchWithRetry } = require('../httpFetch');
const { fetchListing, collectLinksWithFallback } = require('./htmlListAdapter');
const {
  listingHtmlFingerprint,
  parseArticleWithFallbacks,
  attachIngestMeta,
  summarizeListingHealth,
} = require('../adapterResilience');

/**
 * Fault-isolated HTML listing ingest with fingerprints + parse fallbacks.
 * Returns `{ items, meta }` for ingestOrchestrator.
 */
async function runHtmlListingIngest(ctx, cfg) {
  const {
    id,
    hosts,
    listingUrl,
    linkFilter,
    linkFilterFallback,
    minPrimaryLinks = 2,
    maxArticles,
    cacheListing = true,
  } = cfg;

  const html = await fetchListing(listingUrl, { allowHosts: hosts });
  const listing_fingerprint = listingHtmlFingerprint(html);
  const { links, usedLinkFallback } = collectLinksWithFallback(
    html,
    listingUrl,
    hosts,
    linkFilter,
    linkFilterFallback,
    minPrimaryLinks
  );
  const cap = Math.min(links.length, maxArticles ?? ctx.maxPerAdapter ?? 14);
  let parseFallbackCount = 0;
  let zeroExtract = false;
  const items = [];

  for (let i = 0; i < cap; i += 1) {
    if (ctx.shouldStop()) break;
    const url = links[i];
    await ctx.sleep(ctx.delayMs);
    try {
      const { text } = await fetchWithRetry(url, { allowHosts: hosts, cacheListing: false });
      const { record, parseTier, warnings } = parseArticleWithFallbacks(text, url, id);
      if (parseTier !== 'primary') parseFallbackCount += 1;
      const withMeta = attachIngestMeta(record, {
        listing_fingerprint: listing_fingerprint,
        parse_warnings: warnings,
      });
      items.push(withMeta);
    } catch (e) {
      ctx.log('warn', `${id} article`, e.message);
    }
  }

  if (cap > 0 && items.length === 0) zeroExtract = true;
  const health = summarizeListingHealth({
    linksFound: links.length,
    usedLinkFallback: usedLinkFallback,
    parseFallbackCount,
    zeroExtract,
  });

  return {
    items,
    meta: {
      adapter_id: id,
      listing_fingerprint: listing_fingerprint,
      ...health,
    },
  };
}

module.exports = { runHtmlListingIngest };
