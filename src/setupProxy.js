const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Development-only proxy:
 * - keeps frontend requests same-origin (`/api/...`) to avoid CORS/CSP in local QA
 * - forwards API calls to a local API host (defaults to localhost:3001)
 *
 * Override target:
 *   REACT_APP_LOCAL_API_PROXY_TARGET=http://localhost:3001
 */
module.exports = function setupProxy(app) {
  const explicitLocalApi = process.env.REACT_APP_LOCAL_API_PROXY_TARGET;
  const defaultChartLocal = 'http://localhost:3001';
  const defaultApiTarget = process.env.REACT_APP_DEFAULT_API_PROXY_TARGET || 'https://www.auraterminal.ai';

  // Full local backend (chart, candle-context, Replay stubs, daily-login, etc.).
  // Required for: node scripts/local-api-server.js + REACT_APP_LOCAL_API_PROXY_TARGET=http://localhost:3001 npm start
  if (explicitLocalApi && String(explicitLocalApi).trim()) {
    app.use(
      '/api',
      createProxyMiddleware({
        target: explicitLocalApi.trim(),
        changeOrigin: true,
        secure: false,
        ws: true,
        logLevel: 'warn',
      })
    );
    return;
  }

  // Default dev: chart-history (+ path under /api/market/chart-history) proxied to local :3001; other /api routes use production API.
  app.use(
    '/api/market',
    createProxyMiddleware({
      target: defaultChartLocal,
      changeOrigin: true,
      secure: false,
      ws: true,
      pathFilter: '/chart-history',
      pathRewrite: (path) => `/api/market${path}`,
      logLevel: 'warn',
    })
  );

  app.use(
    '/api',
    createProxyMiddleware({
      target: defaultApiTarget,
      changeOrigin: true,
      secure: false,
      ws: true,
      logLevel: 'warn',
    })
  );
};

