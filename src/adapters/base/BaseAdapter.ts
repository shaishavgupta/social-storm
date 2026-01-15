import { Browser, Page } from 'puppeteer-core';
import { IPlatformAdapter } from '../interfaces/IPlatformAdapter';
import { SocialAccountCredentials } from '../../models/SocialAccount';
import { logger } from '../../utils/logger';
import { humanDelay, randomDelay } from '../../utils/delay';
import { openGoLoginSession, GoLoginSession } from '../../browser/gologinPuppeteer';

export interface GoLoginBrowserOptions {
  gologinToken: string;
  profileId: string;
}

export abstract class BaseAdapter implements IPlatformAdapter {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected isAuthenticated: boolean = false;
  protected stopGoLoginSession: (() => Promise<void>) | null = null;

  /**
   * Initialize browser with GoLogin
   * @param options GoLogin token and profile ID
   */
  protected async initializeBrowser(options?: GoLoginBrowserOptions): Promise<void> {
    if (this.browser) {
      return;
    }

    if (!options || !options.gologinToken || !options.profileId) {
      throw new Error('GoLogin token and profile ID are required');
    }

    logger.info(`Initializing browser with GoLogin profile ${options.profileId}`);

    // Open GoLogin session
    const goLoginSession: GoLoginSession = await openGoLoginSession({
      gologinToken: options.gologinToken,
      profileId: options.profileId,
    });

    this.browser = goLoginSession.browser;
    this.page = goLoginSession.page;
    this.stopGoLoginSession = goLoginSession.stop;

    logger.info('Browser initialized with GoLogin');
  }

  /**
   * Alternative: Set browser components from external source (e.g., SessionRunner)
   * This allows adapters to work with pre-initialized GoLogin sessions
   */
  protected setBrowserComponents(
    browser: Browser,
    page: Page,
    stop?: () => Promise<void>
  ): void {
    this.browser = browser;
    this.page = page;
    if (stop) {
      this.stopGoLoginSession = stop;
    }
  }

  /**
   * Human-like mouse movement
   */
  protected async humanMouseMove(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    if (element) {
      const box = await element.boundingBox();
      if (box) {
        // Move mouse in a curved path
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = box.x + box.width / 2 + Math.sin(t * Math.PI) * 10;
          const y = box.y + box.height / 2 + Math.cos(t * Math.PI) * 10;
          await page.mouse.move(x, y);
          await randomDelay(10, 30);
        }
      }
    }
  }

  /**
   * Human-like typing with delays
   */
  protected async humanType(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector);
    await humanDelay(200);

    // Clear existing text first
    // Code inside evaluate() runs in browser context where document and DOM types exist
    await page.evaluate((sel) => {
      // @ts-expect-error - This code runs in browser context where document and DOM types exist
      const element = document.querySelector(sel);
      // @ts-expect-error - HTMLInputElement and HTMLTextAreaElement exist in browser context
      if (element && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        element.value = '';
      }
    }, selector);

    for (const char of text) {
      const delay = Math.floor(Math.random() * (150 - 50 + 1)) + 50;
      await page.keyboard.type(char, { delay });
    }
  }

  /**
   * Wait for element with retries
   */
  protected async waitForElement(
    page: Page,
    selector: string,
    timeout: number = 10000,
    retries: number = 3
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await page.waitForSelector(selector, { timeout });
        return;
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        await humanDelay(1000);
      }
    }
  }

  /**
   * Scroll page randomly to simulate human behavior
   */
  protected async randomScroll(page: Page): Promise<void> {
    const scrollAmount = Math.floor(Math.random() * 500) + 200;
    await page.evaluate((amount) => {
      (globalThis as any).window.scrollBy(0, amount);
    }, scrollAmount);
    await humanDelay(500, 0.5);
  }

  /**
   * Saves the current browser context state (cookies, localStorage, etc.)
   * Note: This is for snapshot/diagnostic purposes only.
   * GoLogin handles profile state synchronization automatically.
   * @returns JSON string representation of the browser state
   */
  async saveBrowserState(): Promise<string> {
    if (!this.page) {
      throw new Error('Browser page not initialized');
    }

    try {
      const cookies = await this.page.cookies();
      const localStorage = await this.page.evaluate(() => {
        const storage: Record<string, string> = {};
        try {
          // @ts-expect-error - This code runs in browser context where localStorage exists
          for (let i = 0; i < localStorage.length; i++) {
            // @ts-expect-error - This code runs in browser context where localStorage exists
            const key = localStorage.key(i);
            if (key) {
              // @ts-expect-error - This code runs in browser context where localStorage exists
              storage[key] = localStorage.getItem(key) || '';
            }
          }
        } catch (e) {
          // Ignore errors
        }
        return storage;
      });

      const state = {
        cookies,
        origins: [
          {
            origin: this.page.url(),
            localStorage,
          },
        ],
      };

      return JSON.stringify(state);
    } catch (error) {
      logger.error('Failed to save browser state:', error);
      throw error;
    }
  }

  /**
   * @deprecated Browser state restoration is handled by GoLogin automatically.
   * This method is kept for backward compatibility but does nothing.
   */
  async restoreBrowserState(_stateJson: string): Promise<void> {
    logger.warn('restoreBrowserState() is deprecated. GoLogin handles state restoration automatically.');
    // No-op: GoLogin manages profile state
  }

  /**
   * Gets the home URL for the platform
   * @returns The home page URL for the platform
   */
  abstract getHomeUrl(): string;

  abstract login(credentials: SocialAccountCredentials): Promise<void>;
  abstract likePost(postUrl: string): Promise<import('../interfaces/IPlatformAdapter').InteractionResult>;
  abstract commentOnPost(postUrl: string, comment: string): Promise<import('../interfaces/IPlatformAdapter').InteractionResult>;
  abstract reportPost(postUrl: string, reason: string): Promise<import('../interfaces/IPlatformAdapter').InteractionResult>;
  abstract likeComment(commentUrl: string): Promise<import('../interfaces/IPlatformAdapter').InteractionResult>;
  abstract replyToComment(commentUrl: string, replyText: string): Promise<import('../interfaces/IPlatformAdapter').InteractionResult>;
  abstract searchPosts(query: string): Promise<import('../interfaces/IPlatformAdapter').Post[]>;
  abstract logout(): Promise<void>;
  abstract isLoggedIn(): Promise<boolean>;

  async close(): Promise<void> {
    try {
      // If we have a GoLogin stop function, use it (it handles everything)
      if (this.stopGoLoginSession) {
        await this.stopGoLoginSession();
        this.stopGoLoginSession = null;
      } else {
        // Fallback: manual cleanup (for non-GoLogin scenarios)
        if (this.page) {
          await this.page.close();
          this.page = null;
        }
        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }
      }
      this.isAuthenticated = false;
      logger.info('Browser closed');
    } catch (error) {
      logger.error('Error closing browser:', error);
    }
  }
}

