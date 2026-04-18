const cheerio = require('cheerio');
const { fetchWithRetry } = require('../httpFetch');
const { defaultArticleParse } = require('./htmlListAdapter');

/**
 * Extract title + link from Atom or RSS XML (gov.uk Atom, WordPress RSS, etc.).
 */
function extractFeedEntries(xml, maxEntries) {
  const out = [];
  const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });

  $('entry').each((_, el) => {
    if (out.length >= maxEntries) return false;
    const $el = $(el);
    const title = ($el.find('title').first().text() || '').replace(/\s+/g, ' ').trim();
    const link =
      $el.find('link[href]').first().attr('href') ||
      $el.find('link').first().attr('href') ||
      ($el.find('id').first().text() || '').trim();
    const updated =
      ($el.find('updated').first().text() || '').trim() ||
      ($el.find('published').first().text() || '').trim();
    if (title && link) out.push({ title, link: String(link).trim(), published: updated });
    return undefined;
  });

  if (!out.length) {
    $('channel > item, rss channel > item, item').each((_, el) => {
      if (out.length >= maxEntries) return false;
      const $el = $(el);
      const title = ($el.find('title').first().text() || '').replace(/\s+/g, ' ').trim();
      let link = ($el.find('link').first().text() || '').trim();
      if (!link) link = ($el.find('guid').first().text() || '').trim();
      const pubDate = ($el.find('pubDate').first().text() || '').trim();
      if (title && link) out.push({ title, link, published: pubDate });
      return undefined;
    });
  }

  return out.slice(0, maxEntries);
}

/**
 * Fetch RSS/Atom listing, then each article HTML with defaultArticleParse.
 */
async function runRssListingIngest(ctx, cfg) {
  const {
    id,
    hosts,
    feedUrl,
    maxArticles = 10,
    linkMustMatch,
  } = cfg;

  const { text: xml } = await fetchWithRetry(feedUrl, {
    allowHosts: hosts,
    cacheListing: true,
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });

  let entries = extractFeedEntries(xml, maxArticles * 2);
  if (typeof linkMustMatch === 'function') {
    entries = entries.filter((e) => linkMustMatch(e.link));
  }
  entries = entries.slice(0, maxArticles);

  const items = [];
  for (const e of entries) {
    if (ctx.shouldStop()) break;
    await ctx.sleep(ctx.delayMs);
    try {
      let u;
      try {
        u = new URL(e.link);
      } catch {
        continue;
      }
      if (hosts.length && !hosts.includes(u.hostname)) continue;

      const { text } = await fetchWithRetry(e.link, {
        allowHosts: hosts,
        cacheListing: false,
      });
      const rec = defaultArticleParse(text, e.link, id);
      if (e.published && !rec.published_at) {
        const d = new Date(e.published);
        if (!Number.isNaN(d.getTime())) {
          rec.published_at = d.toISOString().slice(0, 19).replace('T', ' ');
        }
      }
      items.push(rec);
    } catch (err) {
      ctx.log('warn', `${id} rss article`, err.message);
    }
  }

  return items;
}

module.exports = { extractFeedEntries, runRssListingIngest };
