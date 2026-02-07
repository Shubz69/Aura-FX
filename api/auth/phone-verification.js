/**
 * Phone verification for signup - Twilio Verify API.
 * Works globally (UK, US, India, etc.) without needing country-specific numbers.
 */
require('../utils/suppress-warnings');

const normalizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ success: false, message: 'Invalid JSON' }); }
    }
    const { action, phone, code } = body;

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!sid || !token || !serviceSid) {
      return res.status(503).json({
        success: false,
        message: 'Phone verification requires Twilio Verify. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID in Vercel. Create a Verify Service at console.twilio.com → Verify → Services.'
      });
    }

    if (action === 'send' || !action) {
      const raw = (phone || '').toString().trim();
      if (!raw || raw.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ success: false, message: 'Valid phone number is required' });
      }
      const phoneE164 = normalizePhone(raw);

      try {
        const twilio = require('twilio');
        const client = twilio(sid, token);
        await client.verify.v2
          .services(serviceSid)
          .verifications.create({ to: phoneE164, channel: 'sms' });
      } catch (twilioErr) {
        console.error('Twilio Verify error:', twilioErr.message);
        const codeNum = twilioErr.code || twilioErr.status || 0;
        const msg = (twilioErr.message || '').toLowerCase();
        if (codeNum === 21608 || msg.includes('unverified') || msg.includes('trial')) {
          return res.status(400).json({
            success: false,
            message: 'Twilio trial: verify this number at twilio.com/console/phone-numbers/verified or upgrade your account.'
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to send SMS. Please check your phone number and try again.'
        });
      }

      return res.status(200).json({ success: true, message: 'Verification code sent' });
    }

    if (action === 'verify') {
      const raw = (phone || '').toString().trim();
      const codeTrimmed = (code || '').toString().trim();
      if (!raw || !codeTrimmed) {
        return res.status(400).json({ success: false, message: 'Phone and code are required' });
      }
      const phoneE164 = normalizePhone(raw);

      try {
        const twilio = require('twilio');
        const client = twilio(sid, token);
        const check = await client.verify.v2
          .services(serviceSid)
          .verificationChecks.create({ to: phoneE164, code: codeTrimmed });

        if (check.status === 'approved') {
          return res.status(200).json({ success: true, verified: true });
        }
        return res.status(400).json({ success: false, message: 'Invalid or expired code' });
      } catch (twilioErr) {
        console.error('Twilio Verify check error:', twilioErr.message);
        return res.status(400).json({ success: false, message: 'Invalid or expired code' });
      }
    }

    return res.status(400).json({ success: false, message: 'Invalid action' });
  } catch (err) {
    console.error('Phone verification error:', err);
    return res.status(500).json({ success: false, message: 'An error occurred' });
  }
};
