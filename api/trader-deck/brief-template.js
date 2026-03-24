require('../utils/suppress-warnings');

const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { getTemplate, saveTemplate, normalizePeriod } = require('./services/briefTemplateService');
const { generatePreviewBrief } = require('./services/autoBriefGenerator');

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const raw = typeof req.body === 'string' ? req.body : req.body.toString();
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function requireAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) return { ok: false, status: 404, message: 'Not found' };
  const [rows] = await executeQuery('SELECT role FROM users WHERE id = ? LIMIT 1', [Number(decoded.id)]);
  const role = (rows[0]?.role || '').toLowerCase();
  if (role !== 'super_admin') {
    // Intentionally return 404 so non-super-admin users cannot discover this feature.
    return { ok: false, status: 404, message: 'Not found' };
  }
  return { ok: true };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const period = normalizePeriod(req.query?.period || parseBody(req).period || 'daily');
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ success: false, message: admin.message });

  if (req.method === 'GET') {
    try {
      const template = await getTemplate(period);
      return res.status(200).json({ success: true, period, template });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to load template' });
    }
  }

  if (req.method === 'PUT') {
    const body = parseBody(req);
    const templateText = String(body.templateText || '').trim();
    if (!templateText) {
      return res.status(400).json({ success: false, message: 'templateText is required' });
    }
    try {
      const template = await saveTemplate({ period, templateText });
      return res.status(200).json({ success: true, period, template });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to save template' });
    }
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const action = String(body.action || 'preview').toLowerCase();
    const templateText = String(body.templateText || '').trim();
    try {
      if (action === 'publish-preview') {
        return res.status(400).json({ success: false, message: 'Manual publish is disabled. Automation publishes briefs on schedule.' });
      }
      const preview = await generatePreviewBrief({
        period,
        templateText,
        timeZone: 'Europe/London',
        runDate: new Date(),
      });
      return res.status(200).json(preview);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to generate preview' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
