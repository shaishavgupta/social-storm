import crypto from 'crypto';
import { logger } from '../utils/logger';
import { SocialAccountCredentials } from '../models/SocialAccount';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

export class EncryptionService {
  private encryptionKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    if (key.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 characters (32 bytes in hex)');
    }
    this.encryptionKey = Buffer.from(key, 'hex');
  }

  /**
   * Encrypts social media credentials
   */
  encrypt(credentials: SocialAccountCredentials): string {
    try {
      const text = JSON.stringify(credentials);
      const iv = crypto.randomBytes(IV_LENGTH);
      const salt = crypto.randomBytes(SALT_LENGTH);

      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      cipher.setAAD(salt);

      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt credentials');
    }
  }

  /**
   * Decrypts social media credentials
   */
  decrypt(encryptedData: string): SocialAccountCredentials {
    try {
      const data = Buffer.from(encryptedData, 'base64');

      const salt = data.subarray(0, SALT_LENGTH);
      const iv = data.subarray(SALT_LENGTH, TAG_POSITION);
      const tag = data.subarray(TAG_POSITION, ENCRYPTED_POSITION);
      const encrypted = data.subarray(ENCRYPTED_POSITION);

      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      decipher.setAAD(salt);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8')) as SocialAccountCredentials;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt credentials');
    }
  }
}

// Singleton instance
let encryptionService: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
  if (!encryptionService) {
    encryptionService = new EncryptionService();
  }
  return encryptionService;
}

