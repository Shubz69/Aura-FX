const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'eu_council_press';
const HOSTS = ['www.consilium.europa.eu'];

/** Browser-like UA + site Referer reduce 403 from EU Council edge rules on datacenter egress. */
const PAGE_HEADERS = {
  Referer: 'https://www.consilium.europa.eu/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 AuraTerminal/1.0 (+https://www.auraterminal.ai)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function linkFilter(href) {
  return /\/en\/press\//i.test(href) && !/\.pdf$/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 780,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.consilium.europa.eu/en/press/press-releases/';
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS, headers: PAGE_HEADERS });
    const links = collectLinks(html, listingUrl, HOSTS, linkFilter);
    const cap = Math.min(links.length, ctx.maxPerAdapter || 12);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      if (ctx.shouldStop()) break;
      const url = links[i];
      await ctx.sleep(ctx.delayMs);
      try {
        const { text } = await fetchWithRetry(url, {
          allowHosts: HOSTS,
          headers: PAGE_HEADERS,
          timeoutMs: 22000,
        });
        items.push(defaultArticleParse(text, url, ID));
      } catch (e) {
        ctx.log('warn', `${ID}`, e.message);
      }
    }
    return items;
  },
};
