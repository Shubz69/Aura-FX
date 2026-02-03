-- AURA FX Community Production Migration
-- Run this on your MySQL database (Railway/FreeSQL/etc.)
-- If a column already exists, that statement will fail - skip it and continue.

-- 1. Add onboarding columns to users
ALTER TABLE users ADD COLUMN onboarding_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN onboarding_accepted_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN onboarding_subscription_snapshot VARCHAR(50) NULL;

-- 2. Ensure permission_type exists on channels (for read-only Welcome)
ALTER TABLE channels ADD COLUMN permission_type VARCHAR(50) DEFAULT 'read-write';

-- 3. Ensure Welcome channel exists (read-only for everyone except Admin)
INSERT INTO channels (id, name, category, description, access_level, permission_type)
VALUES (
  'welcome',
  'welcome',
  'general',
  'Welcome to AURA FX Community. Read the rules and click the checkmark below to unlock your channels.',
  'open',
  'read-only'
) ON DUPLICATE KEY UPDATE 
  permission_type = 'read-only',
  description = 'Welcome to AURA FX Community. Read the rules and click the checkmark below to unlock your channels.';
