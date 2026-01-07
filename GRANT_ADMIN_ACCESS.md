# Grant Admin Access to shubzfx@gmail.com

## Quick Fix: Update Database

Run this SQL in MySQL Workbench (connected to your Railway database):

```sql
-- Update shubzfx@gmail.com to ADMIN role
UPDATE users 
SET role = 'ADMIN' 
WHERE email = 'shubzfx@gmail.com';

-- Verify the update
SELECT id, email, username, role 
FROM users 
WHERE email = 'shubzfx@gmail.com';
```

## After Running SQL

1. **Log out** from the website
2. **Log back in** with `shubzfx@gmail.com`
3. The admin access should now work

## What Was Fixed

- Updated `AdminMessages.js` to check for admin access more flexibly (handles both 'ADMIN' and 'admin' role formats)
- Added email-based admin check for `shubzfx@gmail.com` (same as AdminPanel)
- Created SQL script to update the database role

## If Still Not Working

If you still see "ACCESS DENIED" after updating the database and logging back in:

1. Check the user object in browser console:
   - Open DevTools (F12)
   - Go to Console tab
   - Type: `JSON.parse(localStorage.getItem('user'))`
   - Check the `role` field

2. If role is still not 'ADMIN', the database update didn't work. Check:
   - You're connected to the correct Railway database
   - The email is exactly `shubzfx@gmail.com` (case-sensitive)
   - The UPDATE query ran successfully

3. Clear browser cache and localStorage:
   - Open DevTools (F12)
   - Go to Application tab → Local Storage
   - Clear all items
   - Refresh page and log in again




