/**
 * DB: strikes ledger + XP penalty for community moderation.
 * Uses xp_events (negative amounts) and keeps users.xp / users.level in sync.
 */

const { getLevelFromXP, round2 } = require('../../utils/xp-system');

async function ensureStrikesTable(db) {
  if (!db || !process.env.MYSQL_DATABASE) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_moderation_strikes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      channel_id VARCHAR(255) DEFAULT NULL,
      rule_id VARCHAR(80) NOT NULL,
      reason VARCHAR(512) DEFAULT NULL,
      message_preview VARCHAR(240) DEFAULT NULL,
      xp_penalty DECIMAL(14, 4) DEFAULT 0,
      strike_units INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_created (user_id, created_at),
      INDEX idx_rule (rule_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureXpEventsColumns(db) {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS xp_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        amount DECIMAL(14, 4) NOT NULL,
        source VARCHAR(64) NOT NULL,
        meta JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.warn('ensureXpEventsColumns:', e.message);
  }
}

/**
 * Record strike rows + negative xp_events + update users.xp / level.
 */
async function applyModerationPenalties(db, userId, channelId, violations, contentPreview) {
  if (!db || !userId || !violations || violations.length === 0) {
    return { strikesRecorded: 0, xpDeducted: 0 };
  }

  await ensureStrikesTable(db);
  await ensureXpEventsColumns(db);

  let strikesRecorded = 0;
  let xpDeducted = 0;
  const preview =
    (contentPreview || '').toString().replace(/\s+/g, ' ').trim().slice(0, 220) || null;

  for (const v of violations) {
    const units = Math.max(1, parseInt(v.strikes, 10) || 1);
    const xp = Math.max(0, Number(v.xpPenalty) || 0);
    const ruleId = (v.ruleId || 'unknown').toString().slice(0, 80);

    await db.execute(
      `INSERT INTO community_moderation_strikes
        (user_id, channel_id, rule_id, reason, message_preview, xp_penalty, strike_units)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, channelId || null, ruleId, v.publicMessage || null, preview, xp, units]
    );
    strikesRecorded += units;

    if (xp > 0) {
      const [uRows] = await db.execute('SELECT COALESCE(xp, 0) AS xp FROM users WHERE id = ?', [userId]);
      const currentXp = parseFloat(uRows?.[0]?.xp ?? 0);
      const newXp = round2(Math.max(0, currentXp - xp));
      const newLevel = getLevelFromXP(newXp);

      await db.execute('UPDATE users SET xp = ?, level = ? WHERE id = ?', [newXp, newLevel, userId]);

      try {
        await db.execute(
          `INSERT INTO xp_events (user_id, amount, source, meta) VALUES (?, ?, ?, ?)`,
          [
            userId,
            -xp,
            'community_moderation',
            JSON.stringify({
              rule_id: ruleId,
              channel_id: channelId || null,
            }),
          ]
        );
      } catch (e) {
        console.warn('xp_events insert (moderation):', e.message);
      }
      xpDeducted += xp;
    }
  }

  return { strikesRecorded, xpDeducted };
}

module.exports = {
  ensureStrikesTable,
  applyModerationPenalties,
  getLevelFromXP,
};
