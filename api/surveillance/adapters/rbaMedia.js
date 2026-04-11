const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'rba_media';
const HOSTS = ['www.rba.gov.au'];

function linkFilter(href) {
  return /\/media-releases\//i.test(href) && /\/20\d{2}\//i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 780,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.rba.gov.au/media-releases/';
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
