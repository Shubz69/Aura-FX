const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'boj_press';
const HOSTS = ['www.boj.or.jp'];

function linkFilter(href) {
  return /\/en\/about\/pr\//i.test(href) || /\/en\/announcements\//i.test(href);
}

module.exports = {
  id: ID,
  tier: 'slow',
  defaultIntervalSeconds: 1200,
  allowHosts: HOSTS,
  async run(ctx) {
    /** Trailing slash after index.htm often 404s; canonical is index.htm without extra slash. */
    const listingUrl = 'https://www.boj.or.jp/en/about/pr/index.htm';
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    const links = collectLinks(html, listingUrl, HOSTS, linkFilter);
    const cap = Math.min(links.length, ctx.maxPerAdapter || 10);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      if (ctx.shouldStop()) break;
      const url = links[i];
      await ctx.sleep(ctx.delayMs);
      try {
        const { text } = await fetchWithRetry(url, { allowHosts: HOSTS });
        items.push(defaultArticleParse(text, url, ID));
      } catch (e) {
        ctx.log('warn', `${ID}`, e.message);
      }
    }
    return items;
  },
};
