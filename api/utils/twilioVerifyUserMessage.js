'use strict';

/**
 * Map Twilio Verify / REST errors to safe HTTP status + user-facing copy.
 * Twilio Node RestException: code (number), status (HTTP), message (string).
 */

function num(err, key) {
  const v = err && err[key];
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** SMS send (verifications.create) */
function userFacingTwilioSendError(err) {
  const code = num(err, 'code');
  const http = num(err, 'status');
  const msg = String((err && err.message) || '').toLowerCase();

  if (code === 21608 || msg.includes('unverified') || msg.includes('trial')) {
    return {
      status: 400,
      message:
        'SMS trial limits apply on this account. Try a verified test number or contact support if this persists.',
    };
  }
  if (
    code === 60203 ||
    code === 60212 ||
    code === 20429 ||
    http === 429 ||
    msg.includes('max send') ||
    msg.includes('too many')
  ) {
    return {
      status: 429,
      message:
        'Too many verification texts to this number. Wait about 10 minutes, then tap “Send verification codes” or Resend.',
    };
  }
  if (
    code === 21211 ||
    code === 21614 ||
    code === 60200 ||
    code === 60201 ||
    msg.includes("invalid 'to'") ||
    msg.includes('invalid to') ||
    msg.includes('invalid parameter') ||
    (msg.includes('invalid') && (msg.includes('phone') || msg.includes('number')))
  ) {
    return {
      status: 400,
      message:
        'This number could not receive a text. Check your country code and mobile number. For UK, use +44 and enter your number without the leading 0 (e.g. 7706… not 07706…).',
    };
  }
  if (code === 20404 || msg.includes('was not found') || msg.includes('not found')) {
    return {
      status: 503,
      message: 'Phone verification is temporarily unavailable. Please try again in a few minutes.',
    };
  }
  if (code === 20003 || msg.includes('authenticate') || msg.includes('authentication')) {
    return {
      status: 503,
      message: 'Phone verification is temporarily unavailable. Please try again later.',
    };
  }
  if (http >= 400 && http < 500) {
    return {
      status: 400,
      message:
        'Could not send a text to this number. Check the number and country code, or wait a few minutes and try again.',
    };
  }
  return {
    status: 503,
    message: 'Could not send SMS right now. Please try again in a few minutes.',
  };
}

/** Code check (verificationChecks.create) */
function userFacingTwilioCheckError(err) {
  const code = num(err, 'code');
  const msg = String((err && err.message) || '').toLowerCase();
  if (code === 60202 || msg.includes('max check')) {
    return {
      message:
        'Too many incorrect code attempts. Tap “Resend phone code” for a new SMS, then enter the new code.',
    };
  }
  return null;
}

module.exports = {
  userFacingTwilioSendError,
  userFacingTwilioCheckError,
};
