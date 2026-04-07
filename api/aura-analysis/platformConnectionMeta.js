/**
 * Idempotent schema + metadata updates for aura_platform_connections (MT5 sync tracking).
 */

function isDuplicateColumnError(err) {
  if (!err) return false;
  if (err.errno === 1060) return true;
  if (err.code === 'ER_DUP_FIELDNAME') return true;
  return /duplicate column/i.test(String(err.message || ''));
}

async function ensurePlatformConnectionsColumns(executeQuery) {
  const fragments = [
    'ADD COLUMN broker_name VARCHAR(255) NULL',
    'ADD COLUMN server_name VARCHAR(255) NULL',
    'ADD COLUMN connection_status VARCHAR(32) NULL',
    'ADD COLUMN last_sync_at TIMESTAMP NULL',
    'ADD COLUMN last_success_at TIMESTAMP NULL',
    'ADD COLUMN last_error_code VARCHAR(80) NULL',
    'ADD COLUMN last_error_message VARCHAR(512) NULL',
  ];
  for (const frag of fragments) {
    try {
      await executeQuery(`ALTER TABLE aura_platform_connections ${frag}`);
    } catch (e) {
      if (!isDuplicateColumnError(e)) throw e;
    }
  }
}

/**
 * Patch connection tracking row (only supplied fields). Server-side only.
 */
async function patchConnectionRow(executeQuery, userId, platformId, patch) {
  const p = patch || {};
  const updates = [];
  const args = [];

  if (p.broker_name !== undefined) {
    updates.push('broker_name = ?');
    args.push(p.broker_name == null ? null : String(p.broker_name).slice(0, 255));
  }
  if (p.server_name !== undefined) {
    updates.push('server_name = ?');
    args.push(p.server_name == null ? null : String(p.server_name).slice(0, 255));
  }
  if (p.connection_status !== undefined) {
    const s = String(p.connection_status).slice(0, 32);
    updates.push('connection_status = ?');
    args.push(s);
    // Link lifecycle: only user-facing DELETE sets status='disconnected'. Transient sync/API failures
    // update connection_status only so MT accounts stay "connected" in the app until the user disconnects.
  }
  if (p.last_sync_at === true) {
    updates.push('last_sync_at = NOW()');
    updates.push('last_sync = NOW()');
  }
  if (p.last_success_at === true) {
    updates.push('last_success_at = NOW()');
    updates.push('last_error_code = NULL');
    updates.push('last_error_message = NULL');
  }
  if (p.last_error_code !== undefined) {
    updates.push('last_error_code = ?');
    args.push(
      p.last_error_code == null ? null : String(p.last_error_code).slice(0, 80),
    );
  }
  if (p.last_error_message !== undefined) {
    updates.push('last_error_message = ?');
    args.push(
      p.last_error_message == null ? null : String(p.last_error_message).slice(0, 512),
    );
  }

  if (!updates.length) return;

  args.push(userId, platformId);
  await executeQuery(
    `UPDATE aura_platform_connections SET ${updates.join(', ')}
     WHERE user_id = ? AND platform_id = ?`,
    args,
  );
}

module.exports = {
  ensurePlatformConnectionsColumns,
  patchConnectionRow,
};
