# AURA FX - Current Database Connection

## Database Details

**Database Type:** MySQL (Railway)

**Connection Information:**
- **Host:** `tramway.proxy.rlwy.net`
- **Port:** `49989`
- **Username:** `root`
- **Password:** `FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb`
- **Database Name:** `railway`
- **SSL Required:** Yes (`MYSQL_SSL=true`)

## Where Database is Configured

### 1. Vercel Environment Variables
The website connects to the database using these environment variables set in Vercel:

```
MYSQL_HOST=tramway.proxy.rlwy.net
MYSQL_PORT=49989
MYSQL_USER=root
MYSQL_PASSWORD=FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb
MYSQL_DATABASE=railway
MYSQL_SSL=true
```

**To Check/Update in Vercel:**
1. Go to https://vercel.com/dashboard
2. Select your "AURA FX" project
3. Go to **Settings** → **Environment Variables**
4. Look for the `MYSQL_*` variables listed above

### 2. Railway MySQL Service
The database is hosted on Railway:
- **Service Name:** MySQL (in Railway project)
- **Public URL:** `mysql://root:FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb@tramway.proxy.rlwy.net:49989/railway`

## How to Verify Database Connection

### Option 1: Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → **Deployments**
2. Click on the latest deployment
3. Go to **Functions** tab
4. Check any API endpoint logs for database connection errors

### Option 2: Test via MySQL Workbench
1. Open MySQL Workbench
2. Create new connection:
   - **Hostname:** `tramway.proxy.rlwy.net`
   - **Port:** `49989`
   - **Username:** `root`
   - **Password:** `FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb`
   - **Default Schema:** `railway`
3. Test connection - should connect successfully

### Option 3: Check API Response
Visit: `https://aura-fx-ten.vercel.app/api/admin/users`

If database is connected, you should see user data.
If not connected, you'll see an error or empty response.

## Common Issues

### Issue 1: Wrong Database
If you see data that doesn't match what you expect:
- Check if Vercel environment variables point to the correct Railway database
- Verify the database name is `railway` (not `theglitches` or another name)

### Issue 2: Missing Tables
If tables are missing:
- Connect via MySQL Workbench
- Check if tables exist: `SHOW TABLES;`
- If missing, import the schema from `create_tables_fixed.sql`

### Issue 3: Connection Errors
If you see "Database connection error":
- Verify all `MYSQL_*` variables are set in Vercel
- Check that `MYSQL_SSL=true` is set
- Ensure Railway MySQL service is running

## Database Schema Location

The database schema is defined in:
- `create_tables_fixed.sql` - Main schema file
- `database_schema.sql` - Alternative schema file

## Current Database Status

To check what's actually in the database:
1. Connect via MySQL Workbench
2. Run: `USE railway;`
3. Run: `SHOW TABLES;` - See all tables
4. Run: `SELECT COUNT(*) FROM users;` - Count users
5. Run: `SELECT COUNT(*) FROM channels;` - Count channels

---

## Scaling for 500+ Users (Why You See Connection Limits)

**The limit is your database’s max connections, not “one connection per user.”**

- **What uses connections:** Each *concurrent* API request that talks to the DB holds one connection for a short time (milliseconds). So 500 users might only create 30–100 concurrent requests at once (e.g. polling every 30s, page loads).
- **Where the cap comes from:** Railway’s MySQL has a **max_connections** setting. If the app opens more connections than that, you get “Too many connections.” The app uses a **pool** so it reuses connections instead of opening a new one per request.

**What we did in code:**
- All user/community APIs use one shared pool and release connections when done (no leaks).
- On Vercel we default to a small pool per instance (5 connections, queue 10) so many serverless instances don’t exceed your DB limit. You can increase this when your DB allows more.

**To support 500+ users:**

1. **Raise Railway’s MySQL max connections**  
   In Railway → your MySQL service → **Variables** (or **Settings**), add:
   - `MYSQL_CONFIG=max_connections=200`  
   Or use the short form: `MYSQL_CONFIG=mc=200`.  
   Then redeploy the MySQL service. (Default is often low; 100–200 is typical for this size.)

2. **Optionally increase the app pool size**  
   In Vercel → Project → **Settings** → **Environment Variables**, add (only after step 1):
   - `MYSQL_POOL_SIZE=10`  
   - `MYSQL_QUEUE_LIMIT=20`  
   This allows each serverless instance to use up to 10 connections. With e.g. 10 instances, that’s up to 100 connections, so `max_connections=200` is safe.

3. **Keep polling reasonable**  
   Community/user polling is already throttled (e.g. 30s for user, 2–5s for messages). That keeps concurrent requests (and thus connections) manageable even with many users.

**Summary:** Limit issues happen when *concurrent* connections exceed the DB’s **max_connections**. Fix: (1) raise `max_connections` on Railway, (2) optionally set `MYSQL_POOL_SIZE` in Vercel, (3) keep using the shared pool (already in place). Then 500+ users can be supported without connection errors.





