-- Add email_password column to social_accounts table
ALTER TABLE social_accounts
ADD COLUMN IF NOT EXISTS email_password TEXT;

