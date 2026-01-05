# Create Admin User for AURA FX

## Step 1: Generate Password Hash

You need to generate a bcrypt hash for your admin password. You have two options:

### Option A: Use the Node.js Script (Recommended)

1. Open terminal/command prompt in your project folder
2. Run: `node generate_admin_password.js`
3. Enter your desired password when prompted
4. Copy the generated SQL statement

### Option B: Use Node.js Command Line

Run this command (replace `YourPassword123!` with your actual password):

```bash
node -e "const bcrypt=require('bcrypt');bcrypt.hash('YourPassword123!',10).then(h=>console.log('Hash:',h))"
```

Copy the hash that's printed.

## Step 2: Create Admin User in MySQL Workbench

1. Connect to your Railway MySQL database in MySQL Workbench
2. Make sure you're using the `railway` database
3. Open a new SQL tab
4. Paste and run this SQL (replace `YOUR_PASSWORD_HASH` with the hash from Step 1):

```sql
USE railway;

INSERT INTO users (username, email, password, name, avatar, role, muted, mfa_verified, dtype, subscription_status, created_at)
VALUES (
    'shubzfx',
    'shubzfx@gmail.com',
    'YOUR_PASSWORD_HASH',  -- Replace with hash from Step 1
    'Head Admin',
    '/avatars/avatar_ai.png',
    'ADMIN',
    FALSE,
    FALSE,
    'UserModel',
    'active',
    NOW()
)
ON DUPLICATE KEY UPDATE 
    role = 'ADMIN',
    subscription_status = 'active',
    password = 'YOUR_PASSWORD_HASH',  -- Replace with hash from Step 1
    name = 'Head Admin';
```

## Step 3: Verify Admin User

Run this query to verify the admin user was created:

```sql
SELECT id, username, email, role, subscription_status, created_at 
FROM users 
WHERE email = 'shubzfx@gmail.com';
```

You should see:
- username: `shubzfx`
- email: `shubzfx@gmail.com`
- role: `ADMIN`
- subscription_status: `active`

## Step 4: Login

After creating the admin user, you can log in to the website with:
- **Email:** shubzfx@gmail.com
- **Password:** (the password you used to generate the hash)

## Quick Start (If you want to use a temporary password)

If you want to quickly test, you can use this pre-generated hash for password `Admin123!`:

```sql
USE railway;

INSERT INTO users (username, email, password, name, avatar, role, muted, mfa_verified, dtype, subscription_status, created_at)
VALUES (
    'shubzfx',
    'shubzfx@gmail.com',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'Head Admin',
    '/avatars/avatar_ai.png',
    'ADMIN',
    FALSE,
    FALSE,
    'UserModel',
    'active',
    NOW()
)
ON DUPLICATE KEY UPDATE 
    role = 'ADMIN',
    subscription_status = 'active',
    password = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    name = 'Head Admin';
```

**Login with:**
- Email: shubzfx@gmail.com
- Password: Admin123!

⚠️ **IMPORTANT:** Change this password immediately after first login for security!

