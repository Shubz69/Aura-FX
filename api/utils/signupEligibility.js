/**
 * Shared signup checks — avoid sending verifications if user already exists.
 */

/** Collapse +44 0… (common UK mistake) into +447… for E.164 */
function collapseUkTrunkAfter44(digits) {
  if (digits.startsWith('44') && digits.length >= 12 && digits[2] === '0') {
    return `44${digits.slice(3)}`;
  }
  return digits;
}

function normalizePhoneE164(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  let digits;
  if (trimmed.startsWith('+')) {
    digits = trimmed.slice(1).replace(/\D/g, '');
  } else {
    digits = trimmed.replace(/\D/g, '');
  }
  digits = collapseUkTrunkAfter44(digits);
  if (digits.length < 10) return '';
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const len = e164.replace(/\D/g, '').length;
  if (len < 10 || len > 15) return '';
  return e164;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} rawPhone
 * @returns {Promise<boolean>}
 */
async function checkPhoneAlreadyRegistered(conn, rawPhone) {
  const e164 = normalizePhoneE164(rawPhone);
  if (!e164) return false;
  const tail = e164.replace(/\D/g, '').slice(-10);
  if (tail.length < 10) return false;
  try {
    const [rows] = await conn.execute(
      `SELECT id FROM users WHERE phone IS NOT NULL
       AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''),'+',''),' ',''),'-',''),'(','')) >= 10
       AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''),'+',''),' ',''),'-',''),'(',''), 10) = ?
       LIMIT 1`,
      [tail]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    return false;
  }
}

module.exports = {
  normalizePhoneE164,
  checkPhoneAlreadyRegistered,
};
