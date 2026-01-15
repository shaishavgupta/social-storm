export type ActionType = 'like' | 'comment' | 'reply' | 'report' | 'search';
export type EntityType = 'post' | 'comment';

export interface Interaction {
  id: number;
  session_id: number;
  action_type: ActionType;
  entity_type: EntityType;
  entity_id: string | null;
  entity_url: string | null;
  interacted_by_account_id: number;
  comment_text: string | null;
  parent_entity_id: string | null;
  parent_entity_type: EntityType | null;
  success: boolean;
  error_message: string | null;
  timestamp: Date;
  metadata_json: Record<string, unknown> | null;
  step_sequence: number | null;
}

