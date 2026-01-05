# Railway MySQL Database Setup Guide for AURA FX

This guide will help you set up a new MySQL database on Railway for AURA FX, separate from the existing "theglitches" database.

## Step 1: Create a New MySQL Database on Railway

1. **Log in to Railway**
   - Go to https://railway.app
   - Sign in with your account

2. **Create a New Project**
   - Click "New Project"
   - Select "Empty Project" or "Deploy from GitHub repo" (if you want to link your repo)
   - Name it "AURA FX" or "aura-fx"

3. **Add MySQL Service**
   - Click "+ New" in your project
   - Select "Database" → "Add MySQL"
   - Railway will automatically provision a MySQL database

4. **Get Database Connection Details**
   - Click on the MySQL service you just created
   - Go to the "Variables" tab
   - You'll see the following environment variables:
     - `MYSQL_PUBLIC_URL` - Contains the public hostname and port (e.g., `mysql://root:password@tramway.proxy.rlwy.net:49989/railway`)
     - `MYSQL_ROOT_PASSWORD` - The database password
     - `MYSQL_DATABASE` - Database name (usually `railway`)
     - `MYSQL_USER` - Username (usually `root`)
   
   **For your current setup, use these values:**
   - Hostname: `tramway.proxy.rlwy.net` (extracted from MYSQL_PUBLIC_URL)
   - Port: `49989` (extracted from MYSQL_PUBLIC_URL)
   - Username: `root`
   - Password: `FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb`
   - Database: `railway`

## Step 2: Configure MySQL Workbench Connection

1. **Open MySQL Workbench**
   - Launch MySQL Workbench on your computer

2. **Create New Connection**
   - Click the "+" icon to create a new connection
   - Enter the following details:
     - **Connection Name**: `AURA FX Railway MySQL`
     - **Hostname**: `tramway.proxy.rlwy.net` (from MYSQL_PUBLIC_URL)
     - **Port**: `49989` (from MYSQL_PUBLIC_URL)
     - **Username**: `root`
     - **Password**: `FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb` (click "Store in Keychain")
     - **Default Schema**: `railway`

3. **Test Connection**
   - Click "Test Connection"
   - If successful, click "OK" to save

## Step 3: Set Up Environment Variables in Railway

You need to add these environment variables to your **Vercel project** (where your frontend/API is deployed):

### For Vercel Deployment:

1. **Go to Vercel Dashboard**
   - Navigate to your project: https://vercel.com/dashboard
   - Select your AURA FX project

2. **Add Environment Variables**
   - Go to "Settings" → "Environment Variables"
   - Add the following variables (use the values from Railway MySQL service):

   ```
   MYSQL_HOST=tramway.proxy.rlwy.net
   MYSQL_PORT=49989
   MYSQL_USER=root
   MYSQL_PASSWORD=FGcoKdqpUYWNb1nXzdGmBUACzeYDmewb
   MYSQL_DATABASE=railway
   MYSQL_SSL=true
   ```

   **Important Notes:**
   - Replace `<your-railway-mysql-host>` with the actual hostname from Railway
   - Replace `<your-railway-mysql-password>` with the actual password from Railway
   - Set `MYSQL_SSL=true` for Railway connections (Railway requires SSL)

3. **Redeploy**
   - After adding variables, go to "Deployments"
   - Click "Redeploy" on the latest deployment to apply the new environment variables

## Step 4: Import Database Schema (if needed)

If you have existing SQL files to import:

1. **Connect via MySQL Workbench**
   - Open the connection you created in Step 2
   - Double-click to connect

2. **Import SQL Files**
   - Go to "Server" → "Data Import"
   - Select "Import from Self-Contained File"
   - Choose your SQL file(s)
   - Select the target database (usually `railway`)
   - Click "Start Import"

   **OR use command line:**
   ```bash
   mysql -h <MYSQL_HOST> -P <MYSQL_PORT> -u <MYSQL_USER> -p<MYSQL_PASSWORD> <MYSQL_DATABASE> < your_schema.sql
   ```

## Step 5: Update Database Connection in Code

The code already uses environment variables, so once you set them in Vercel, the API endpoints will automatically connect to the new database. The following API files use the database:

- `api/courses.js`
- `api/auth/login.js`
- `api/auth/register.js`
- `api/auth/password-reset.js`
- `api/auth/mfa.js`
- `api/stripe/index.js`
- `api/admin/index.js`
- `api/community/channels.js`
- `api/community/channels/messages.js`
- `api/leaderboard.js`

All of these files use the `getDbConnection()` function which reads from environment variables:
- `MYSQL_HOST`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_PORT`
- `MYSQL_SSL`

## Step 6: Verify Connection

1. **Test API Endpoints**
   - After redeploying on Vercel, test an API endpoint that uses the database
   - For example: `https://your-domain.com/api/courses`
   - Check the Vercel function logs to see if the connection is successful

2. **Check Railway Logs**
   - In Railway, go to your MySQL service
   - Check the "Logs" tab to see connection attempts

3. **Test in MySQL Workbench**
   - Run a simple query: `SELECT DATABASE();`
   - Should return your database name

## Troubleshooting

### Connection Refused
- Verify `MYSQL_HOST` and `MYSQL_PORT` are correct
- Check that Railway MySQL service is running
- Ensure `MYSQL_SSL=true` is set

### Authentication Failed
- Double-check `MYSQL_USER` and `MYSQL_PASSWORD`
- Verify password doesn't have special characters that need escaping
- Try resetting the password in Railway

### SSL Connection Error
- Ensure `MYSQL_SSL=true` is set in Vercel environment variables
- Railway requires SSL for external connections

### Database Not Found
- Verify `MYSQL_DATABASE` matches the database name in Railway
- Check that the database was created successfully

## Important Security Notes

1. **Never commit passwords to Git**
   - All database credentials are stored as environment variables
   - Never add `.env` files to your repository

2. **Use different databases for different projects**
   - This setup ensures AURA FX uses a completely separate database from "theglitches"
   - No data mixing between projects

3. **Backup regularly**
   - Railway provides automatic backups, but consider exporting your database periodically
   - Use MySQL Workbench to export: "Server" → "Data Export"

## Next Steps

After setting up the database:

1. ✅ All "The Glitch" references have been changed to "AURA FX" in the codebase
2. ✅ All domain references have been updated from `theglitch.world` to `aurafx.com`
3. ✅ Email addresses updated from `platform@theglitch.online` to `platform@aurafx.com`
4. ⏳ Set up Railway MySQL database (this guide)
5. ⏳ Configure Vercel environment variables
6. ⏳ Import database schema (if needed)
7. ⏳ Test all API endpoints

## Support

If you encounter issues:
- Check Railway service logs
- Check Vercel function logs
- Verify all environment variables are set correctly
- Test database connection in MySQL Workbench first

