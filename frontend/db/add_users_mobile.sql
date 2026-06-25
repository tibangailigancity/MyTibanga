-- Add mobile_number column to users table for SMS notifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number TEXT DEFAULT '';
