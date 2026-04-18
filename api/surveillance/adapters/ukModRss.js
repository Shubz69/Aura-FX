const { runRssListingIngest } = require('./rssListingRunner');

const ID = 'uk_mod_rss';
const HOSTS = ['www.gov.uk'];

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 720,
  allowHosts: HOSTS,
  async run(ctx) {
    return runRssListingIngest(ctx, {
      id: ID,
      hosts: HOSTS,
      feedUrl: 'https://www.gov.uk/government/organisations/ministry-of-defence.atom',
      maxArticles: Math.min(10, ctx.maxPerAdapter || 12),
      linkMustMatch: (href) => /gov\.uk\/government\/news\//i.test(href),
    });
  },
};
