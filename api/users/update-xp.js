const { getDbConnection } = require('../db');
const { jsonNumber, jsonSafeDeep } = require('../utils/jsonSafe');

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
                    await db.execute('ALTER TABLE users ADD COLUMN xp DECIMAL(10, 2) DEFAULT 0');
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
                        xp_amount DECIMAL(10, 2) NOT NULL,
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

            // Get previous XP to calculate gain
            const [userRows] = await db.execute('SELECT xp FROM users WHERE id = ?', [userId]);
            const previousXP = userRows.length > 0 ? num(userRows[0].xp, 0) : 0;
            let rawGain = num(xp, 0) - previousXP;
            const PLAYER_XP_MULT = Number(process.env.XP_PLAYER_GAIN_MULT || 0.55);
            let adjustedXP = num(xp, 0);
            let adjustedLevel = jsonNumber(level, 1);
            if (rawGain > 0 && PLAYER_XP_MULT > 0 && PLAYER_XP_MULT < 1) {
                const scaledGain = Math.round(rawGain * PLAYER_XP_MULT * 100) / 100;
                adjustedXP = Math.max(0, previousXP + scaledGain);
                const getLevelFromXP = (x) => {
                    if (x <= 0) return 1;
                    if (x >= 1000000) return 1000;
                    if (x < 500) return Math.floor(Math.sqrt(x / 50)) + 1;
                    if (x < 5000) return 10 + Math.floor(Math.sqrt((x - 500) / 100)) + 1;
                    if (x < 20000) return 50 + Math.floor(Math.sqrt((x - 5000) / 200)) + 1;
                    if (x < 100000) return 100 + Math.floor(Math.sqrt((x - 20000) / 500)) + 1;
                    if (x < 500000) return 200 + Math.floor(Math.sqrt((x - 100000) / 1000)) + 1;
                    return Math.min(1000, 500 + Math.floor(Math.sqrt((x - 500000) / 2000)) + 1);
                };
                adjustedLevel = getLevelFromXP(adjustedXP);
                rawGain = scaledGain;
            }

            // Update user XP and level
            const [updateResult] = await db.execute(
                'UPDATE users SET xp = ?, level = ? WHERE id = ?',
                [adjustedXP, adjustedLevel, userId]
            );
            
            // Log XP transaction if there was a gain
            if (rawGain > 0) {
                const logActionType = actionType || 'system_update';
                const logDescription = description || `XP updated from ${previousXP} to ${adjustedXP}`;
                
                // Log to xp_logs (legacy)
                try {
                    await db.execute(
                        'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
                        [userId, rawGain, logActionType, logDescription]
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
                            amount DECIMAL(10, 2) NOT NULL,
                            source VARCHAR(50) NOT NULL,
                            meta JSON,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_user_id (user_id),
                            INDEX idx_created_at (created_at)
                        )
                    `);
                    await db.execute(
                        'INSERT INTO xp_events (user_id, amount, source, meta) VALUES (?, ?, ?, ?)',
                        [userId, rawGain, logActionType, JSON.stringify({ description: logDescription })]
                    );
                } catch (evtError) {
                    console.warn('Failed to log XP to xp_events:', evtError.message);
                }
            }
            
            console.log(`✅ XP updated for user ${userId}: ${adjustedXP} XP, Level ${adjustedLevel}`, updateResult);

            // Release connection (don't use db.end() if using pool)
            if (db && typeof db.release === 'function') {
                db.release();
            } else if (db && typeof db.end === 'function') {
                await db.end();
            }

            return res.status(200).json(jsonSafeDeep({
                success: true,
                message: 'XP and level updated successfully',
                xp: adjustedXP,
                level: adjustedLevel
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
