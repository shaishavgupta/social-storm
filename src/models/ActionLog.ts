export type ActionType =
  | 'NAVIGATE'
  | 'CLICK'
  | 'TYPE'
  | 'SCROLL'
  | 'WAIT'
  | 'SCREENSHOT'
  | 'CUSTOM'
  | 'SESSION_ERROR';

export interface ActionLog {
  id: number;
  sessionId: number;
  profileId?: number;
  socialAccountId: number;
  timestamp: Date;
  actionType: ActionType;
  target?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateActionLogParams {
  sessionId: number;
  profileId?: number;
  socialAccountId: number;
  actionType: ActionType;
  target?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

