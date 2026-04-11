const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'snb_press';
const HOSTS = ['www.snb.ch'];

function linkFilter(href) {
  return /\/en\/mm\/reference\/source\//i.test(href) || /\/en\/the-snb\/mandates-goals\//i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 900,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.snb.ch/en/the-snb/mandates-goals/id/the_snb/national_bank/press.html';
    let html;
    try {
      html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    } catch {
      html = await fetchListing('https://www.snb.ch/en/sitemap/', { allowHosts: HOSTS });
    }
    const links = collectLinks(html, listingUrl, HOSTS, (h) =>
      /\/en\/.*\/(press|communication|media)/i.test(h)
    );
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
