import { SocialAccountCredentials } from '../../models/SocialAccount';
import { EntityType } from '../../models/Interaction';

export interface Post {
  id: string;
  url: string;
  content: string;
  author?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface Comment {
  id: string;
  url: string;
  content: string;
  author?: string;
  timestamp?: Date;
  parentId?: string;
  parentType?: EntityType;
  metadata?: Record<string, unknown>;
}

export interface InteractionResult {
  success: boolean;
  entityId: string;
  entityType: EntityType;
  entityUrl: string;
  parentEntityId?: string;
  parentEntityType?: EntityType;
  errorMessage?: string;
}

export interface IPlatformAdapter {
  // Platform information
  getHomeUrl(): string;

  login(credentials: SocialAccountCredentials): Promise<void>;

  // Post interactions
  likePost(postUrl: string): Promise<InteractionResult>;
  commentOnPost(postUrl: string, comment: string): Promise<InteractionResult>;
  reportPost(postUrl: string, reason: string): Promise<InteractionResult>;

  // Comment interactions
  likeComment(commentUrl: string): Promise<InteractionResult>;
  replyToComment(commentUrl: string, replyText: string): Promise<InteractionResult>;

  // Search and discovery
  searchPosts(query: string): Promise<Post[]>;

  // Session management
  logout(): Promise<void>;
  isLoggedIn(): Promise<boolean>;

  // Browser state management
  saveBrowserState(): Promise<string>;
  restoreBrowserState(stateJson: string): Promise<void>;

  // Cleanup
  close(): Promise<void>;
}

