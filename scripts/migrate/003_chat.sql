-- Chat Module Database Schema
-- Phase 0.3: Real-Time Chat Module

-- Chat rooms table
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_private BOOLEAN DEFAULT false,
    max_participants INTEGER DEFAULT 100
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'file', 'system'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edited_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN DEFAULT false,
    reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL
);

-- Chat room participants table (for private rooms and permissions)
CREATE TABLE IF NOT EXISTS chat_room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role VARCHAR(50) DEFAULT 'member', -- 'admin', 'moderator', 'member'
    is_active BOOLEAN DEFAULT true,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- Online users tracking table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    socket_id VARCHAR(255) NOT NULL,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(socket_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_room_participants_room_id ON chat_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_participants_user_id ON chat_room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_socket_id ON user_sessions(socket_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_chat_rooms_updated_at BEFORE UPDATE ON chat_rooms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON chat_messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create default general chat room
INSERT INTO chat_rooms (name, description, created_by, is_private) 
SELECT 'General', 'Welcome to E C Project Launchpad! This is the main chat room for everyone.', id, false
FROM users 
WHERE email = 'system@e-c-project-launchpad.com'
ON CONFLICT DO NOTHING;

-- If no system user exists, create one
INSERT INTO users (email, password_hash, created_at)
SELECT 'system@e-c-project-launchpad.com', '$2b$12$dummy.hash.for.system.user', NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'system@e-c-project-launchpad.com');

-- Create default general room with system user
INSERT INTO chat_rooms (name, description, created_by, is_private)
SELECT 'General', 'Welcome to E C Project Launchpad! This is the main chat room for everyone.', 
       (SELECT id FROM users WHERE email = 'system@e-c-project-launchpad.com'), false
WHERE NOT EXISTS (SELECT 1 FROM chat_rooms WHERE name = 'General');

-- Function to clean up inactive sessions
CREATE OR REPLACE FUNCTION cleanup_inactive_sessions()
RETURNS void AS $$
BEGIN
    UPDATE user_sessions 
    SET is_active = false 
    WHERE last_activity < NOW() - INTERVAL '1 hour' 
    AND is_active = true;
END;
$$ LANGUAGE plpgsql;
