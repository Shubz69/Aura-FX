/**
 * GET /api/trader-deck/headlines-daily?date=YYYY-MM-DD
 * Historical archived top headlines for a London desk calendar day (separate from rolling /news feed).
 */

'use strict';

const { executeQuery } = require('../db');

async function ensureTable() {
  await executeQuery(
    `
    CREATE TABLE IF NOT EXISTS trader_deck_headlines_daily (
      desk_date DATE NOT NULL PRIMARY KEY,
      headlines_json JSON NOT NULL,
      article_count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tdh_updated (updated_at)
    )
  `,
    [],
    { suppressErrorLog: true, requestId: 'headlines-daily-ddl', timeout: 25000 }
  );
}

let tablePromise = null;
function ensureTableOnce() {
  if (!tablePromise) {
    tablePromise = ensureTable().catch((e) => {
      tablePromise = null;
      throw e;
    });
  }
  return tablePromise;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const q = req.query || {};
  const raw = String(q.date || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return res.status(400).json({ success: false, message: 'date=YYYY-MM-DD required' });
  }

  try {
    await ensureTableOnce();
    const [rows] = await executeQuery(
      `SELECT desk_date, headlines_json, article_count, updated_at
       FROM trader_deck_headlines_daily
       WHERE desk_date = ?
       LIMIT 1`,
      [raw]
    );
    const row = rows?.[0];
    if (!row) {
      return res.status(200).json({
        success: true,
        date: raw,
        articles: [],
        count: 0,
        archived: false,
        message: 'No archived headline set for this date yet.',
      });
    }
    let list = row.headlines_json;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch {
        list = [];
      }
    }
    const articles = Array.isArray(list) ? list : [];
    return res.status(200).json({
      success: true,
      date: String(row.desk_date || raw).slice(0, 10),
      articles,
      count: articles.length,
      archived: true,
      updatedAt: row.updated_at,
    });
  } catch (e) {
    console.error('[headlines-daily]', e);
    return res.status(500).json({ success: false, message: e.message || 'query failed' });
  }
};

module.exports.__ensureTableOnce = ensureTableOnce;
