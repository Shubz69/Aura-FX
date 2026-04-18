/**
 * Loads TradingView Charting Library from /public and registers the UDF datafeed on `window`.
 * UDF client is bundled in-app (`udfCompatibleDatafeed.js`) so the browser does not load
 * `public/datafeeds/udf/dist/bundle.js` (404 HTML → “MIME type text/html” in DevTools).
 * If you still see MIME errors for a mangled `bundle.js` URL, it is usually a browser extension
 * rewriting script URLs or a stale console line from another tab — retry in a clean profile.
 * Copy `charting_library` into `public/` (see scripts/copy-tradingview-charting-library.ps1).
 */

const SCRIPT_IDS = {
  library: 'aura-tv-cl-standalone',
};

function loadScriptOnce(src, id) {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('No document'));
  }
  const existing = document.getElementById(id);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (existing.getAttribute('data-loaded') === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = id;
    s.async = true;
    s.src = src;
    s.onload = () => {
      s.setAttribute('data-loaded', '1');
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function hasChartingLibraryGlobals() {
  return (
    typeof window !== 'undefined' &&
    window.Datafeeds &&
    typeof window.Datafeeds.UDFCompatibleDatafeed === 'function' &&
    window.TradingView &&
    typeof window.TradingView.widget === 'function'
  );
}

/**
 * @param {string} publicUrl - CRA PUBLIC_URL (usually '')
 * @returns {Promise<void>}
 */
export async function ensureTradingViewChartingLibraryLoaded(publicUrl = '') {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not available'));
  }

  const { installUdfDatafeedGlobal } = await import('./udfCompatibleDatafeed.js');
  installUdfDatafeedGlobal();

  if (hasChartingLibraryGlobals()) {
    return Promise.resolve();
  }

  const base = publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl;

  const standaloneCandidates = [
    `${base}/charting_library/charting_library.standalone.js`,
    `${base}/charting_library/bundles/charting_library.standalone.js`,
  ];

  function tryStandalone(index) {
    if (index >= standaloneCandidates.length) {
      return Promise.reject(new Error('Could not load charting_library.standalone.js from known paths'));
    }
    const src = standaloneCandidates[index];
    const id = `${SCRIPT_IDS.library}-${index}`;
    return loadScriptOnce(src, id)
      .then(() => {
        if (hasChartingLibraryGlobals()) return undefined;
        const node = document.getElementById(id);
        if (node) node.remove();
        return tryStandalone(index + 1);
      })
      .catch(() => tryStandalone(index + 1));
  }

  return tryStandalone(0);
}

export { hasChartingLibraryGlobals };

/** Map UI interval strings to Charting Library resolutions (e.g. 1D → D). */
export function normalizeChartingLibraryInterval(interval) {
  const s = String(interval ?? '60').trim();
  if (s === '1D' || s === '1d') return 'D';
  if (s === '1W' || s === '1w') return 'W';
  return s;
}
