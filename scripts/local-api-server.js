/* eslint-disable no-console */
const express = require('express');
const cors = require('cors');

const chartHistoryHandler = require('../api/market/chart-history');

const PORT = Number(process.env.LOCAL_API_PORT || 3001);
const app = express();

app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', `http://localhost:${PORT}`],
    credentials: true,
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'local-api-server', port: PORT });
});

app.get('/api/me', (_req, res) => {
  res.json({
    id: 9001,
    userId: 9001,
    email: 'qa@local.test',
    role: 'admin',
    username: 'qa-admin',
  });
});

app.get('/api/users/:userId', (req, res) => {
  const id = Number(req.params.userId || 9001);
  res.json({
    id,
    userId: id,
    email: 'qa@local.test',
    role: 'admin',
    username: 'qa-admin',
  });
});

app.get('/api/subscription/status', (_req, res) => {
  res.json({
    success: true,
    hasAccess: true,
    plan: 'elite',
    status: 'active',
  });
});

app.post('/api/users/daily-login', (_req, res) => {
  res.json({
    success: true,
    awarded: false,
    message: 'local-dev daily login bypass',
  });
});

app.get('/api/market/chart-history', async (req, res) => {
  try {
    await chartHistoryHandler(req, res);
  } catch (e) {
    console.error('[local-api-server] chart-history error:', e);
    res.status(500).json({
      success: false,
      message: 'Local API wrapper failed',
      error: String(e?.message || e),
    });
  }
});

app.listen(PORT, () => {
  console.log(`[local-api-server] listening on http://localhost:${PORT}`);
  console.log(`[local-api-server] chart endpoint: http://localhost:${PORT}/api/market/chart-history`);
});

