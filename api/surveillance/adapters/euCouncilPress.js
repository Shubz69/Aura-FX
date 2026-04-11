const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'eu_council_press';
const HOSTS = ['www.consilium.europa.eu'];

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
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    const links = collectLinks(html, listingUrl, HOSTS, linkFilter);
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
        ctx.log('warn', `${ID}`, e.message);
      }
    }
    return items;
  },
};
