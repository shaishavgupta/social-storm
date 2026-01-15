export type ProfileStatus = 'ACTIVE' | 'EXPIRED' | 'BANNED' | 'DELETED';

export interface FingerprintConfig {
  os?: 'win' | 'lin' | 'mac';
  browser?: 'chrome' | 'firefox' | 'edge';
  timezone?: string;
  language?: string;
  [key: string]: unknown;
}

export interface ProfileRecord {
  id: number;
  socialAccountId: number;
  gologinProfileId: string;
  status: ProfileStatus;
  fingerprintConfig?: FingerprintConfig;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
}

export interface CreateProfileRecordParams {
  socialAccountId: number;
  gologinProfileId: string;
  status?: ProfileStatus;
  fingerprintConfig?: FingerprintConfig;
}

