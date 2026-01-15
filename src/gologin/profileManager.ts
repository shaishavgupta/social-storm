import { getDbConnection } from '../database/connection';
import { logger } from '../utils/logger';
import { ProfileRecord, ProfileStatus, FingerprintConfig } from '../models/ProfileRecord';
import { Platform } from '../models/SocialAccount';

// GoLogin SDK import - adjust based on actual package structure
// The package may export as 'GologinApi' (function) or 'GoLogin' (class)
let createGoLoginClient: (options: { token: string }) => any;
try {
  const gologinModule = require('gologin');
  // Try different possible exports
  if (typeof gologinModule.GologinApi === 'function') {
    createGoLoginClient = gologinModule.GologinApi;
  } else if (typeof gologinModule.GoLogin === 'function') {
    createGoLoginClient = (options: { token: string }) => new gologinModule.GoLogin(options);
  } else if (typeof gologinModule.default === 'function') {
    createGoLoginClient = gologinModule.default;
  } else {
    throw new Error('GoLogin client not found in gologin package');
  }
} catch (error) {
  logger.error('Failed to import gologin package. Make sure it is installed: npm install gologin');
  throw error;
}

export class ProfileManager {
  private goLogin: any | null = null;

  constructor(gologinToken: string) {
    if (!gologinToken) {
      throw new Error('GoLogin token is required');
    }
    this.goLogin = createGoLoginClient({ token: gologinToken });
  }

  /**
   * Ensures a profile exists for a user (creates if not found)
   */
  async ensureProfileForUser(
    socialAccountId: number,
  ): Promise<ProfileRecord> {
    const db = getDbConnection();

    // Check for existing ACTIVE profile
    const existingResult = await db.query(
      'SELECT * FROM gologin_profiles WHERE social_account_id = $1 AND status = $2',
      [socialAccountId, 'ACTIVE']
    );

    if (existingResult.rows.length > 0) {
      const profile = this.mapRowToProfile(existingResult.rows[0]);
      logger.info(`Found existing ACTIVE profile ${profile.gologinProfileId} for social account ${socialAccountId}`);
      return profile;
    }

    // No active profile found, create a new one
    logger.info(`Creating new GoLogin profile for social account ${socialAccountId}`);

    // Get fingerprint config from existing profile or use defaults
    let fingerprintConfig: FingerprintConfig | undefined;
    const oldProfileResult = await db.query(
      'SELECT fingerprint_config FROM gologin_profiles WHERE social_account_id = $1 ORDER BY created_at DESC LIMIT 1',
      [socialAccountId]
    );

    if (oldProfileResult.rows.length > 0 && oldProfileResult.rows[0].fingerprint_config) {
      fingerprintConfig = oldProfileResult.rows[0].fingerprint_config;
    } else {
      // Generate default fingerprint config
      fingerprintConfig = this.generateDefaultFingerprintConfig();
    }

    // Create profile via GoLogin API
    if (!this.goLogin) {
      throw new Error('GoLogin client not initialized');
    }

    const profileData: any = {
      name: `Profile-${socialAccountId}-${Date.now()}`,
      os: fingerprintConfig?.os || this.getRandomOS(),
    };

    // Add additional fingerprint settings if provided
    if (fingerprintConfig?.browser) {
      profileData.browser = fingerprintConfig.browser;
    }
    if (fingerprintConfig?.timezone) {
      profileData.timezone = fingerprintConfig.timezone;
    }
    if (fingerprintConfig?.language) {
      profileData.language = fingerprintConfig.language;
    }

    const gologinProfile = await this.goLogin.create(profileData);
    const gologinProfileId = gologinProfile.id;

    // Persist to database
    const insertResult = await db.query(
      `INSERT INTO gologin_profiles (
        social_account_id, gologin_profile_id, status, fingerprint_config, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *`,
      [socialAccountId, gologinProfileId, 'ACTIVE', JSON.stringify(fingerprintConfig)]
    );

    logger.info(`Created new GoLogin profile ${gologinProfileId} for social account ${socialAccountId}`);

    return this.mapRowToProfile(insertResult.rows[0]);
  }

