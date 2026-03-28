/**
 * Shared signup checks — avoid sending verifications if user already exists.
 */

function normalizePhoneE164(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
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
