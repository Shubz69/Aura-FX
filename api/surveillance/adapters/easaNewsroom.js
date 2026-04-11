const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'easa_newsroom';
const HOSTS = ['www.easa.europa.eu'];

function linkPrimary(href) {
  return /easa\.europa\.eu\/.+\/(news|press)/i.test(href) && !/events/i.test(href);
}

function linkFallback(href) {
  return /easa\.europa\.eu\/.*news/i.test(href) && !/events/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 900,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://www.easa.europa.eu/newsroom-and-events',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 10,
    });
  },
};
