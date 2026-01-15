import { IPlatformAdapter } from './interfaces/IPlatformAdapter';
import { Platform } from '../models/SocialAccount';
import { TwitterAdapter } from './twitter/TwitterAdapter';
import { FacebookAdapter } from './facebook/FacebookAdapter';

/**
 * Factory class for creating platform adapters
 */
export class PlatformAdapterFactory {
  /**
   * Creates a platform adapter instance based on the platform type
   * @param platform - The platform type ('twitter' or 'facebook')
   * @returns An instance of the appropriate platform adapter
   * @throws Error if the platform is not supported
   */
  static create(platform: Platform): IPlatformAdapter {
    switch (platform) {
      case 'twitter':
        return new TwitterAdapter();
      case 'facebook':
        return new FacebookAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

