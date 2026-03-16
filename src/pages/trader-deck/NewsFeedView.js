/**
 * Trader Deck — Market News Feed
 * Finnhub + FMP news, filtered by category.
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

function getDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
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
      .catch(() => setError('Could not load news. Check back soon.'))
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
          <h2 className="nf-title">Market News</h2>
          <p className="nf-sub">
            Live financial news from Finnhub &amp; FMP
            {updatedAt && (
              <span className="nf-updated"> · {timeAgo(updatedAt)}</span>
            )}
          </p>
        </div>
        <input
          type="search"
          className="nf-search"
          placeholder="Search news…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search news"
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
          <span className="nf-count">{filtered.length} articles</span>
        )}
      </div>

      {loading && (
        <div className="nf-loading">
          <div className="nf-loading-spinner" />
          <span>Loading news…</span>
        </div>
      )}

      {!loading && error && (
        <div className="nf-error">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="nf-empty">No articles match your filters.</div>
      )}

      {!loading && !error && (
        <div className="nf-grid">
          {filtered.map((article, i) => (
            <a
              key={i}
              className="nf-card"
              href={article.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {article.image && (
                <div className="nf-card-img-wrap">
                  <img src={article.image} alt="" className="nf-card-img" loading="lazy" />
                </div>
              )}
              <div className="nf-card-body">
                <div className="nf-card-meta">
                  <span className={`nf-card-cat nf-card-cat--${article.category || 'market'}`}>
                    {(article.category || 'market').toUpperCase()}
                  </span>
                  <span className="nf-card-time">{timeAgo(article.publishedAt)}</span>
                </div>
                <h3 className="nf-card-headline">{article.headline}</h3>
                {article.summary && (
                  <p className="nf-card-summary">{article.summary.slice(0, 120)}{article.summary.length > 120 ? '…' : ''}</p>
                )}
                <div className="nf-card-footer">
                  <span className="nf-card-source">{article.source || getDomain(article.url)}</span>
                  <span className="nf-card-read">Read →</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
