const { runRssListingIngest } = require('./rssListingRunner');

const ID = 'dvids_news_rss';
const HOSTS = ['www.dvidshub.net', 'dvidshub.net'];

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 660,
  allowHosts: HOSTS,
  async run(ctx) {
    return runRssListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      feedUrl: 'https://www.dvidshub.net/tags/news/feed',
      maxArticles: Math.min(12, ctx.maxPerAdapter || 12),
      linkMustMatch: (href) => /dvidshub\.net\/news\/\d+/i.test(href),
    });
  },
};
