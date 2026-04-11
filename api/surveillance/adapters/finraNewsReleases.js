const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'finra_news_releases';
const HOSTS = ['www.finra.org'];

function linkPrimary(href) {
  return /finra\.org\/media-center\/newsreleases\/20/i.test(href);
}

function linkFallback(href) {
  return /finra\.org\/media-center\/newsreleases\//i.test(href);
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
      listingUrl: 'https://www.finra.org/media-center/newsreleases',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 10,
    });
  },
};
