const { verifyToken } = require('../utils/auth');
const { assertSurveillanceEntitlement } = require('./assertEntitlement');
const { ensureSurveillanceSchema } = require('./schema');
const { getEventById, getStoryBundleForEvent, relatedEvents } = require('./store');
const { buildWhyMatters } = require('./marketImpact');

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function whyItMatters(ev) {
  if (!ev) return '';
  if (ev.why_matters) return ev.why_matters;
  return buildWhyMatters(ev, ev.impacted_markets || [], ev.risk_bias || 'neutral');
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const id = req.query?.id;
  if (!id) return res.status(400).json({ success: false, message: 'Missing id' });

  try {
    await ensureSurveillanceSchema();
    const entitled = await assertSurveillanceEntitlement(Number(decoded.id), res);
    if (!entitled) return;

    const event = await getEventById(id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    const related = await relatedEvents(event, 8);
    const story = await getStoryBundleForEvent(event);

    return res.status(200).json({
      success: true,
      event: {
        ...event,
        why_it_matters: whyItMatters(event),
      },
      story,
      related,
    });
  } catch (e) {
    console.error('[surveillance/event]', e);
    return res.status(500).json({ success: false, message: 'Failed to load event' });
  }
};
