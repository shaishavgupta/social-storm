export type Platform = 'twitter' | 'facebook';

export interface SocialAccount {
  id: number;
  platform: Platform;
  encrypted_credentials: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SocialAccountCredentials {
  username?: string;
  email?: string;
  password?: string;
  cookies?: string;
  sessionData?: string;
}

