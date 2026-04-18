'use strict';

/**
 * Staff admin gate for API routes: DB role admin/super_admin OR email on super-admin list
 * (SUPER_ADMIN_EMAIL env + built-in fallbacks in entitlements).
 */
const { verifyToken } = require('./auth');
const { isSuperAdminEmail } = require('./entitlements');
const { executeQuery } = require('../db');

async function assertStaffAdminFromRequest(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return { ok: false, status: 401, message: 'Authentication required' };
  }
  const [rows] = await executeQuery('SELECT email, role FROM users WHERE id = ? LIMIT 1', [
    Number(decoded.id),
  ]);
  const row = rows && rows[0];
  if (!row) return { ok: false, status: 401, message: 'User not found' };
  const role = (row.role || '').toString().toLowerCase();
  if (role === 'admin' || role === 'super_admin' || isSuperAdminEmail(row)) {
    return { ok: true, decoded, userRow: row };
  }
  return { ok: false, status: 403, message: 'Admin access required' };
}

module.exports = { assertStaffAdminFromRequest };
