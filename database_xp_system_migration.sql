-- AURA FX XP System Database Migration
-- Run this to add XP logging and enhanced XP tracking

-- Add XP-related columns to users table if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS xp DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS level INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS login_streak INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_login_date DATE,
ADD COLUMN IF NOT EXISTS banner TEXT,
ADD COLUMN IF NOT EXISTS achievements JSON DEFAULT '[]';

-- Create XP logs table for tracking all XP transactions
CREATE TABLE IF NOT EXISTS xp_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    xp_amount DECIMAL(10, 2) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    INDEX idx_action_type (action_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create user ranks table for tracking rank achievements
CREATE TABLE IF NOT EXISTS user_ranks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    rank_level INT NOT NULL,
    rank_title VARCHAR(100) NOT NULL,
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_rank (user_id, rank_level),
    INDEX idx_user_id (user_id),
    INDEX idx_rank_level (rank_level),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create daily login tracking table
CREATE TABLE IF NOT EXISTS daily_logins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    login_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_date (user_id, login_date),
    INDEX idx_user_id (user_id),
    INDEX idx_login_date (login_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create journal entries table (for future journal XP rewards)
CREATE TABLE IF NOT EXISTS journal_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC);

-- Update existing users to have default values
UPDATE users 
SET xp = COALESCE(xp, 0),
    level = COALESCE(level, 1),
    login_streak = COALESCE(login_streak, 0),
    achievements = COALESCE(achievements, '[]')
WHERE xp IS NULL OR level IS NULL OR login_streak IS NULL OR achievements IS NULL;
