/**
 * Trader Desk — Market Headlines
 * Non-clickable headlines with animated pair-impact indicators.
 */
import React, { useState, useEffect, useMemo } from 'react';
import Api from '../../services/Api';
import '../../styles/trader-deck/NewsFeedView.css';

const CATEGORIES = ['all', 'forex', 'market', 'crypto'];

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Pair impact engine ──────────────────────────────────────────────────────
const BULLISH_WORDS = /\b(rise|rises|rose|rally|rallies|rallied|surge|surges|surged|beat|beats|strong|strength|hawkish|hike|hikes|above|exceed|positive|gains|gain|up|higher|record high|tighten|solid|robust|outperform)\b/i;
const BEARISH_WORDS = /\b(fall|falls|fell|drop|drops|dropped|plunge|plunges|plunged|miss|misses|weak|weakness|dovish|cut|cuts|below|disappoint|decline|declines|declined|down|lower|slump|slumps|slumped|concern|risk|pressure|slowdown)\b/i;

const PAIR_RULES = [
  { patterns: /\b(fed|fomc|federal reserve|u\.?s\.? rate|us rate|powell|rate hike|rate cut|cpi|nfp|us jobs|payroll|unemployment|us gdp|us inflation|dollar|dxy|usd)\b/i, pair: 'USD', base: 'usd' },
  { patterns: /\b(ecb|eurozone|euro area|european central bank|eur\/usd|eurusd|lagarde|eu gdp|eu inflation|euro)\b/i, pair: 'EUR', base: 'eur' },
  { patterns: /\b(boe|bank of england|uk rate|gbp|sterling|british pound|uk cpi|uk gdp|bailey|pound)\b/i, pair: 'GBP', base: 'gbp' },
  { patterns: /\b(boj|bank of japan|yen|jpy|ueda|japan rate|japan cpi|japanese)\b/i, pair: 'JPY', base: 'jpy' },
  { patterns: /\b(rba|reserve bank of australia|aussie|aud|australian dollar|australia rate)\b/i, pair: 'AUD', base: 'aud' },
  { patterns: /\b(rbnz|new zealand|nzd|kiwi)\b/i, pair: 'NZD', base: 'nzd' },
  { patterns: /\b(boc|bank of canada|cad|canadian dollar|loonie|canada rate)\b/i, pair: 'CAD', base: 'cad' },
  { patterns: /\b(snb|swiss|chf|franc)\b/i, pair: 'CHF', base: 'chf' },
  { patterns: /\b(gold|xau|xauusd)\b/i, pair: 'XAU/USD', base: 'gold' },
  { patterns: /\b(oil|crude|wti|brent|opec)\b/i, pair: 'OIL', base: 'oil' },
  { patterns: /\b(bitcoin|btc|crypto|ethereum|eth)\b/i, pair: 'BTC', base: 'btc' },
  { patterns: /\b(s&p|spx|nasdaq|dow|equity|stock market|equities)\b/i, pair: 'SPX', base: 'spx' },
];

// For JPY & CHF: bullish news = pair goes DOWN (safe-haven inverse)
const INVERSE_BASES = new Set(['jpy', 'chf']);
// Gold: strong USD = gold down, weak USD = gold up
const USD_INVERSE = new Set(['gold', 'spx']);

function getPairImpacts(headline) {
  if (!headline) return [];
  const isBullish = BULLISH_WORDS.test(headline);
  const isBearish = BEARISH_WORDS.test(headline);
  const baseDir = isBullish ? 'up' : isBearish ? 'down' : 'neutral';

  const impacts = [];
  for (const rule of PAIR_RULES) {
    if (!rule.patterns.test(headline)) continue;
    let dir = baseDir;
    // Inverse logic for safe-havens and gold
    if (INVERSE_BASES.has(rule.base) && dir !== 'neutral') {
      dir = dir === 'up' ? 'down' : 'up';
    }
    if (USD_INVERSE.has(rule.base)) {
      // If headline is about USD strength, gold/SPX go opposite
      if (/\b(usd|dollar|dxy|fed|fomc)\b/i.test(headline)) {
        dir = dir === 'up' ? 'down' : dir === 'down' ? 'up' : 'neutral';
      }
    }
    impacts.push({ pair: rule.pair, direction: dir });
    if (impacts.length >= 3) break; // cap at 3 per headline
  }
  return impacts;
}

const DIR_META = {
  up:      { emoji: '📈', label: 'Bullish',  cls: 'up' },
  down:    { emoji: '📉', label: 'Bearish',  cls: 'down' },
  neutral: { emoji: '➡️', label: 'Neutral',  cls: 'neutral' },
};

function PairImpactBadge({ pair, direction }) {
  const meta = DIR_META[direction] || DIR_META.neutral;
  return (
    <span className={`nf-impact nf-impact--${meta.cls}`} title={`${pair}: ${meta.label}`}>
      <span className="nf-impact-emoji">{meta.emoji}</span>
      <span className="nf-impact-pair">{pair}</span>
    </span>
  );
}

export default function NewsFeedView() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    Api.getTraderDeckNews()
      .then((r) => {
        setArticles(Array.isArray(r.data?.articles) ? r.data.articles : []);
        setUpdatedAt(r.data?.updatedAt || null);
      })
      .catch(() => setError('Could not load headlines. Check back soon.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (a.headline || '').toLowerCase().includes(q) || (a.summary || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [articles, category, search]);

  return (
    <div className="nf-page">
      <div className="nf-header">
        <div className="nf-header-left">
          <h2 className="nf-title">📰 Market Headlines</h2>
          <p className="nf-sub">
            Live financial news · Pair impact shown automatically
            {updatedAt && <span className="nf-updated"> · Updated {timeAgo(updatedAt)}</span>}
          </p>
        </div>
        <input
          type="search"
          className="nf-search"
          placeholder="Search headlines…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search headlines"
        />
      </div>

      <div className="nf-filters">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`nf-filter-btn ${category === c ? 'active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
        {articles.length > 0 && (
          <span className="nf-count">{filtered.length} headlines</span>
        )}
      </div>

      {loading && (
        <div className="nf-loading">
          <div className="nf-loading-spinner" />
          <span>Loading headlines…</span>
        </div>
      )}
      {!loading && error && <div className="nf-error">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="nf-empty">No headlines match your filters.</div>
      )}

      {!loading && !error && (
        <div className="nf-list">
          {filtered.map((article, i) => {
            const impacts = getPairImpacts(article.headline);
            return (
              <div key={i} className="nf-headline-row">
                <div className="nf-headline-left">
                  <div className="nf-headline-meta">
                    <span className={`nf-cat nf-cat--${article.category || 'market'}`}>
                      {(article.category || 'market').toUpperCase()}
                    </span>
                    <span className="nf-headline-time">{timeAgo(article.publishedAt)}</span>
                    {article.source && (
                      <span className="nf-headline-src">{article.source}</span>
                    )}
                  </div>
                  <p className="nf-headline-text">{article.headline}</p>
                  {article.summary && (
                    <p className="nf-headline-summary">
                      {article.summary.slice(0, 140)}{article.summary.length > 140 ? '…' : ''}
                    </p>
                  )}
                </div>
                {impacts.length > 0 && (
                  <div className="nf-impacts">
                    {impacts.map((imp, j) => (
                      <PairImpactBadge key={j} pair={imp.pair} direction={imp.direction} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
