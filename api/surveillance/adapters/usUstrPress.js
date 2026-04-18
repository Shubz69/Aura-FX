const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'us_ustr_press';
const HOSTS = ['ustr.gov', 'www.ustr.gov'];

function linkPrimary(href) {
  return /ustr\.gov\/.*\/press-office\/press-releases\/20/i.test(href);
}

function linkFallback(href) {
  return /ustr\.gov\/.*\/press-office\//i.test(href) && /press-releases|fact-sheets/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 720,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://ustr.gov/',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 12,
    });
  },
};
