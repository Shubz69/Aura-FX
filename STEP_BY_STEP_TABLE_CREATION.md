# Step-by-Step: Create All Database Tables

## IMPORTANT: You MUST run the ENTIRE file from top to bottom!

The error you're seeing means you're trying to INSERT data before the tables are created.

## Solution: Run the Complete File

1. **In MySQL Workbench:**
   - Make sure you're connected to "AURA FX Railway MySQL"
   - Open a NEW SQL tab (File → New Query Tab)
   - Go to File → Open SQL Script
   - Select `create_tables_fixed.sql`
   - **CRITICAL:** Select ALL the text in the file (Ctrl+A)
   - Click the **Execute** button (lightning bolt icon) or press Ctrl+Shift+Enter
   - Wait for it to complete

2. **What the file does (in order):**
   - ✅ Creates `users` table first
   - ✅ Creates `contact_messages` table
   - ✅ Creates `courses` table
   - ✅ Creates `channels` table (THIS MUST BE CREATED BEFORE INSERT!)
   - ✅ Creates `user_courses` table
   - ✅ Creates `messages` table
   - ✅ Creates `leaderboard` table
   - ✅ Creates `mfa_codes` table
   - ✅ Creates `reset_codes` table
   - ✅ Creates `signup_verification_codes` table
   - ✅ THEN inserts default channels

## If You Still Get Errors

### Check 1: Verify Tables Were Created
Run this query to see which tables exist:
```sql
USE railway;
SHOW TABLES;
```

You should see all 10 tables listed.

### Check 2: If Some Tables Are Missing
If you see some tables but not others, you can run just the missing CREATE TABLE statements.

For example, if `channels` is missing, run:
```sql
USE railway;

CREATE TABLE IF NOT EXISTS channels (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    category VARCHAR(100),
    description TEXT,
    access_level VARCHAR(50) DEFAULT 'open',
    is_system_channel BOOLEAN DEFAULT FALSE,
    hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_access (access_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Check 3: Drop and Start Fresh (If Needed)
If tables are partially created and causing conflicts:

```sql
USE railway;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS leaderboard;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS user_courses;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS signup_verification_codes;
DROP TABLE IF EXISTS reset_codes;
DROP TABLE IF EXISTS mfa_codes;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS contact_messages;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;
```

Then run `create_tables_fixed.sql` again from the beginning.

## After Tables Are Created Successfully

1. ✅ Verify all 10 tables exist (run `SHOW TABLES;`)
2. ✅ Create admin user (see `CREATE_ADMIN_USER.md`)
3. ✅ Login with shubzfx@gmail.com




