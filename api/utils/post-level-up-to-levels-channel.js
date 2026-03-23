/**
 * Insert a level-up celebration into the #levels channel (shared by update-xp, daily-login, HTTP handler, admin).
 * Uses executeQuery so it works from any API without holding a separate pool connection.
 */

const { executeQuery } = require('../db');
const { getRankTitle } = require('./xp-system');

/**
 * @param {{ username: string, newLevel: number, senderIdFallback?: number|null }} opts
 * @returns {Promise<{ ok: boolean, channelId?: string, duplicate?: boolean, error?: string }>}
 */
async function postLevelUpToLevelsChannel({ username, newLevel, senderIdFallback = null }) {
  if (!username || newLevel == null) {
    return { ok: false, error: 'missing_username_or_level' };
  }
  const nl = Number(newLevel);
  if (!Number.isFinite(nl) || nl < 1) {
    return { ok: false, error: 'bad_level' };
  }

  const rankTitle = getRankTitle(nl);
  const levelUpMessage =
    `🎉 LEVEL UP! 🎉\n\n` +
    `${username} has reached Level ${nl}!\n\n` +
    `🏆 New Rank: ${rankTitle}\n\n` +
    `Congratulations on your progress! Keep trading and engaging to reach even higher levels! 🚀`;

  try {
    const [channels] = await executeQuery(
      'SELECT id FROM channels WHERE id = ? OR LOWER(name) = ? LIMIT 1',
      ['levels', 'levels']
    );

    let channelId = 'levels';
    if (!channels || channels.length === 0) {
      try {
        await executeQuery(
          `INSERT INTO channels (id, name, category, description, access_level) 
           VALUES (?, ?, ?, ?, ?)`,
          ['levels', 'levels', 'announcements', 'Level-up celebrations and progress.', 'open']
        );
      } catch (createError) {
        console.warn('postLevelUpToLevelsChannel: could not create levels channel:', createError.message);
      }
    } else {
      channelId = channels[0].id;
    }

    const [systemUsers] = await executeQuery(
      'SELECT id FROM users WHERE role IN (?, ?) LIMIT 1',
      ['admin', 'super_admin']
    );
    let senderId = systemUsers && systemUsers.length > 0 ? systemUsers[0].id : null;
    if (senderId == null && senderIdFallback != null) {
      senderId = Number(senderIdFallback);
      if (!Number.isFinite(senderId)) senderId = null;
    }

    try {
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          channel_id VARCHAR(255) NOT NULL,
          sender_id INT,
          content TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_channel (channel_id),
          INDEX idx_timestamp (timestamp)
        )
      `);
    } catch (tableError) {
      console.warn('postLevelUpToLevelsChannel: messages table:', tableError.message);
    }

    const safeUser = String(username).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const likePattern = `%${safeUser} has reached Level ${nl}!%`;
    const [existing] = await executeQuery(
      'SELECT id FROM messages WHERE channel_id = ? AND content LIKE ? LIMIT 1',
      [channelId, likePattern]
    );
    if (existing && existing.length > 0) {
      return { ok: true, duplicate: true, channelId };
    }

    await executeQuery(
      `INSERT INTO messages (channel_id, sender_id, content, timestamp) 
       VALUES (?, ?, ?, NOW())`,
      [channelId, senderId, levelUpMessage]
    );

    console.log(`✅ Level-up posted to #levels for ${username} (Level ${nl})`);
    return { ok: true, channelId };
  } catch (e) {
    console.error('postLevelUpToLevelsChannel:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { postLevelUpToLevelsChannel, getRankTitle };
