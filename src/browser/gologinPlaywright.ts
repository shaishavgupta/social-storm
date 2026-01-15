import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { logger } from '../utils/logger';
import { GoLogin } from 'gologin';

const GL_TOKEN = process.env.GL_TOKEN;
const PROFILE_ID = process.env.PROFILE_ID || '690c6e26c408ec7b3bc91178';


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

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Initialize GoLogin client
    const gologin = new GoLogin({
      token: GL_TOKEN,
      profile_id: PROFILE_ID,
    });

    logger.info(`Starting GoLogin session for profile ${profileId}`);

    // Start the GoLogin browser and get WebSocket CDP URL
    const { wsUrl } = await gologin.start({ profileId });

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
        try {
          await gologin.stop();
          logger.info(`GoLogin session stopped for profile ${profileId}`);
        } catch (error) {
          logger.warn('Error stopping GoLogin session:', error);
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

    throw error;
  }
}

