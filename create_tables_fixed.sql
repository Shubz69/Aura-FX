-- AURA FX - Create All Tables (Fixed Version)
-- This script creates all tables in the correct order
-- Run this ENTIRE file from top to bottom

USE railway;

-- ============================================
-- STEP 1: CREATE BASE TABLES (No Foreign Keys)
-- ============================================

-- USERS TABLE (Must be created first - other tables reference it)
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

-- CONTACT MESSAGES TABLE
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

-- COURSES TABLE (Must be created before user_courses)
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

-- CHANNELS TABLE (Must be created before messages)
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
-- STEP 2: CREATE TABLES WITH FOREIGN KEYS
-- ============================================

-- USER COURSES TABLE (References users and courses)
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

-- MESSAGES TABLE (References users and channels)
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

-- LEADERBOARD TABLE (References users)
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
-- STEP 3: CREATE CODE TABLES (No Foreign Keys)
-- ============================================

-- MFA CODES TABLE
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

-- PASSWORD RESET CODES TABLE
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

-- SIGNUP VERIFICATION CODES TABLE
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
-- STEP 4: INSERT DEFAULT DATA
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
-- VERIFICATION QUERY (Optional - run this to check)
-- ============================================
-- SELECT 'Tables created successfully!' AS status;
-- SHOW TABLES;

