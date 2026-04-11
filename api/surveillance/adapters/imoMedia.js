const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'imo_media';
const HOSTS = ['www.imo.org'];

function linkFilter(href) {
  return /\/en\/MediaCentre\//i.test(href) && !/\.pdf$/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'slow',
  defaultIntervalSeconds: 1200,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.imo.org/en/MediaCentre/Pages/Default.aspx';
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    const links = collectLinks(html, listingUrl, HOSTS, linkFilter);
    const cap = Math.min(links.length, ctx.maxPerAdapter || 8);
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
