-- AURA FX Database Schema
-- Complete database structure for AURA FX trading platform
-- Run this in MySQL Workbench after connecting to Railway MySQL

USE railway;

-- ============================================
-- USERS TABLE
-- ============================================
-- Stores all user accounts, login info, and profile data
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar VARCHAR(255) DEFAULT '/avatars/avatar_ai.png',
    role VARCHAR(50) DEFAULT 'USER',
    phone VARCHAR(50),
    address TEXT,
    muted BOOLEAN DEFAULT FALSE,
    mfa_verified BOOLEAN DEFAULT FALSE,
    dtype VARCHAR(50) DEFAULT 'UserModel',
    last_seen TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Subscription fields
    subscription_status VARCHAR(50) DEFAULT 'inactive',
    subscription_expiry DATETIME NULL,
    subscription_started DATETIME NULL,
    stripe_session_id VARCHAR(255) NULL,
    payment_failed BOOLEAN DEFAULT FALSE,
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_role (role),
    INDEX idx_subscription (subscription_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CONTACT MESSAGES TABLE
-- ============================================
-- Stores all contact form submissions
CREATE TABLE IF NOT EXISTS contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_read (read),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- COURSES TABLE
-- ============================================
-- Stores all trading courses
CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 0.00,
    image_url VARCHAR(500),
    video_url VARCHAR(500),
    duration VARCHAR(50),
    level VARCHAR(50),
    category VARCHAR(100),
    instructor VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USER COURSES TABLE
-- ============================================
-- Tracks which courses each user has purchased/accessed
CREATE TABLE IF NOT EXISTS user_courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_id INT NOT NULL,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_course (user_id, course_id),
    INDEX idx_user (user_id),
    INDEX idx_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CHANNELS TABLE
-- ============================================
-- Community channels for messaging
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

-- ============================================
-- MESSAGES TABLE
-- ============================================
-- Stores all community messages
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channel_id VARCHAR(255) NOT NULL,
    sender_id INT,
    content TEXT NOT NULL,
    encrypted BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_channel (channel_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_sender (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MFA CODES TABLE
-- ============================================
-- Stores multi-factor authentication codes
CREATE TABLE IF NOT EXISTS mfa_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_email (email),
    INDEX idx_code (code),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PASSWORD RESET CODES TABLE
-- ============================================
-- Stores password reset verification codes
CREATE TABLE IF NOT EXISTS reset_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_email (email),
    INDEX idx_code (code),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SIGNUP VERIFICATION CODES TABLE
-- ============================================
-- Stores email verification codes for new signups
CREATE TABLE IF NOT EXISTS signup_verification_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_code (code),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LEADERBOARD TABLE
-- ============================================
-- Stores user trading performance for leaderboard
CREATE TABLE IF NOT EXISTS leaderboard (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total_profit DECIMAL(15, 2) DEFAULT 0.00,
    total_trades INT DEFAULT 0,
    win_rate DECIMAL(5, 2) DEFAULT 0.00,
    best_trade DECIMAL(15, 2) DEFAULT 0.00,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_leaderboard (user_id),
    INDEX idx_profit (total_profit DESC),
    INDEX idx_win_rate (win_rate DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INSERT DEFAULT DATA
-- ============================================

-- Insert default welcome channel
INSERT INTO channels (id, name, display_name, category, description, access_level, is_system_channel, hidden)
VALUES ('welcome', 'welcome', 'Welcome', 'announcements', 'Welcome to AURA FX community!', 'open', TRUE, FALSE)
ON DUPLICATE KEY UPDATE name=name;

-- Insert default announcements channel
INSERT INTO channels (id, name, display_name, category, description, access_level, is_system_channel, hidden)
VALUES ('announcements', 'announcements', 'Announcements', 'announcements', 'Important announcements', 'read-only', TRUE, FALSE)
ON DUPLICATE KEY UPDATE name=name;

-- ============================================
-- NOTES
-- ============================================
-- This schema includes:
-- 1. Users table with login credentials and profile info
-- 2. Contact messages table to store all contact form submissions
-- 3. Courses table for trading courses
-- 4. User courses table to track course purchases
-- 5. Channels and messages for community features
-- 6. MFA, password reset, and signup verification code tables
-- 7. Leaderboard table for trading performance
--
-- All login attempts are tracked via the users table (last_seen updates)
-- All contact form submissions are stored in contact_messages table
-- All tables use proper indexes for performance
-- Foreign keys ensure data integrity

