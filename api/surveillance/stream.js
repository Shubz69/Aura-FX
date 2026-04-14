const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { assertSurveillanceEntitlement } = require('./assertEntitlement');
const { ensureSurveillanceSchema } = require('./schema');
const { getSystemHealthSummary } = require('./adapterState');
const { SURV_FEED_ORDER_SQL } = require('./store');

function authHeaderFromReq(req) {
  const h = req.headers?.authorization;
  if (h && h.startsWith('Bearer ')) return h;
  const q = req.query?.token;
  if (q && String(q).length > 20) return `Bearer ${String(q)}`;
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(authHeaderFromReq(req));
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = Number(decoded.id);

  try {
    await ensureSurveillanceSchema();
    const entitled = await assertSurveillanceEntitlement(userId, res);
    if (!entitled) return;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const sendTick = async () => {
      const health = await getSystemHealthSummary();
      const [topRows] = await executeQuery(
        `SELECT id FROM surveillance_events ORDER BY ${SURV_FEED_ORDER_SQL} LIMIT 12`,
        []
      );
      const topEventIds = (topRows || []).map((r) => String(r.id));
      const payload = JSON.stringify({
        type: 'tick',
        serverTime: new Date().toISOString(),
        topEventIds,
        health,
      });
      res.write(`event: tick\ndata: ${payload}\n\n`);
    };

    await sendTick();
    const iv = setInterval(sendTick, 12000);
    const onClose = () => {
      clearInterval(iv);
      try {
        res.end();
      } catch {
        /* ignore */
      }
    };
    req.on('close', onClose);
    req.on('aborted', onClose);
  } catch (e) {
    console.error('[surveillance/stream]', e);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Stream failed' });
    }
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
};
