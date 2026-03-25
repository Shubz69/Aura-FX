import React, { useEffect, useState, useCallback } from 'react';
import { FaNewspaper, FaSyncAlt } from 'react-icons/fa';
import '../styles/NewsHeadlines.css';

const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';
const CACHE_KEY = 'at_td_news_cache_v2';
const CACHE_TTL = 3 * 60 * 1000;
const AUTO_REFRESH_MS = 3 * 60 * 1000;
const SOURCE_STRIP_RE = /\s*[-–—]\s*(reuters|bloomberg|forex factory|financial times|wsj|cnbc|yahoo finance|marketwatch)\s*$/i;
const ATTRIBUTION_RE = /\b(according to|reported by|via)\b/i;

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const classifyHeadline = (text) => {
  const s = String(text || '').toLowerCase();
  if (/\b(war|conflict|sanction|emergency|surge|plunge|fomc|rate decision|cpi|nfp)\b/.test(s)) return 'HIGH';
  if (/\b(yield|dollar|inflation|pmi|gdp|earnings|oil|crypto)\b/.test(s)) return 'MEDIUM';
  return 'LOW';
};

const toInternalInsight = (headline) => {
  const clean = String(headline || '')
    .replace(SOURCE_STRIP_RE, '')
    .replace(ATTRIBUTION_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  const level = classifyHeadline(clean);
  return `${level}: ${clean}`;
};

function isHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const NewsHeadlines = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          setArticles(cached.data);
          setLastFetch(new Date(cached.ts));
          setLoading(false);
          return;
        }
      } catch (_) {}
    }

    force ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const q = force ? '?refresh=1' : '';
      const res = await fetch(`${API_BASE}/api/trader-deck/news${q}`);
      const json = await res.json();
      if (json.success && json.articles) {
        const rows = json.articles
          .map((a) => ({
            title: toInternalInsight(a.title || a.headline || ''),
            publishedAt: a.publishedAt || a.datetime || null,
            url: String(a.url || '').trim(),
          }))
          .filter((a) => a.title && !/^(HIGH|MEDIUM|LOW):\s*$/i.test(a.title));
        setArticles(rows);
        const now = Date.now();
        setLastFetch(new Date(now));
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: rows, ts: now })); } catch (_) {}
      } else {
        setError('Could not load headlines.');
      }
    } catch (e) {
      setError('Unable to fetch news at this time.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  useEffect(() => {
    const id = setInterval(() => fetchNews(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchNews]);

  return (
    <div className="news-headlines">
      <div className="news-headlines__header">
        <span className="news-headlines__icon"><FaNewspaper /></span>
        <h3 className="news-headlines__title">Market Headlines</h3>
        <div className="news-headlines__meta">
          {lastFetch && <span className="news-headlines__updated">Updated {timeAgo(lastFetch)}</span>}
          <button
            className={`news-headlines__refresh ${refreshing ? 'spinning' : ''}`}
            onClick={() => fetchNews(true)}
            disabled={refreshing}
            title="Refresh headlines"
          >
            <FaSyncAlt />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="news-headlines__loading">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="news-headlines__skeleton">
              <div className="skeleton-line skeleton-line--title" />
              <div className="skeleton-line skeleton-line--meta" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="news-headlines__error">
          <span>{error}</span>
          <button onClick={() => fetchNews(true)} className="news-headlines__retry">Retry</button>
        </div>
      ) : (
        <ul className="news-headlines__list">
          {articles.map((a, i) => {
            const linked = isHttpUrl(a.url);
            const inner = (
              <div className="news-headlines__item-content">
                <span className="news-headlines__item-title">{a.title}</span>
                <div className="news-headlines__item-meta">
                  <span className="news-headlines__time">{timeAgo(a.publishedAt)}</span>
                </div>
              </div>
            );
            return (
              <li key={i} className="news-headlines__item">
                {linked ? (
                  <a
                    className="news-headlines__link"
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Read article: ${a.title}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="news-headlines__link news-headlines__link--static">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default NewsHeadlines;
