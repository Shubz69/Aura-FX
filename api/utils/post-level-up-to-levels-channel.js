/**
 * Insert a level-up celebration into the #levels channel (shared by update-xp, daily-login, HTTP handler, admin).
 * Uses executeQuery so it works from any API without holding a separate pool connection.
 */

const { executeQuery } = require('../db');

const TRADING_RANKS = {
  10: 'Market Observer', 20: 'Chart Reader', 30: 'Price Action Student', 40: 'Risk Apprentice',
  50: 'Session Trader', 60: 'Breakout Hunter', 70: 'Trend Rider', 80: 'Liquidity Scout', 90: 'Structure Analyst',
  100: 'Junior Trader', 110: 'Technical Specialist', 120: 'Market Strategist', 130: 'Volume Analyst',
  140: 'Pattern Master', 150: 'Risk Manager', 160: 'Session Dominator', 170: 'Momentum Trader',
  180: 'Precision Sniper', 190: 'Consistency Builder', 200: 'Advanced Trader', 210: 'Market Engineer',
  220: 'Institutional Reader', 230: 'Liquidity Technician', 240: 'Algorithmic Thinker', 250: 'Smart Money Trader',
  260: 'Macro Analyst', 270: 'Scalping Specialist', 280: 'Swing Commander', 290: 'Strategy Architect',
  300: 'Pro Trader', 310: 'Market Controller', 320: 'Execution Specialist', 330: 'Risk Architect',
  340: 'Trading Mentor', 350: 'Market Professor', 360: 'Hedge Strategist', 370: 'Alpha Generator',
  380: 'Capital Protector', 390: 'Performance Coach', 400: 'Elite Trader', 410: 'Institutional Operative',
  420: 'Liquidity Commander', 430: 'Fund Manager', 440: 'Prop Firm Trader', 450: 'Portfolio Architect',
  460: 'Market Dominator', 470: 'Capital General', 480: 'Alpha Lord', 490: 'Risk Emperor',
  500: 'Trading Master', 510: 'Market Grandmaster', 520: 'Capital Controller', 530: 'Liquidity King',
  540: 'Hedge Fund Mind', 550: 'Strategy Overlord', 560: 'Institutional Elite', 570: 'Execution God',
  580: 'Risk Titan', 590: 'Market Titan', 600: 'Trading Legend', 610: 'Market Phantom',
  620: 'Liquidity Beast', 630: 'Alpha Hunter', 640: 'Capital Predator', 650: 'Market Warlord',
  660: 'Institutional Beast', 670: 'Strategy Demon', 680: 'Risk Assassin', 690: 'Chart God',
  700: 'Mythical Trader', 710: 'Market Deity', 720: 'Liquidity God', 730: 'Alpha Reaper',
  740: 'Capital Emperor', 750: 'Market Destroyer', 760: 'Institutional Lord', 770: 'Strategy King',
  780: 'Risk Immortal', 790: 'Chart Immortal', 800: 'Immortal Trader', 810: 'Market Immortal',
  820: 'Liquidity Immortal', 830: 'Alpha Immortal', 840: 'Capital Immortal', 850: 'Strategy Immortal',
  860: 'Risk Immortal', 870: 'Chart Immortal', 880: 'Institutional Immortal', 890: 'Trading Immortal',
  900: 'Trading God', 910: 'Market God', 920: 'Liquidity God', 930: 'Alpha God',
  940: 'Capital God', 950: 'Strategy God', 960: 'Risk God', 970: 'Chart God',
  980: 'Institutional God', 990: 'Supreme Trader', 1000: 'Aura Terminal Legend'
};

function getRankTitle(level) {
  if (level >= 1000) return TRADING_RANKS[1000];
  const milestones = Object.keys(TRADING_RANKS).map(Number).sort((a, b) => b - a);
  for (const milestone of milestones) {
    if (level >= milestone) {
      return TRADING_RANKS[milestone];
    }
  }
  return 'Trading Novice';
}

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
