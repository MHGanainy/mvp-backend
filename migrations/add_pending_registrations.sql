-- Migration: Add Pending Registrations Table
-- This fixes the registration flow so users are only created after OTP verification
-- Date: 2025-11-02

CREATE TABLE IF NOT EXISTS pending_registrations (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  user_type VARCHAR(50) NOT NULL,
  bio TEXT,
  otp VARCHAR(6) NOT NULL,
  otp_expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON pending_registrations(email);

-- Create index for cleanup queries (finding expired registrations)
CREATE INDEX IF NOT EXISTS idx_pending_registrations_created_at ON pending_registrations(created_at);

-- Success message
-- Pending registrations table created successfully
-- Users will now only be created after OTP verification

