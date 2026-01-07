-- Update shubzfx@gmail.com to ADMIN role
-- Run this in MySQL Workbench connected to your Railway database

UPDATE users 
SET role = 'ADMIN' 
WHERE email = 'shubzfx@gmail.com';

-- Verify the update
SELECT id, email, username, role 
FROM users 
WHERE email = 'shubzfx@gmail.com';




