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
  const localChartTarget = process.env.REACT_APP_LOCAL_API_PROXY_TARGET || 'http://localhost:3001';
  const defaultApiTarget = process.env.REACT_APP_DEFAULT_API_PROXY_TARGET || 'https://www.auraterminal.ai';

  // Route chart-history specifically to local handler for QA/dev validation.
  app.use(
    '/api/market',
    createProxyMiddleware({
      target: localChartTarget,
      changeOrigin: true,
      secure: false,
      ws: true,
      pathFilter: '/chart-history',
      pathRewrite: (path) => `/api/market${path}`,
      logLevel: 'warn',
    })
  );

  // Keep remaining API routes on the existing backend target.
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

