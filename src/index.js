import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const CHUNK_RELOAD_KEY = "aura_chunk_reload_v2";

/**
 * After a new deploy, a cached main.*.js may still request removed chunk files → 404 (often text/plain) → MIME / ChunkLoadError.
 * Reload lets the browser re-fetch index.html + entry (especially with must-revalidate on /).
 * Cap attempts so a broken cache cannot infinite-loop.
 */
function scheduleChunkLoadRecovery() {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  let n = 0;
  try {
    n = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0", 10);
    if (n >= 4) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(n + 1));
  } catch {
    return;
  }
  // First try normal reload; later attempts bust caches (some browsers reuse entry script from HTTP cache).
  if (n === 0) {
    window.location.reload();
    return;
  }
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("_chunk_retry", String(Date.now()));
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
  }
}

function isChunkScriptUrl(src) {
  if (!src || typeof src !== "string") return false;
  return /\/static\/js\/[^/]+\.chunk\.js(\?|$)/i.test(src) || /\/static\/js\/main\.[^/]+\.js(\?|$)/i.test(src);
}

function isChunkLoadFailure(err, message) {
  const name = err?.name || "";
  const msg = message || err?.message || String(err || "");
  return (
    name === "ChunkLoadError" ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    (msg.includes("text/plain") && msg.includes("MIME type"))
  );
}

if (typeof window !== "undefined") {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has("_chunk_retry")) {
      u.searchParams.delete("_chunk_retry");
      const next = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState({}, "", next);
    }
  } catch {
    /* ignore */
  }

  window.addEventListener(
    "error",
    (event) => {
      const t = event.target;
      const scriptSrc = t && t.tagName === "SCRIPT" && t.src ? String(t.src) : "";
      if (scriptSrc && isChunkScriptUrl(scriptSrc)) {
        event.preventDefault();
        scheduleChunkLoadRecovery();
        return;
      }
      if (isChunkLoadFailure(event.error, event.message)) {
        event.preventDefault();
        scheduleChunkLoadRecovery();
      }
    },
    true
  );
  // Webpack's chunk loader often rejects a promise; that may not surface as a window "error" on the script tag
  // in all cases, so recover from the same failure mode via unhandledrejection (capped; see scheduleChunkLoadRecovery).
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const name = reason?.name || "";
    const msg = reason?.message != null ? String(reason.message) : String(reason || "");
    if (name === "ChunkLoadError" || isChunkLoadFailure(reason, msg)) {
      event.preventDefault();
      scheduleChunkLoadRecovery();
    }
  });
  // Dynamic import / React.lazy failures are handled by LazyImportErrorBoundary (user-triggered reload).
  // Auto-reloading here caused loops with ERR_CACHE_READ_FAILURE and fought the in-app recovery UI.
}

function flattenConsoleArgs(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a == null) return '';
      if (typeof a === 'object' && typeof a.message === 'string') return a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

// Suppress Vercel instrumentation / third-party script noise in production (not actionable in this repo)
if (process.env.NODE_ENV === 'production') {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args) => {
    const message = flattenConsoleArgs(args);
    if (
      message.includes('[DEPRECATED] Default export is deprecated') ||
      message.includes('zustand') ||
      message.includes('DialogContent') ||
      message.includes('DialogTitle') ||
      message.includes('Description') ||
      message.includes('aria-describedby') ||
      message.includes('Could not verify user existence') ||
      message.includes('TimeoutError') ||
      message.includes('signal timed out')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    const message = flattenConsoleArgs(args);
    if (
      message.includes('DialogContent') ||
      message.includes('DialogTitle') ||
      message.includes('Description') ||
      message.includes('aria-describedby') ||
      message.includes('zustand') ||
      (message.includes('Fetch failed') && message.includes('feedback.js')) ||
      message.includes('Snapshot fetch error') ||
      message.includes('WebSocket is already in CLOSING') ||
      message.includes('WebSocket is already in CLOSED')
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

// Register service worker for PWA push notifications
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js?v=6', { scope: '/', updateViaCache: 'none' })
      .then((reg) => reg?.update?.())
      .catch((err) => console.warn('SW registration failed:', err));
  });
}

const container = document.getElementById("root");

if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
} else {
    console.error("Root element not found");
}
