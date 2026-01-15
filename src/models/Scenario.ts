import { Platform } from './SocialAccount';

export interface InteractionFlowStep {
  step: number;
  action: 'search' | 'like' | 'comment' | 'reply' | 'report';
  entity_type?: 'post' | 'comment';
  query?: string;
  target?: string;
  generate_comment?: boolean;
  filters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Scenario {
  id: number;
  name: string;
  platform: Platform;
  interaction_flow_json: InteractionFlowStep[];
  targeting_rules: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

