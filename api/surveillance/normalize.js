const cheerio = require('cheerio');

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const $ = cheerio.load(`<div id="__r">${html}</div>`, { decodeEntities: true });
  return $('#__r').text().replace(/\s+/g, ' ').trim();
}

function bodySnippetFromHtml(html, maxLen = 400) {
  const t = stripHtml(html);
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

module.exports = { stripHtml, bodySnippetFromHtml };
