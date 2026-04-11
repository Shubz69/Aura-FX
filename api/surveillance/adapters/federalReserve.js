const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'federal_reserve_press';
const HOSTS = ['www.federalreserve.gov'];

function linkFilter(href) {
  return /newsevents\/pressreleases\//i.test(href) && /\.htm$/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'fast',
  defaultIntervalSeconds: 420,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.federalreserve.gov/newsevents/pressreleases.htm';
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
