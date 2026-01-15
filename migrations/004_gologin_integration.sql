-- GoLogin integration tables

-- Create gologin_profiles table
CREATE TABLE IF NOT EXISTS gologin_profiles (
  id SERIAL PRIMARY KEY,
  social_account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  gologin_profile_id VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'BANNED', 'DELETED')),
  fingerprint_config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

-- Create action_logs table
CREATE TABLE IF NOT EXISTS action_logs (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES gologin_profiles(id) ON DELETE SET NULL,
  social_account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT NOW(),
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('NAVIGATE', 'CLICK', 'TYPE', 'SCROLL', 'WAIT', 'SCREENSHOT', 'CUSTOM', 'SESSION_ERROR')),
  target TEXT,
  url TEXT,
  metadata_json JSONB
);

-- Create browser_state_snapshots table
CREATE TABLE IF NOT EXISTS browser_state_snapshots (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES gologin_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  cookies_json JSONB NOT NULL,
  local_storage_json JSONB NOT NULL,
  storage_dump_version INTEGER DEFAULT 1
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_gologin_profiles_social_account_id ON gologin_profiles(social_account_id);
CREATE INDEX IF NOT EXISTS idx_gologin_profiles_status ON gologin_profiles(status);
CREATE INDEX IF NOT EXISTS idx_gologin_profiles_gologin_profile_id ON gologin_profiles(gologin_profile_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_session_id ON action_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_timestamp ON action_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_action_logs_profile_id ON action_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_browser_state_snapshots_session_id ON browser_state_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_browser_state_snapshots_profile_id ON browser_state_snapshots(profile_id);

