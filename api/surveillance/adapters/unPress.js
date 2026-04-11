const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');
const cheerio = require('cheerio');

const ID = 'un_press';
const HOSTS = ['press.un.org'];

function linkFilter(href) {
  return /\/content\/|\/press-release|\/en\/story|\/node\//i.test(href) && !href.endsWith('/en');
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 720,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://press.un.org/en';
    const html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    let links = collectLinks(html, listingUrl, HOSTS, linkFilter);
    links = links.filter((u) => u !== listingUrl && !u.endsWith('/en'));
    const cap = Math.min(links.length, ctx.maxPerAdapter || 14);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      if (ctx.shouldStop()) break;
      const url = links[i];
      await ctx.sleep(ctx.delayMs);
      try {
        const { text } = await fetchWithRetry(url, { allowHosts: HOSTS });
        const $ = cheerio.load(text);
        const parsed = defaultArticleParse(text, url, ID);
        if ($('.content, .field--name-body, article').length === 0 && parsed.body_snippet.length < 40) {
          continue;
        }
        items.push(parsed);
      } catch (e) {
        ctx.log('warn', `${ID} article ${url}`, e.message);
      }
    }
    return items;
  },
};
