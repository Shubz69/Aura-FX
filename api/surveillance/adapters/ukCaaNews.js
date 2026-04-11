const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'uk_caa_news';
const HOSTS = ['www.caa.co.uk'];

function linkPrimary(href) {
  return /caa\.co\.uk\/newsroom\/news\//i.test(href);
}

function linkFallback(href) {
  return /caa\.co\.uk\/newsroom\//i.test(href) && !/cookie|policy/i.test(href);
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
      listingUrl: 'https://www.caa.co.uk/news/',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 10,
    });
  },
};
