import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { logger } from '../utils/logger';

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

export interface GoLoginSessionOptions {
  gologinToken: string;
  profileId: string;
}

export interface GoLoginSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  stop: () => Promise<void>;
}

/**
 * Opens a GoLogin session and connects Playwright via CDP
 * @param options GoLogin token and profile ID
 * @returns Browser, context, page, and stop function
 */
export async function openGoLoginSession(
  options: GoLoginSessionOptions
): Promise<GoLoginSession> {
  const { gologinToken, profileId } = options;

  if (!gologinToken) {
    throw new Error('GoLogin token is required');
  }

  if (!profileId) {
    throw new Error('GoLogin profile ID is required');
  }

  let goLogin: any = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Initialize GoLogin client
    goLogin = createGoLoginClient({
      token: gologinToken,
    });

    logger.info(`Starting GoLogin session for profile ${profileId}`);

    // Start the GoLogin browser and get WebSocket CDP URL
    const { wsUrl } = await goLogin.start({ profileId });

    if (!wsUrl) {
      throw new Error('Failed to get WebSocket URL from GoLogin');
    }

    logger.info(`GoLogin browser started, connecting Playwright to CDP: ${wsUrl}`);

    // Connect Playwright to the GoLogin browser via CDP
    browser = await chromium.connectOverCDP(wsUrl);

    // Get the default context (GoLogin manages the context)
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser context found after connecting to GoLogin');
    }

    context = contexts[0];

    // Get or create a page
    const pages = context.pages();
    if (pages.length > 0) {
      page = pages[0];
    } else {
      page = await context.newPage();
    }

    logger.info('Successfully connected Playwright to GoLogin browser');

    // Create stop function
    const stop = async (): Promise<void> => {
      try {
        logger.info(`Stopping GoLogin session for profile ${profileId}`);

        // Close Playwright connection
        if (page) {
          try {
            await page.close();
          } catch (error) {
            logger.warn('Error closing page:', error);
          }
          page = null;
        }

        if (browser) {
          try {
            await browser.close();
          } catch (error) {
            logger.warn('Error closing browser:', error);
          }
          browser = null;
        }

        // Stop GoLogin session
        if (goLogin) {
          try {
            await goLogin.stop({ profileId });
            logger.info(`GoLogin session stopped for profile ${profileId}`);
          } catch (error) {
            logger.warn('Error stopping GoLogin session:', error);
          }
          goLogin = null;
        }

        context = null;
      } catch (error) {
        logger.error('Error in stop function:', error);
        throw error;
      }
    };

    return {
      browser,
      context,
      page,
      stop,
    };
  } catch (error) {
    // Cleanup on error
    logger.error('Error opening GoLogin session:', error);

    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    if (goLogin) {
      try {
        await goLogin.stop({ profileId });
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    throw error;
  }
}

