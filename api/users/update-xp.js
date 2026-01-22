const { getDbConnection } = require('../db');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const { userId, xp, level } = req.body || {};
        
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
                } catch (e2) {}
                try {
                    await db.execute('ALTER TABLE users ADD COLUMN level INT DEFAULT 1');
                } catch (e2) {}
            }

            // Update user XP and level
            await db.execute(
                'UPDATE users SET xp = ?, level = ? WHERE id = ?',
                [parseFloat(xp), parseInt(level), userId]
            );

            await db.end();

            return res.status(200).json({
                success: true,
                message: 'XP and level updated successfully',
                xp: parseFloat(xp),
                level: parseInt(level)
            });
        } catch (dbError) {
            console.error('Database error updating XP:', dbError);
            if (db && !db.ended) await db.end();
            return res.status(500).json({
                success: false,
                message: 'Failed to update XP and level'
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
