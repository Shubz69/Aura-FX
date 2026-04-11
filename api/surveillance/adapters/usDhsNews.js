const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'us_dhs_news';
const HOSTS = ['www.dhs.gov'];

function linkPrimary(href) {
  return /dhs\.gov\/news\/20\d{2}\//i.test(href);
}

function linkFallback(href) {
  return /dhs\.gov\/news\//i.test(href) && !/all-news-updates/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 540,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://www.dhs.gov/all-news-updates',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 3,
      maxArticles: 12,
    });
  },
};
