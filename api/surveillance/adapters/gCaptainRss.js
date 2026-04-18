const { runRssListingIngest } = require('./rssListingRunner');

const ID = 'gcaptain_rss';
const HOSTS = ['gcaptain.com', 'www.gcaptain.com'];

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 600,
  allowHosts: HOSTS,
  async run(ctx) {
    return runRssListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      feedUrl: 'https://gcaptain.com/feed/',
      maxArticles: Math.min(12, ctx.maxPerAdapter || 12),
    });
  },
};
