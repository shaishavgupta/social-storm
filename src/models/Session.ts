export type SessionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Session {
  id: number;
  social_account_id: number;
  scenario_id: number | null;
  started_at: Date;
  ended_at: Date | null;
  duration: number | null;
  status: SessionStatus;
  actions_count: number;
  browser_state: string | null;
}

