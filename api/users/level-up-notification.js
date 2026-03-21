const { postLevelUpToLevelsChannel } = require('../utils/post-level-up-to-levels-channel');

/**
 * POST /api/users/level-up-notification
 * Body: { userId, newLevel, username } (oldLevel optional)
 * Inserts celebration into #levels (idempotent duplicate skip).
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { userId, newLevel, username } = req.body || {};

    if (!userId || !newLevel || !username) {
      return res.status(400).json({
        success: false,
        message: 'userId, newLevel, and username are required'
      });
    }

    const out = await postLevelUpToLevelsChannel({
      username: String(username),
      newLevel: Number(newLevel),
      senderIdFallback: userId
    });

    if (!out.ok) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send level-up notification',
        error: out.error
      });
    }

    return res.status(200).json({
      success: true,
      message: out.duplicate ? 'Level-up already announced (duplicate skipped)' : 'Level-up notification sent successfully',
      channelId: out.channelId,
      duplicate: !!out.duplicate
    });
  } catch (error) {
    console.error('Error sending level-up notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
