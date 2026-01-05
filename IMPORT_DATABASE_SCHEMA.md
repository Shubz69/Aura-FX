# How to Import Database Schema into Railway MySQL

## Step 1: Open MySQL Workbench
1. Open MySQL Workbench
2. Connect to your "AURA FX Railway MySQL" connection (the one you just set up)

## Step 2: Open the SQL File
1. In MySQL Workbench, go to **File** → **Open SQL Script**
2. Navigate to your project folder: `C:\Users\1230s\OneDrive\Documents\Samy\Aura FX`
3. Select the file: `database_schema.sql`
4. Click **Open**

## Step 3: Select the Database
1. In the SQL editor, make sure you're using the `railway` database
2. You should see `USE railway;` at the top of the file
3. If not, you can manually select the database from the dropdown in MySQL Workbench

## Step 4: Execute the Script
1. **IMPORTANT:** Make sure you select and run the ENTIRE file from top to bottom
2. The script must run in order:
   - First: All CREATE TABLE statements
   - Then: All INSERT statements
3. Click the **Execute** button (lightning bolt icon) in the toolbar
4. Or press **Ctrl+Shift+Enter**
5. Wait for the script to complete

**If you get an error about a table not existing:**
- Make sure you ran the entire `database_schema.sql` file from the beginning
- Or run `create_tables_only.sql` first, then run the rest

## Step 5: Verify Tables Were Created
1. In the Navigator panel (left side), expand the `railway` schema
2. Expand **Tables**
3. You should see these tables:
   - ✅ `users` - Stores all user accounts and login info
   - ✅ `contact_messages` - Stores all contact form submissions
   - ✅ `courses` - Stores trading courses
   - ✅ `user_courses` - Tracks course purchases
   - ✅ `channels` - Community channels
   - ✅ `messages` - Community messages
   - ✅ `mfa_codes` - MFA verification codes
   - ✅ `reset_codes` - Password reset codes
   - ✅ `signup_verification_codes` - Email verification codes
   - ✅ `leaderboard` - Trading performance leaderboard

## What This Schema Includes:

### 🔐 Authentication & Users
- **users** table: All user accounts with login credentials, profile info, subscription status
- **mfa_codes**: Multi-factor authentication codes
- **reset_codes**: Password reset verification codes
- **signup_verification_codes**: Email verification for new signups

### 📧 Contact Forms
- **contact_messages** table: All contact form submissions with name, email, subject, message, and read status

### 📚 Courses
- **courses** table: All trading courses
- **user_courses** table: Tracks which courses each user has purchased

### 💬 Community
- **channels** table: Community channels
- **messages** table: All community messages

### 🏆 Leaderboard
- **leaderboard** table: User trading performance data

## Important Notes:

1. **All login attempts** are tracked via the `users` table (the `last_seen` field is updated on each login)

2. **All contact form submissions** are stored in the `contact_messages` table with:
   - Name
   - Email
   - Subject (optional)
   - Message
   - Read status (to track if admin has read it)
   - Timestamp

3. **All tables have proper indexes** for fast queries

4. **Foreign keys** ensure data integrity (e.g., if a user is deleted, their courses and messages are handled properly)

5. **Default channels** are automatically created:
   - "welcome" channel
   - "announcements" channel

## Troubleshooting:

If you get errors:
- Make sure you're connected to the Railway database
- Make sure you're using the `railway` database (check the dropdown)
- If tables already exist, the script uses `CREATE TABLE IF NOT EXISTS` so it won't fail
- Check the Output panel at the bottom for any error messages

## Next Steps:

After importing the schema:
1. ✅ Your database is ready for the AURA FX website
2. ✅ Users can register and login (stored in `users` table)
3. ✅ Contact forms will be saved (stored in `contact_messages` table)
4. ✅ All other features will work with the proper tables in place

