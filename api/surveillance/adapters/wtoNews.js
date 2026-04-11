const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'wto_news';
const HOSTS = ['www.wto.org'];

function linkPrimary(href) {
  return /wto\.org\/english\/news_e\//i.test(href) && !/news_e\.htm$/i.test(href) && !/events_e/i.test(href);
}

function linkFallback(href) {
  return /wto\.org\/english\/(news_e|trade_e)\//i.test(href) && !/subscribe|events_subscription|news_e\.htm$/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 1080,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://www.wto.org/english/news_e/news_e.htm',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 1,
      maxArticles: 8,
    });
  },
};
