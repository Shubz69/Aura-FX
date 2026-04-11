const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'whitehouse_briefing';
const HOSTS = ['www.whitehouse.gov'];

function linkFilter(href) {
  return /\/briefing-room\//i.test(href) && !href.endsWith('/briefing-room/') && !href.endsWith('/briefing-room');
}

module.exports = {
  id: ID,
  tier: 'fast',
  defaultIntervalSeconds: 480,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.whitehouse.gov/briefing-room/';
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
