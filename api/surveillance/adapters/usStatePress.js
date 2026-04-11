const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'us_state_press';
const HOSTS = ['www.state.gov'];

function linkFilter(href) {
  return /\/(releases|briefings|remarks)\/[^/?#]+\/?$/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 780,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.state.gov/press-releases/';
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    let links = collectLinks(html, listingUrl, HOSTS, linkFilter);
    if (links.length < 4) {
      const html2 = await fetchListing('https://www.state.gov/briefings/', { allowHosts: HOSTS });
      links = [...new Set([...links, ...collectLinks(html2, listingUrl, HOSTS, linkFilter)])];
    }
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
