const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'cftc_press';
const HOSTS = ['www.cftc.gov'];

function linkFilter(href) {
  return /\/PressRoom\/PressReleases\//i.test(href) || /\/pressroom\//i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 840,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.cftc.gov/PressRoom/PressReleases';
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
