-- Create superuser table
CREATE TABLE IF NOT EXISTS superuser (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create social_accounts table
CREATE TABLE IF NOT EXISTS social_accounts (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(50) NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create scenarios table
CREATE TABLE IF NOT EXISTS scenarios (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  interaction_flow_json JSONB NOT NULL,
  targeting_rules JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  social_account_id INTEGER NOT NULL,
  scenario_id INTEGER,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration INTEGER,
  status VARCHAR(50) NOT NULL,
  actions_count INTEGER DEFAULT 0
);

-- Create interactions table
CREATE TABLE IF NOT EXISTS interactions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255),
  entity_url TEXT,
  interacted_by_account_id INTEGER NOT NULL,
  comment_text TEXT,
  parent_entity_id VARCHAR(255),
  parent_entity_type VARCHAR(50),
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata_json JSONB,
  step_sequence INTEGER
);

-- Create metrics table
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL,
  platform VARCHAR(50) NOT NULL,
  engagement_rate DECIMAL(5, 2),
  latency_ms INTEGER,
  failure_rate DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_sessions_social_account_id ON sessions(social_account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_scenario_id ON sessions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_interactions_session_id ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_interacted_by_account_id ON interactions(interacted_by_account_id);
CREATE INDEX IF NOT EXISTS idx_interactions_entity_id ON interactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_session_id ON metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_metrics_platform ON metrics(platform);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS browser_state TEXT;
