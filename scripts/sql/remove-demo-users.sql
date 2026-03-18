-- One-time cleanup: remove seeded demo accounts (@aurafx.demo / is_demo).
-- Prefer production purge: POST /api/seed/demo-leaderboard with Bearer CRON_SECRET
-- (runs purgeDemoUsers). Use this script only if you need raw SQL on the DB.

-- 1) Collect demo user ids (inspect first):
-- SELECT id, email, username FROM users WHERE is_demo = 1 OR email LIKE '%@aurafx.demo';

-- 2) Delete dependent rows then users (adjust table list if your schema differs):
/*
DELETE FROM xp_events WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1 OR email LIKE '%@aurafx.demo');
DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE is_demo = 1 OR email LIKE '%@aurafx.demo');
DELETE FROM users WHERE is_demo = 1 OR email LIKE '%@aurafx.demo';
*/
