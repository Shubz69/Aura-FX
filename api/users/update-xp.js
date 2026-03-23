const { getDbConnection } = require('../db');
const { jsonNumber, jsonSafeDeep } = require('../utils/jsonSafe');
const { postLevelUpToLevelsChannel } = require('../utils/post-level-up-to-levels-channel');
const { getLevelFromXP, XP_RULES, round2 } = require('../utils/xp-system');

/** mysql2 may return DECIMAL/BIGINT; parseFloat(BigInt) throws in JS. */
function num(v, fallback = 0) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const { userId, xp, level, actionType, description } = req.body || {};
        
        if (!userId || xp === undefined || !level) {
            return res.status(400).json({ 
                success: false, 
                message: 'userId, xp, and level are required' 
            });
        }

        const db = await getDbConnection();
        if (!db) {
            return res.status(500).json({ 
                success: false, 
                message: 'Database connection error' 
            });
        }

        try {
            // Check if XP and level columns exist
            try {
                await db.execute('SELECT xp, level FROM users LIMIT 1');
            } catch (e) {
                console.log('XP/Level columns do not exist, adding them...');
                try {
                    await db.execute('ALTER TABLE users ADD COLUMN xp DECIMAL(14, 4) DEFAULT 0');
                    console.log('✅ Added xp column to users table');
                } catch (e2) {
                    console.warn('Could not add xp column:', e2.message);
                }
                try {
                    await db.execute('ALTER TABLE users ADD COLUMN level INT DEFAULT 1');
                    console.log('✅ Added level column to users table');
                } catch (e2) {
                    console.warn('Could not add level column:', e2.message);
                }
            }

            // Ensure xp_logs table exists for tracking XP gains
            try {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS xp_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        xp_amount DECIMAL(14, 4) NOT NULL,
                        action_type VARCHAR(50) NOT NULL,
                        description TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_user_id (user_id),
                        INDEX idx_created_at (created_at),
                        INDEX idx_action_type (action_type)
                    )
                `);
            } catch (tableError) {
                console.warn('xp_logs table already exists or error creating:', tableError.message);
            }

            const [userRows] = await db.execute(
              'SELECT xp, level, username, name, email FROM users WHERE id = ?',
              [userId]
            );
            if (!userRows || userRows.length === 0) {
              if (db && typeof db.release === 'function') db.release();
              return res.status(404).json({ success: false, message: 'User not found' });
            }
            const previousXP = num(userRows[0].xp, 0);
            const previousLevel = parseInt(userRows[0].level, 10) || 1;
            let rawGain = num(xp, 0) - previousXP;
            const PLAYER_XP_MULT = XP_RULES.MESSAGE_MULTIPLIER;
            let adjustedXP = num(xp, 0);
            let adjustedLevel = jsonNumber(level, 1);
            if (rawGain > 0 && PLAYER_XP_MULT > 0 && PLAYER_XP_MULT < 1) {
                const scaledGain = round2(rawGain * PLAYER_XP_MULT);
                adjustedXP = Math.max(0, previousXP + scaledGain);
                adjustedLevel = getLevelFromXP(adjustedXP);
                rawGain = scaledGain;
            }
            adjustedXP = round2(adjustedXP);

            // Update user XP and level
            const [updateResult] = await db.execute(
                'UPDATE users SET xp = ?, level = ? WHERE id = ?',
                [adjustedXP, adjustedLevel, userId]
            );
            
            // Log XP transaction for any change so ledger remains canonical.
            if (rawGain !== 0) {
                const logActionType = actionType || 'system_update';
                const logDescription = description || `XP updated from ${previousXP} to ${adjustedXP}`;
                
                // Log to xp_logs (legacy)
                try {
                    await db.execute(
                        'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
                        [userId, round2(rawGain), logActionType, logDescription]
                    );
                } catch (logError) {
                    console.warn('Failed to log XP to xp_logs:', logError.message);
                }
                
                // Log to xp_events (new leaderboard system)
                try {
                    await db.execute(`
                        CREATE TABLE IF NOT EXISTS xp_events (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            user_id INT NOT NULL,
                            amount DECIMAL(14, 4) NOT NULL,
                            source VARCHAR(50) NOT NULL,
                            meta JSON,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_user_id (user_id),
                            INDEX idx_created_at (created_at)
                        )
                    `);
                    await db.execute(
                        'INSERT INTO xp_events (user_id, amount, source, meta) VALUES (?, ?, ?, ?)',
                        [userId, round2(rawGain), logActionType, JSON.stringify({ description: logDescription })]
                    );
                } catch (evtError) {
                    console.warn('Failed to log XP to xp_events:', evtError.message);
                }
            }
            
            console.log(`✅ XP updated for user ${userId}: ${adjustedXP} XP, Level ${adjustedLevel}`, updateResult);

            const leveledUp = adjustedLevel > previousLevel;

            if (db && typeof db.release === 'function') {
                db.release();
            } else if (db && typeof db.end === 'function') {
                await db.end();
            }

            if (leveledUp) {
                const row = userRows[0];
                const displayName = (
                    row.username ||
                    row.name ||
                    (row.email && String(row.email).split('@')[0]) ||
                    'User'
                ).toString();
                try {
                    await postLevelUpToLevelsChannel({
                        username: displayName,
                        newLevel: adjustedLevel,
                        senderIdFallback: userId
                    });
                } catch (e) {
                    console.warn('Level-up #levels post failed:', e.message);
                }
            }

            return res.status(200).json(jsonSafeDeep({
                success: true,
                message: 'XP and level updated successfully',
                xp: adjustedXP,
                level: adjustedLevel,
                leveledUp
            }));
        } catch (dbError) {
            console.error('❌ Database error updating XP:', dbError);
            console.error('Error details:', {
                message: dbError.message,
                code: dbError.code,
                errno: dbError.errno,
                sqlState: dbError.sqlState
            });
            
            // Release connection
            if (db && typeof db.release === 'function') {
                db.release();
            } else if (db && typeof db.end === 'function' && !db.ended) {
                await db.end();
            }
            
            return res.status(500).json({
                success: false,
                message: 'Failed to update XP and level',
                error: dbError.message
            });
        }
    } catch (error) {
        console.error('Error updating XP:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
