const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'opec_press';
const HOSTS = ['www.opec.org'];

function linkPrimary(href) {
  if (!/opec\.org\/opec_web\/en\/press\//i.test(href)) return false;
  if (/press\.htm$/i.test(href)) return false;
  return true;
}

function linkFallback(href) {
  return /opec\.org\/opec_web\/en\//i.test(href) && /press|news|meeting|dialogue/i.test(href) && !/press\.htm$/i.test(href);
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
      listingUrl: 'https://www.opec.org/opec_web/en/press/press.htm',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 10,
    });
  },
};
