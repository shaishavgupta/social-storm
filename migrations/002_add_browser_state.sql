-- Add browser_state column to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS browser_state TEXT;

