/**
 * List or permanently delete every user whose email is on @aurafx.com
 * (including subdomains, e.g. name@mail.aurafx.com).
 *
 * GET  — Super Admin JWT or Bearer CRON_SECRET: returns count + up to 500 rows
 * POST — Same auth + body { "confirm": "DELETE_ALL_AURAFX_COM_EMAILS" } executes delete
 *
 * WARNING: Irreversible. Do not call if you use @aurafx.com for real staff logins.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { deleteUsersByIds, getRows } = require('../utils/purge-demo-users');
const { invalidatePattern } = require('../cache');

/**
 * Host = aurafx.com or *.aurafx.com (e.g. mail.aurafx.com).
 * Does not match notaurafx.com or user@x.notaurafx.com.
 */
const WHERE_AURAFX_COM = `(
  email IS NOT NULL AND TRIM(email) != ''
  AND LOCATE('@', email) > 0
  AND (
    SUBSTRING_INDEX(LOWER(TRIM(email)), '@', -1) = 'aurafx.com'
    OR SUBSTRING_INDEX(LOWER(TRIM(email)), '@', -1) LIKE '%.aurafx.com'
  )
)`;

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization || '';
  const cronOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const decoded = verifyToken(auth);
  const role = (decoded?.role || '').toString().toUpperCase();
  const superOk = decoded?.id && role === 'SUPER_ADMIN';

  if (!cronOk && !superOk) {
    return res.status(401).json({
      success: false,
      message: 'Super Admin JWT or Bearer CRON_SECRET required'
    });
  }

  try {
    if (req.method === 'GET') {
      const [countR] = await executeQuery(`SELECT COUNT(*) AS c FROM users WHERE ${WHERE_AURAFX_COM}`);
      const count = Number(getRows(countR)[0]?.c ?? 0);
      const [listR] = await executeQuery(
        `SELECT id, email, username, name, role, created_at FROM users WHERE ${WHERE_AURAFX_COM} ORDER BY id LIMIT 500`
      );
      return res.status(200).json({
        success: true,
        description: 'Emails matching *@aurafx.com or *@*.*.aurafx.com (subdomains)',
        count,
        users: getRows(listR)
      });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      if (body.confirm !== 'DELETE_ALL_AURAFX_COM_EMAILS') {
        return res.status(400).json({
          success: false,
          message: 'Required: { "confirm": "DELETE_ALL_AURAFX_COM_EMAILS" }'
        });
      }
      const [idResult] = await executeQuery(`SELECT id FROM users WHERE ${WHERE_AURAFX_COM}`);
      const ids = getRows(idResult).map((r) => r.id).filter(Boolean);
      const result = await deleteUsersByIds(executeQuery, ids, { log: console.log });
      invalidatePattern('leaderboard_v*');
      invalidatePattern('community_users*');
      return res.status(200).json({
        success: true,
        message: 'Deleted users with @aurafx.com emails',
        deletedUsers: result.deletedUsers,
        userIds: result.userIds,
        steps: result.steps
      });
    }

    return res.status(405).json({ success: false, message: 'Use GET (preview) or POST (delete)' });
  } catch (e) {
    console.error('purge-aurafx-com-users:', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
};
