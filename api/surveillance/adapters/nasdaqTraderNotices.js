const { collectLinks, fetchListing, defaultArticleParse } = require('./htmlListAdapter');
const { fetchWithRetry } = require('../httpFetch');

const ID = 'nasdaq_trader_notices';
const HOSTS = ['www.nasdaqtrader.com'];

function linkFilter(href) {
  return /Trader.aspx\?id=/i.test(href) || /\/aspx\/surveillance\.aspx/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'slow',
  defaultIntervalSeconds: 1800,
  allowHosts: HOSTS,
  async run(ctx) {
    const listingUrl = 'https://www.nasdaqtrader.com/Trader.aspx?id=DailyFilings';
    let html;
    try {
      html = await fetchListing(listingUrl, { allowHosts: HOSTS });
    } catch {
      return [];
    }
    const links = collectLinks(html, listingUrl, HOSTS, (h) => HOSTS.some((host) => h.includes(host)));
    const filtered = links.filter((h) => /filings|notice|surveillance|trader/i.test(h)).slice(0, 20);
    const cap = Math.min(filtered.length, ctx.maxPerAdapter || 6);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      if (ctx.shouldStop()) break;
      const url = filtered[i];
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
