import React from 'react';

const CHUNK_RELOAD_SESSION_KEY = 'aura_chunk_reload_v2';

function isChunkLikeLoadError(error) {
  if (!error) return false;
  const name = error.name || '';
  const msg = String(error.message || error || '');
  return (
    name === 'ChunkLoadError' ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('ERR_CACHE') ||
    msg.includes('ERR_CACHE_READ_FAILURE') ||
    (msg.includes('Failed to fetch') && (msg.includes('chunk') || msg.includes('static/js')))
  );
}

/**
 * Catches failed React.lazy() / dynamic import() so a bad deploy or corrupt cache
 * does not leave the main shell blank. User-triggered reload only (no auto-loop).
 */
export default class LazyImportErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, chunkLike: false };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      chunkLike: isChunkLikeLoadError(error),
    };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[LazyImportErrorBoundary]', error?.message, info?.componentStack);
    }
  }

  componentDidUpdate(prevProps) {
    const { resetKey } = this.props;
    if (resetKey != null && resetKey !== prevProps.resetKey && this.state.hasError) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ hasError: false, error: null, chunkLike: false });
    }
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
    } catch {
      /* ignore */
    }
    const go = () => {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('_app_retry', String(Date.now()));
        window.location.replace(u.toString());
      } catch {
        window.location.reload();
      }
    };
    if (process.env.NODE_ENV === 'production' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(go)
        .catch(go);
      return;
    }
    go();
  };

  render() {
    if (this.state.hasError) {
      const chunk = this.state.chunkLike;
      return (
        <div
          style={{
            minHeight: '55vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '28px 20px',
            background: '#0a0a0a',
            color: '#fff',
          }}
        >
          <div
            style={{
              maxWidth: 520,
              width: '100%',
              padding: '26px 22px',
              borderRadius: 14,
              border: '1px solid rgba(234, 169, 96, 0.28)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <h1 style={{ margin: '0 0 10px', fontSize: '1.15rem', fontWeight: 600 }}>
              {chunk ? 'Could not load this screen' : 'Something went wrong'}
            </h1>
            <p style={{ margin: '0 0 16px', lineHeight: 1.55, color: 'rgba(255,255,255,0.78)', fontSize: '0.92rem' }}>
              {chunk
                ? 'Part of the app failed to download (often after a new release or a browser cache glitch). Reload to fetch the latest version. This does not repeat automatically.'
                : 'An unexpected error occurred while opening this page.'}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '11px 18px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                background: '#b47830',
                color: '#fff',
              }}
            >
              Reload application
            </button>
            {chunk ? (
              <p style={{ margin: '14px 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.45 }}>
                If this persists, clear site data for this domain or try a private window.
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
