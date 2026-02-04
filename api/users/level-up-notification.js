const { getDbConnection } = require('../db');

// Rank titles mapping (same as in xpSystem.js)
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
    980: 'Institutional God', 990: 'Supreme Trader', 1000: 'Aura FX Legend'
};

const getRankTitle = (level) => {
    if (level >= 1000) return TRADING_RANKS[1000];
    const milestones = Object.keys(TRADING_RANKS).map(Number).sort((a, b) => b - a);
    for (const milestone of milestones) {
        if (level >= milestone) {
            return TRADING_RANKS[milestone];
        }
    }
    return 'Trading Novice';
};

/**
 * API endpoint to handle level-up notifications
 * This creates a system message in the Levels channel when a user levels up (no asterisks in message).
 */
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { userId, oldLevel, newLevel, username } = req.body || {};
        
        if (!userId || !newLevel || !username) {
            return res.status(400).json({ 
                success: false, 
                message: 'userId, newLevel, and username are required' 
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
            // Get rank title for the new level
            const rankTitle = getRankTitle(newLevel);
            
            // Create level-up message (no asterisks – display as plain text; UI can style as needed)
            const levelUpMessage = `🎉 LEVEL UP! 🎉\n\n` +
                `${username} has reached Level ${newLevel}!\n\n` +
                `🏆 New Rank: ${rankTitle}\n\n` +
                `Congratulations on your progress! Keep trading and engaging to reach even higher levels! 🚀`;

            // Find or create levels channel (under announcements category)
            let [channels] = await db.execute(
                'SELECT id FROM channels WHERE id = ? OR name = ? LIMIT 1',
                ['levels', 'levels']
            );

            let channelId = 'levels';
            if (channels.length === 0) {
                try {
                    await db.execute(
                        `INSERT INTO channels (id, name, category, description, access_level) 
                         VALUES (?, ?, ?, ?, ?)`,
                        ['levels', 'levels', 'announcements', 'Level-up celebrations and progress.', 'open']
                    );
                } catch (createError) {
                    console.warn('Could not create levels channel:', createError.message);
                }
            } else {
                channelId = channels[0].id;
            }

            // Insert system message into messages table
            // Find an admin user to send as system message, or use a special system sender
            const [systemUsers] = await db.execute(
                'SELECT id FROM users WHERE role IN (?, ?) LIMIT 1',
                ['admin', 'super_admin']
            );
            
            let systemUserId = systemUsers.length > 0 ? systemUsers[0].id : userId;
            
            // Ensure messages table exists
            try {
                await db.execute(`
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
                console.warn('Messages table already exists or error creating:', tableError.message);
            }
            
            // Insert the level-up message
            await db.execute(
                `INSERT INTO messages (channel_id, sender_id, content, timestamp) 
                 VALUES (?, ?, ?, NOW())`,
                [channelId, systemUserId, levelUpMessage]
            );

            // Release connection
            if (db && typeof db.release === 'function') {
                db.release();
            } else if (db && typeof db.end === 'function') {
                await db.end();
            }

            console.log(`✅ Level-up notification sent for ${username} (Level ${newLevel})`);

            return res.status(200).json({
                success: true,
                message: 'Level-up notification sent successfully',
                channelId: channelId
            });
        } catch (dbError) {
            console.error('❌ Database error sending level-up notification:', dbError);
            
            // Release connection
            if (db && typeof db.release === 'function') {
                db.release();
            } else if (db && typeof db.end === 'function' && !db.ended) {
                await db.end();
            }
            
            return res.status(500).json({
                success: false,
                message: 'Failed to send level-up notification',
                error: dbError.message
            });
        }
    } catch (error) {
        console.error('Error sending level-up notification:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
