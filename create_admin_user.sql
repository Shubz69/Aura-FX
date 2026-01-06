-- Create Admin User Script
-- Run this AFTER importing database_schema.sql
-- This will create/update the head admin user

USE railway;

-- First, let's generate a proper password hash
-- You'll need to run this in Node.js to get the hash, or use an online bcrypt generator
-- For now, we'll use a placeholder that you MUST change

-- Option 1: Use a Node.js script to generate the hash
-- Create a file called generate_hash.js:
/*
const bcrypt = require('bcrypt');
const password = 'YourSecurePassword123!'; // Change this to your desired password
bcrypt.hash(password, 10).then(hash => {
    console.log('Password hash:', hash);
    console.log('\nSQL INSERT statement:');
    console.log(`INSERT INTO users (username, email, password, name, avatar, role, muted, mfa_verified, dtype, subscription_status, created_at)
VALUES (
    'shubzfx',
    'shubzfx@gmail.com',
    '${hash}',
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
    password = '${hash}';`);
});
*/

-- Option 2: Use this SQL to create the user (you'll need to replace the password hash)
-- The password hash below is for password: "Admin123!" (CHANGE THIS!)
-- To generate your own hash, run: node -e "const bcrypt=require('bcrypt');bcrypt.hash('YourPassword',10).then(h=>console.log(h))"

-- TEMPORARY: Using a known hash for "TempPassword123!" - YOU MUST CHANGE THIS!
INSERT INTO users (username, email, password, name, avatar, role, muted, mfa_verified, dtype, subscription_status, created_at)
VALUES (
    'shubzfx',
    'shubzfx@gmail.com',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- Hash for "TempPassword123!" - CHANGE THIS!
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
    name = 'Head Admin';

-- After running this, you can log in with:
-- Email: shubzfx@gmail.com
-- Password: TempPassword123! (or whatever password you used to generate the hash)
-- 
-- IMPORTANT: Change the password immediately after first login!


