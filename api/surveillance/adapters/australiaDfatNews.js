const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'australia_dfat_news';
const HOSTS = ['www.dfat.gov.au'];

function linkPrimary(href) {
  if (!/dfat\.gov\.au\/news\//i.test(href)) return false;
  if (/\/news\/?$/i.test(href)) return false;
  return /dfat\.gov\.au\/news\/[^/?#]+/i.test(href);
}

function linkFallback(href) {
  return /dfat\.gov\.au\/(news|international-relations|trade)\//i.test(href) && !/dfat\.gov\.au\/news\/?$/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 840,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://www.dfat.gov.au/news',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 10,
    });
  },
};
