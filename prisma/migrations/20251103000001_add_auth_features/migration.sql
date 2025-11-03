-- Migration: Add Authentication Features
-- Adds support for OAuth, email verification OTP, and password reset

-- Add OAuth provider fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider_id VARCHAR(255);

-- Add email verification OTP fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_otp VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP;

-- Add password reset fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- Update email_verified default to false for new users
-- Existing users keep their current value (assumed verified under old system)
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT false;

-- Update existing users to have email_verified = true
-- (assumes existing users are already verified)
UPDATE users SET email_verified = true
WHERE password_hash IS NOT NULL AND email_verified = false;

-- Create unique constraint for OAuth provider combination
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_provider_oauth_provider_id_key
ON users (oauth_provider, oauth_provider_id)
WHERE oauth_provider IS NOT NULL AND oauth_provider_id IS NOT NULL;

-- Create unique constraint for password reset token
CREATE UNIQUE INDEX IF NOT EXISTS users_password_reset_token_key
ON users (password_reset_token)
WHERE password_reset_token IS NOT NULL;

-- Create index for password reset token lookups
CREATE INDEX IF NOT EXISTS users_password_reset_token_idx
ON users (password_reset_token)
WHERE password_reset_token IS NOT NULL;
