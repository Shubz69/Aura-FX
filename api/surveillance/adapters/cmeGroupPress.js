const { runHtmlListingIngest } = require('./htmlListingRunner');

const ID = 'cme_group_press';
const HOSTS = ['www.cmegroup.com'];

function linkPrimary(href) {
  return /cmegroup\.com\/media-room\/press-releases\//i.test(href);
}

function linkFallback(href) {
  return /cmegroup\.com\/media-room\//i.test(href) && /press-releases|openmarkets/i.test(href);
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 660,
  allowHosts: HOSTS,
  async run(ctx) {
    return runHtmlListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      listingUrl: 'https://www.cmegroup.com/media-room.html',
      linkFilter: linkPrimary,
      linkFilterFallback: linkFallback,
      minPrimaryLinks: 2,
      maxArticles: 12,
    });
  },
};
