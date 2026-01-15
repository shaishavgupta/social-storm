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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sessions_social_account_id ON sessions(social_account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_scenario_id ON sessions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_interactions_session_id ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_interacted_by_account_id ON interactions(interacted_by_account_id);
CREATE INDEX IF NOT EXISTS idx_interactions_entity_id ON interactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_session_id ON metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_metrics_platform ON metrics(platform);

