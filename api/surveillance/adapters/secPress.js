const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'sec_press';
const HOSTS = ['www.sec.gov'];
const SEC_PAGE_HEADERS = { Referer: 'https://www.sec.gov/' };

function linkFilter(href) {
  return /\/news\/press-release\//i.test(href) || /\/Archives\/edgar/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'fast',
  defaultIntervalSeconds: 660,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.sec.gov/news/pressreleases';
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS, headers: SEC_PAGE_HEADERS });
    const links = collectLinks(html, listingUrl, HOSTS, (h) => /\/news\/press-release\//i.test(h));
    const cap = Math.min(links.length, ctx.maxPerAdapter || 12);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      if (ctx.shouldStop()) break;
      const url = links[i];
      await ctx.sleep(ctx.delayMs);
      try {
        const { text } = await fetchWithRetry(url, { allowHosts: HOSTS, headers: SEC_PAGE_HEADERS });
        items.push(defaultArticleParse(text, url, ID));
      } catch (e) {
        ctx.log('warn', `${ID}`, e.message);
      }
    }
    return items;
  },
};
