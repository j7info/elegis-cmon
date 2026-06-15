-- Migration 010: Add status to registrations

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';

-- Set all existing registrations to approved
UPDATE registrations SET status = 'approved' WHERE status IS NULL;
