/**
 * Idempotent MySQL migration: normalize subscription role/plan strings.
 * Maps: free→access, premium→pro, a7fx→elite (canonical stored values).
 * Safe to run multiple times — only updates rows that still hold legacy values.
 *
 * Usage: MYSQL_* env vars set, then:
 *   node scripts/migrate-subscription-names.js
 */

const mysql = require('mysql2/promise');

async function main() {
  const cfg = {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQL_USER || process.env.DB_USER,
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME,
    multipleStatements: false
  };
  if (!cfg.user || !cfg.database) {
    console.error('Missing MYSQL_USER / MYSQL_DATABASE (or DB_*) in environment.');
    process.exit(1);
  }

  const conn = await mysql.createConnection(cfg);
  try {
    const [r1] = await conn.execute(
      `UPDATE users SET role = 'access' WHERE LOWER(TRIM(role)) = 'free'`
    );
    const [r2] = await conn.execute(
      `UPDATE users SET role = 'pro' WHERE LOWER(TRIM(role)) = 'premium'`
    );
    const [r3] = await conn.execute(
      `UPDATE users SET role = 'elite' WHERE LOWER(TRIM(role)) IN ('a7fx')`
    );
    const [r4] = await conn.execute(
      `UPDATE users SET subscription_plan = 'access' WHERE LOWER(TRIM(subscription_plan)) = 'free'`
    );
    const [r5] = await conn.execute(
      `UPDATE users SET subscription_plan = 'pro' WHERE LOWER(TRIM(subscription_plan)) IN ('aura','premium')`
    );
    const [r6] = await conn.execute(
      `UPDATE users SET subscription_plan = 'elite' WHERE LOWER(TRIM(subscription_plan)) = 'a7fx'`
    );
    const [r6b] = await conn.execute(
      `UPDATE users SET role = 'pro' WHERE LOWER(TRIM(role)) = 'aura'`
    );
    let downgrade_free = 0;
    let downgrade_aura = 0;
    let downgrade_a7fx = 0;
    try {
      const [d1] = await conn.execute(
        `UPDATE users SET downgrade_to_plan = 'access' WHERE LOWER(TRIM(COALESCE(downgrade_to_plan,''))) = 'free'`
      );
      downgrade_free = d1.affectedRows;
      const [d2] = await conn.execute(
        `UPDATE users SET downgrade_to_plan = 'pro' WHERE LOWER(TRIM(COALESCE(downgrade_to_plan,''))) IN ('aura','premium')`
      );
      downgrade_aura = d2.affectedRows;
      const [d3] = await conn.execute(
        `UPDATE users SET downgrade_to_plan = 'elite' WHERE LOWER(TRIM(COALESCE(downgrade_to_plan,''))) = 'a7fx'`
      );
      downgrade_a7fx = d3.affectedRows;
    } catch (e) {
      console.warn('migrate-subscription-names: downgrade_to_plan column skipped:', e.message);
    }
    console.log('migrate-subscription-names:', {
      role_free_to_access: r1.affectedRows,
      role_premium_to_pro: r2.affectedRows,
      role_a7fx_to_elite: r3.affectedRows,
      role_aura_to_pro: r6b.affectedRows,
      plan_free_to_access: r4.affectedRows,
      plan_aura_premium_to_pro: r5.affectedRows,
      plan_a7fx_to_elite: r6.affectedRows,
      downgrade_to_plan_free_to_access: downgrade_free,
      downgrade_to_plan_aura_premium_to_pro: downgrade_aura,
      downgrade_to_plan_a7fx_to_elite: downgrade_a7fx
    });
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
