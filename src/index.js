import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

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
      message.includes('Snapshot fetch error')
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

// Register service worker for PWA push notifications
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .catch(err => console.warn('SW registration failed:', err));
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
