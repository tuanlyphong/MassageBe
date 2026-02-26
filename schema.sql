-- Massage Device App - Database Schema
-- PostgreSQL Database Schema for Massage Device App
-- Created: 2024
-- Database: massage_device_db

-- ============================================================================
-- DROP EXISTING TABLES (if recreating)
-- ============================================================================
-- Uncomment these if you need to recreate the database
-- DROP TABLE IF EXISTS massage_sessions CASCADE;
-- DROP TABLE IF EXISTS preferences CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- TABLE: users
-- ============================================================================
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    age INT CHECK (age >= 0 AND age <= 150),
    weight DECIMAL(5,2) CHECK (weight >= 0),
    height DECIMAL(5,2) CHECK (height >= 0),
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- TABLE: massage_sessions
-- ============================================================================
CREATE TABLE massage_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    level INT NOT NULL CHECK (level >= 1 AND level <= 10),
    duration INT NOT NULL CHECK (duration > 0),
    heat_enabled BOOLEAN DEFAULT FALSE,
    rotate_enabled BOOLEAN DEFAULT FALSE,
    calories_burned INT DEFAULT 0 CHECK (calories_burned >= 0),
    notes TEXT,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_session_time CHECK (ended_at > started_at)
);

-- ============================================================================
-- TABLE: preferences
-- ============================================================================
CREATE TABLE preferences (
    preference_id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    favorite_level INT DEFAULT 3 CHECK (favorite_level >= 1 AND favorite_level <= 10),
    default_duration INT DEFAULT 15 CHECK (default_duration > 0),
    enable_heat_by_default BOOLEAN DEFAULT FALSE,
    enable_notifications BOOLEAN DEFAULT TRUE,
    notification_time TIME DEFAULT '20:00:00',
    theme VARCHAR(20) DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
    language VARCHAR(10) DEFAULT 'vi' CHECK (language IN ('vi', 'en', 'zh', 'ja', 'ko')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

-- Users table indexes
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);

-- Massage sessions table indexes
CREATE INDEX idx_sessions_user_id ON massage_sessions(user_id);
CREATE INDEX idx_sessions_started_at ON massage_sessions(started_at DESC);
CREATE INDEX idx_sessions_user_started ON massage_sessions(user_id, started_at DESC);

-- Preferences table indexes
CREATE INDEX idx_preferences_user_id ON preferences(user_id);

-- ============================================================================
-- FUNCTIONS for Auto-updating timestamps
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_preferences_updated_at
    BEFORE UPDATE ON preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA for Testing (Optional)
-- ============================================================================

-- Insert a test user (you can remove this in production)
-- INSERT INTO users (firebase_uid, email, name, age, weight, height, gender)
-- VALUES 
--     ('test-firebase-uid-123', 'test@example.com', 'Test User', 30, 70.5, 175.0, 'male');

-- Insert sample preferences for test user
-- INSERT INTO preferences (user_id, favorite_level, default_duration, enable_heat_by_default)
-- SELECT user_id, 5, 20, true 
-- FROM users 
-- WHERE email = 'test@example.com';

-- Insert sample massage sessions for test user
-- INSERT INTO massage_sessions (user_id, level, duration, heat_enabled, rotate_enabled, calories_burned, started_at, ended_at)
-- SELECT 
--     user_id, 
--     5, 
--     15, 
--     true, 
--     false, 
--     120,
--     NOW() - INTERVAL '1 day',
--     NOW() - INTERVAL '1 day' + INTERVAL '15 minutes'
-- FROM users 
-- WHERE email = 'test@example.com';

-- ============================================================================
-- VIEWS for Common Queries (Optional but Recommended)
-- ============================================================================

-- View: User statistics summary
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
    u.user_id,
    u.name,
    u.email,
    COUNT(s.session_id) as total_sessions,
    COALESCE(SUM(s.duration), 0) as total_minutes,
    COALESCE(SUM(s.calories_burned), 0) as total_calories,
    COALESCE(AVG(s.level), 0) as avg_level,
    COALESCE(
        SUM(CASE WHEN s.heat_enabled THEN 1 ELSE 0 END)::FLOAT / 
        NULLIF(COUNT(s.session_id), 0) * 100, 
        0
    ) as heat_usage_percent
FROM users u
LEFT JOIN massage_sessions s ON u.user_id = s.user_id
GROUP BY u.user_id, u.name, u.email;

-- View: Recent sessions (last 30 days)
CREATE OR REPLACE VIEW recent_sessions AS
SELECT 
    s.*,
    u.name as user_name,
    u.email as user_email
FROM massage_sessions s
JOIN users u ON s.user_id = u.user_id
WHERE s.started_at >= NOW() - INTERVAL '30 days'
ORDER BY s.started_at DESC;

-- ============================================================================
-- GRANT PERMISSIONS (adjust username as needed)
-- ============================================================================

-- If you have a specific database user, grant permissions like this:
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_db_user;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these to verify the schema was created correctly:
/*
-- Check tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Check constraints
SELECT conname, conrelid::regclass AS table_name, contype
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text;

-- Test insert (should work)
-- INSERT INTO users (firebase_uid, email, name) 
-- VALUES ('test-uid', 'test@test.com', 'Test');

-- Test select (should return empty or test data)
-- SELECT * FROM users;
*/

-- ============================================================================
-- NOTES
-- ============================================================================
/*
1. This schema includes proper constraints to ensure data integrity
2. Indexes are created for common query patterns
3. Auto-updating timestamps are implemented via triggers
4. Foreign key cascading deletes ensure referential integrity
5. Views are provided for common analytics queries

DEPLOYMENT STEPS:
1. Create PostgreSQL database: 
   createdb massage_device_db
   
2. Run this schema:
   psql massage_device_db < schema.sql
   
3. Verify tables were created:
   psql massage_device_db -c "\dt"
   
4. Update .env file with database credentials

5. Test connection from backend:
   curl http://localhost:3000/api/db-test
*/
