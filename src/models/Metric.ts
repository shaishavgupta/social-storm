import { Platform } from './SocialAccount';

export interface Metric {
  id: number;
  session_id: number;
  platform: Platform;
  engagement_rate: number | null;
  latency_ms: number | null;
  failure_rate: number | null;
  created_at: Date;
}

