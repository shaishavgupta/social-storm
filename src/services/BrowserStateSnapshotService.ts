import { BrowserContext, Page } from 'playwright';
import { getDbConnection } from '../database/connection';
import { logger } from '../utils/logger';
import { BrowserStateSnapshot, CreateBrowserStateSnapshotParams } from '../models/BrowserStateSnapshot';

const MAX_ENTRY_SIZE = 10 * 1024; // 10KB per entry
const MAX_SNAPSHOT_SIZE = 1024 * 1024; // 1MB total

export class BrowserStateSnapshotService {
  /**
   * Captures and stores a browser state snapshot
   */
  async captureSnapshot(
    sessionId: number,
    profileId: number | undefined,
    context: BrowserContext,
    page: Page
  ): Promise<BrowserStateSnapshot> {
    try {
      // Get cookies
      const cookies = await context.cookies();

      // Get localStorage for all origins
      const localStorage: Record<string, Record<string, string>> = {};

      // Get all origins from cookies
      const origins = new Set<string>();
      cookies.forEach((cookie) => {
        if (cookie.domain) {
          // Convert domain to origin format
          const origin = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
          origins.add(`https://${origin}`);
          origins.add(`http://${origin}`);
        }
      });

      // Also get current page origin
      const currentUrl = page.url();
      try {
        const urlObj = new URL(currentUrl);
        origins.add(`${urlObj.protocol}//${urlObj.host}`);
      } catch (e) {
        // Invalid URL, skip
      }

      // Capture localStorage for each origin
      for (const origin of origins) {
        try {
          await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {
            // Ignore navigation errors
          });

          const storage = await page.evaluate(() => {
            const storage: Record<string, string> = {};
            try {
              // Access localStorage in browser context - TypeScript doesn't know about DOM types here
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const localStorage = (globalThis as any).localStorage;
              if (localStorage) {
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key) {
                    const value = localStorage.getItem(key);
                    if (value) {
                      // Skip large entries
                      if (value.length > MAX_ENTRY_SIZE) {
                        continue;
                      }
                      storage[key] = value;
                    }
                  }
                }
              }
            } catch (e) {
              // Cross-origin or other error, skip
            }
            return storage;
          });

          if (Object.keys(storage).length > 0) {
            localStorage[origin] = storage;
          }
        } catch (error) {
          // Skip origins that can't be accessed
          logger.debug(`Could not capture localStorage for origin ${origin}:`, error);
        }
      }

      // Apply size limits
      const filteredLocalStorage = this.applySizeLimits(localStorage);
      const filteredCookies = this.filterCookies(cookies);

      // Create snapshot
      return await this.createSnapshot({
        sessionId,
        profileId,
        cookies: filteredCookies,
        localStorage: filteredLocalStorage,
        storageDumpVersion: 1,
      });
    } catch (error) {
      logger.error('Failed to capture browser state snapshot:', error);
      throw error;
    }
  }

  /**
   * Creates a browser state snapshot record in the database
   */
  async createSnapshot(params: CreateBrowserStateSnapshotParams): Promise<BrowserStateSnapshot> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        `INSERT INTO browser_state_snapshots (
          session_id, profile_id, cookies_json, local_storage_json, storage_dump_version, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *`,
        [
          params.sessionId,
          params.profileId || null,
          JSON.stringify(params.cookies),
          JSON.stringify(params.localStorage),
          params.storageDumpVersion || 1,
        ]
      );

      return this.mapRowToSnapshot(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create browser state snapshot:', error);
      throw error;
    }
  }

  /**
   * Gets the latest snapshot for a session
   */
  async getSessionSnapshot(sessionId: number): Promise<BrowserStateSnapshot | null> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        'SELECT * FROM browser_state_snapshots WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSnapshot(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get session snapshot:', error);
      throw error;
    }
  }

  /**
   * Gets the latest snapshot for a profile
   */
  async getProfileSnapshot(profileId: number): Promise<BrowserStateSnapshot | null> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        'SELECT * FROM browser_state_snapshots WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 1',
        [profileId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSnapshot(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get profile snapshot:', error);
      throw error;
    }
  }

  /**
   * Applies size limits to localStorage data
   */
  private applySizeLimits(
    localStorage: Record<string, Record<string, string>>
  ): Record<string, Record<string, string>> {
    const filtered: Record<string, Record<string, string>> = {};
    let totalSize = 0;

    for (const [origin, storage] of Object.entries(localStorage)) {
      const filteredStorage: Record<string, string> = {};

      for (const [key, value] of Object.entries(storage)) {
        const entrySize = key.length + value.length;
        if (entrySize > MAX_ENTRY_SIZE) {
          continue; // Skip large entries
        }

        if (totalSize + entrySize > MAX_SNAPSHOT_SIZE) {
          break; // Stop if we've reached the limit
        }

        filteredStorage[key] = value;
        totalSize += entrySize;
      }

      if (Object.keys(filteredStorage).length > 0) {
        filtered[origin] = filteredStorage;
      }
    }

    return filtered;
  }

  /**
   * Filters cookies to remove large ones
   */
  private filterCookies(cookies: any[]): any[] {
    return cookies.filter((cookie) => {
      const size = JSON.stringify(cookie).length;
      return size <= MAX_ENTRY_SIZE;
    });
  }

  private mapRowToSnapshot(row: any): BrowserStateSnapshot {
    return {
      id: row.id,
      sessionId: row.session_id,
      profileId: row.profile_id,
      createdAt: row.created_at,
      cookies: row.cookies_json ? JSON.parse(row.cookies_json) : [],
      localStorage: row.local_storage_json ? JSON.parse(row.local_storage_json) : {},
      storageDumpVersion: row.storage_dump_version || 1,
    };
  }
}

// Singleton instance
let browserStateSnapshotService: BrowserStateSnapshotService | null = null;

export function getBrowserStateSnapshotService(): BrowserStateSnapshotService {
  if (!browserStateSnapshotService) {
    browserStateSnapshotService = new BrowserStateSnapshotService();
  }
  return browserStateSnapshotService;
}

