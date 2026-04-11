const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'ecb_press';
const HOSTS = ['www.ecb.europa.eu'];

function linkFilter(href) {
  return /\/press\/html\//i.test(href) && /\.en\.html$/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 660,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.ecb.europa.eu/press/html/index.en.html';
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    let links = collectLinks(html, listingUrl, HOSTS, linkFilter);
    const cap = Math.min(links.length, ctx.maxPerAdapter || 12);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      if (ctx.shouldStop()) break;
      const url = links[i];
      await ctx.sleep(ctx.delayMs);
      try {
        const { text } = await fetchWithRetry(url, { allowHosts: HOSTS });
        items.push(defaultArticleParse(text, url, ID));
      } catch (e) {
        ctx.log('warn', `${ID} article`, e.message);
      }
    }
    return items;
  },
};
