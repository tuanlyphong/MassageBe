-- database_schema.sql
-- Complete PostgreSQL Database Schema for Massage App

-- Drop existing tables
DROP TABLE IF EXISTS preferences CASCADE;
DROP TABLE IF EXISTS massage_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    age INTEGER,
    weight DECIMAL(5,2),
    height DECIMAL(5,2),
    gender VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Massage sessions table
CREATE TABLE massage_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level >= 0 AND level <= 5),
    duration INTEGER NOT NULL,
    heat_enabled BOOLEAN DEFAULT FALSE,
    rotate_enabled BOOLEAN DEFAULT FALSE,
    calories_burned INTEGER DEFAULT 0,
    notes TEXT,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Preferences table
CREATE TABLE preferences (
    preference_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE UNIQUE,
    favorite_level INTEGER DEFAULT 3,
    default_duration INTEGER DEFAULT 15,
    enable_heat_by_default BOOLEAN DEFAULT FALSE,
    enable_notifications BOOLEAN DEFAULT TRUE,
    notification_time VARCHAR(5) DEFAULT '20:00',
    theme VARCHAR(10) DEFAULT 'light',
    language VARCHAR(5) DEFAULT 'vi',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_user_id ON massage_sessions(user_id);
CREATE INDEX idx_sessions_started_at ON massage_sessions(started_at);
CREATE INDEX idx_preferences_user_id ON preferences(user_id);


-- Grant permissions (adjust username as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_username;
