const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'uk_ofsi_news';
const HOSTS = ['www.gov.uk'];

function linkFilter(href) {
  return (
    /\/government\/news\//i.test(href) &&
    /ofsi|financial-sanctions|sanctions/i.test(href)
  );
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 900,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl =
      'https://www.gov.uk/search/news-and-communications?organisations%5B%5D=office-of-financial-sanctions-implementation&order=updated-newest';
    let html;
    try {
      html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    } catch {
      html = await fetchListing('https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation', {
        allowHosts: HOSTS,
      });
    }
    const links = collectLinks(html, listingUrl, HOSTS, (h) =>
      /\/government\/news\//i.test(h)
    );
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