  /**
   * Gets a valid profile for a user (creates if needed)
   */
  async getValidProfileForUser(
    socialAccountId: number,
    _platform?: Platform
  ): Promise<ProfileRecord> {
    const db = getDbConnection();

    // Look up existing profile
    const existingResult = await db.query(
      'SELECT * FROM gologin_profiles WHERE social_account_id = $1 ORDER BY created_at DESC LIMIT 1',
      [socialAccountId]
    );

    if (existingResult.rows.length > 0) {
      const profile = this.mapRowToProfile(existingResult.rows[0]);

      // Check if profile is invalid
      if (profile.status === 'BANNED' || profile.status === 'DELETED') {
        logger.info(`Profile ${profile.gologinProfileId} is ${profile.status}, creating new profile`);
        return this.ensureProfileForUser(socialAccountId);
      }

      // Optionally verify profile exists in GoLogin
      if (profile.status === 'ACTIVE' && this.goLogin) {
        try {
          // Try to get profile from GoLogin to verify it exists
          await this.goLogin.getProfile({ profileId: profile.gologinProfileId });
          logger.debug(`Verified profile ${profile.gologinProfileId} exists in GoLogin`);
        } catch (error: any) {
          // Profile not found in GoLogin, mark as expired
          if (error.message?.includes('not found') || error.status === 404) {
            logger.warn(`Profile ${profile.gologinProfileId} not found in GoLogin, marking as EXPIRED`);
            await this.markProfileAsExpired(profile.id);
            return this.ensureProfileForUser(socialAccountId);
          }
          // Other errors, assume profile is still valid
          logger.warn(`Error verifying profile ${profile.gologinProfileId}:`, error);
        }
      }

      // Profile is valid
      return profile;
    }

    // No profile found, create one
    return this.ensureProfileForUser(socialAccountId);
  }

  /**
   * Marks a profile as banned
   */
  async markProfileAsBanned(profileId: number): Promise<void> {
    const db = getDbConnection();

    await db.query(
      'UPDATE gologin_profiles SET status = $1, updated_at = NOW() WHERE id = $2',
      ['BANNED', profileId]
    );

    logger.info(`Marked profile ${profileId} as BANNED`);
  }

  /**
   * Marks a profile as expired
   */
  async markProfileAsExpired(profileId: number): Promise<void> {
    const db = getDbConnection();

    await db.query(
      'UPDATE gologin_profiles SET status = $1, updated_at = NOW() WHERE id = $2',
      ['EXPIRED', profileId]
    );

    logger.info(`Marked profile ${profileId} as EXPIRED`);
  }

  /**
   * Updates the last used timestamp for a profile
   */
  async updateLastUsed(profileId: number): Promise<void> {
    const db = getDbConnection();

    await db.query(
      'UPDATE gologin_profiles SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1',
      [profileId]
    );
  }

  /**
   * Gets a profile by ID
   */
  async getProfile(profileId: number): Promise<ProfileRecord | null> {
    const db = getDbConnection();

    const result = await db.query('SELECT * FROM gologin_profiles WHERE id = $1', [profileId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToProfile(result.rows[0]);
  }

  /**
   * Gets a profile by GoLogin profile ID
   */
  async getProfileByGoLoginId(gologinProfileId: string): Promise<ProfileRecord | null> {
    const db = getDbConnection();

    const result = await db.query('SELECT * FROM gologin_profiles WHERE gologin_profile_id = $1', [
      gologinProfileId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToProfile(result.rows[0]);
  }

  /**
   * Generates default fingerprint configuration
   */
  private generateDefaultFingerprintConfig(): FingerprintConfig {
    return {
      os: this.getRandomOS(),
      browser: 'chrome',
      timezone: this.getRandomTimezone(),
      language: 'en-US',
    };
  }

  /**
   * Gets a random OS
   */
  private getRandomOS(): 'win' | 'lin' | 'mac' {
    const oses: ('win' | 'lin' | 'mac')[] = ['win', 'mac', 'lin'];
    return oses[Math.floor(Math.random() * oses.length)];
  }

  /**
   * Gets a random timezone
   */
  private getRandomTimezone(): string {
    const timezones = [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
    ];
    return timezones[Math.floor(Math.random() * timezones.length)];
  }

  private mapRowToProfile(row: any): ProfileRecord {
    return {
      id: row.id,
      socialAccountId: row.social_account_id,
      gologinProfileId: row.gologin_profile_id,
      status: row.status as ProfileStatus,
      fingerprintConfig: row.fingerprint_config ? JSON.parse(row.fingerprint_config) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
    };
  }
}

