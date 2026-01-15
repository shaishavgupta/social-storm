import crypto from 'crypto';
import { logger } from '../utils/logger';
import { SocialAccountCredentials } from '../models/SocialAccount';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export class EncryptionService {
  private encryptionKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    // For AES-256, we need exactly 32 bytes
    // Hash the key to ensure we always get 32 bytes regardless of input length
    this.encryptionKey = crypto.createHash('sha256').update(key).digest();
  }

  /**
   * Encrypts social media credentials
   */
  encrypt(credentials: SocialAccountCredentials): string {
    try {
      const text = JSON.stringify(credentials);
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

      let encrypted = cipher.update(text, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Prepend IV to encrypted data
      return iv.toString('base64') + ':' + encrypted;
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
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'base64');
      const encrypted = parts[1];

      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as SocialAccountCredentials;
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

