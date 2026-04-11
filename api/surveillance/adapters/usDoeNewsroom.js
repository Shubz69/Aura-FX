const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'us_doe_newsroom';
const HOSTS = ['www.energy.gov'];

function linkPrimary(href) {
  return /energy\.gov\/articles\//i.test(href);
}

function linkFallback(href) {
  return /energy\.gov\/(articles|news)\//i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 780,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://www.energy.gov/news',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 10,
    });
  },
};
