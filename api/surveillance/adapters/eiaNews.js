const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'eia_news';
const HOSTS = ['www.eia.gov'];

function linkFilter(href) {
  return /\/pressroom\/|\/todayinenergy\//i.test(href) && !href.endsWith('.pdf');
}

module.exports = {
  id: ID,
  tier: 'slow',
  defaultIntervalSeconds: 1800,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.eia.gov/newsroom.php';
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
