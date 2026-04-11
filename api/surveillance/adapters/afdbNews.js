const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'afdb_news';
const HOSTS = ['www.afdb.org'];

function linkPrimary(href) {
  return /afdb\.org\/en\/news-and-events\/.+\-\d+/i.test(href);
}

function linkFallback(href) {
  return /afdb\.org\/en\/news-and-events\//i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 960,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://www.afdb.org/en/news-and-events/news',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 10,
    });
  },
};
