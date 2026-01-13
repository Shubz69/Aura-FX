# Database Connection Pool Migration Example

## How to Update Your API Files

### ❌ OLD WAY (Creates new connection every time - SLOW):
```javascript
// api/example.js - OLD CODE
const mysql = require('mysql2/promise');

const getDbConnection = async () => {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
  return connection;
};

module.exports = async (req, res) => {
  const db = await getDbConnection();
  if (!db) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM users');
    await db.end(); // Must close connection
    return res.json(rows);
  } catch (error) {
    await db.end(); // Must close connection
    return res.status(500).json({ error: error.message });
  }
};
```

### ✅ NEW WAY (Uses connection pool - FAST):
```javascript
// api/example.js - NEW CODE
const { getDbConnection } = require('./db');

module.exports = async (req, res) => {
  const connection = await getDbConnection();
  if (!connection) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  try {
    const [rows] = await connection.execute('SELECT * FROM users');
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  } finally {
    // IMPORTANT: Always release the connection back to the pool
    connection.release();
  }
};
```

## Key Changes:

1. **Remove** `const mysql = require('mysql2/promise');`
2. **Remove** the `getDbConnection` function (use shared one from `./db`)
3. **Add** `const { getDbConnection } = require('./db');` at the top
4. **Remove** `await db.end()` calls (don't close pooled connections)
5. **Add** `connection.release()` in a `finally` block

## Files That Need Updating:

1. `api/admin/index.js`
2. `api/auth/login.js`
3. `api/auth/register.js`
4. `api/auth/mfa.js`
5. `api/auth/password-reset.js`
6. `api/auth/signup-verification.js`
7. `api/community/channels.js`
8. `api/community/channels/messages.js`
9. `api/community/index.js`
10. `api/courses.js`
11. `api/leaderboard.js`
12. `api/messages/threads.js`
13. `api/stripe/index.js`
14. `api/users/update.js`

## Quick Migration Checklist:

For each file:
- [ ] Remove local `getDbConnection` function
- [ ] Add `const { getDbConnection } = require('./db');`
- [ ] Replace `await db.end()` with `connection.release()` in finally block
- [ ] Test the endpoint still works
- [ ] Commit changes

## Performance Impact:

- **Before:** Each request = new connection (50-200ms overhead)
- **After:** Each request = reused connection (1-5ms overhead)
- **Improvement:** 10-50x faster database operations
