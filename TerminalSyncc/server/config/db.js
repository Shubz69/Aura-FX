import pkg from "pg";
const { Pool } = pkg;

import dotenv from "dotenv";
dotenv.config();

/* =====================================================
   DATABASE CONFIG
===================================================== */

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Required for cloud postgres providers
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,

  // Pool protection
  max: 10,                 // max clients
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/* =====================================================
   CONNECTION TEST
===================================================== */

(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL Connected");
    client.release();
  } catch (err) {
    console.error("❌ Database connection failed");
    console.error(err);
    process.exit(1); // stop server immediately
  }
})();

/* =====================================================
   GLOBAL ERROR LISTENER
===================================================== */

pool.on("error", (err) => {
  console.error("Unexpected DB error", err);
  process.exit(1);
});

export default pool;