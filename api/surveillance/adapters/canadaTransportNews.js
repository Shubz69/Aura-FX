const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'canada_transport_news';
const HOSTS = ['www.canada.ca'];

function linkPrimary(href) {
  return /canada\.ca\/en\/transport-canada\/.+\/news\//i.test(href) || /canada\.ca\/.*transport-canada.*news/i.test(href);
}

function linkFallback(href) {
  return /canada\.ca\/en\/transport-canada\//i.test(href) && /news|media|statement/i.test(href);
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
      listingUrl: 'https://www.canada.ca/en/transport-canada/news.html',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 1,
      maxArticles: 10,
    });
  },
};
