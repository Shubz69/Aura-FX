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



