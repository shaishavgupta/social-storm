import { Browser, Page, connect } from 'puppeteer-core';
import { logger } from '../utils/logger';
import { GologinApi } from 'gologin';

export interface GoLoginSessionOptions {
  gologinToken: string;
  profileId: string;
}

export interface GoLoginSession {
  browser: Browser;
  page: Page;
  stop: () => Promise<void>;
}

/**
 * Opens a GoLogin session and connects Puppeteer via CDP
 * @param options GoLogin token and profile ID
 * @returns Browser, page, and stop function
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
  let page: Page | null = null;
  let gologin: ReturnType<typeof GologinApi> | null = null;
  let puppeteerBrowser: Browser | null = null;

  try {
    // Initialize GoLogin client
    gologin = GologinApi({ token: gologinToken });

    logger.info(`Starting GoLogin session for profile ${profileId}`);

    // Start the GoLogin browser and get Puppeteer browser instance
    const launchResult = await gologin.launch({ profileId });
    puppeteerBrowser = launchResult.browser as Browser;

    if (!puppeteerBrowser) {
      throw new Error('Failed to get browser instance from GoLogin');
    }

    // Get WebSocket CDP URL from Puppeteer browser
    const wsUrl = puppeteerBrowser.wsEndpoint();

    if (!wsUrl) {
      throw new Error('Failed to get WebSocket URL from GoLogin browser');
    }

    logger.info(`GoLogin browser started, connecting Puppeteer to CDP: ${wsUrl}`);

    // Connect Puppeteer to the GoLogin browser via CDP
    browser = await connect({
      browserWSEndpoint: wsUrl,
    });

    // Get or create a page
    const pages = await browser.pages();
    if (pages.length > 0) {
      page = pages[0];
    } else {
      page = await browser.newPage();
    }

    logger.info('Successfully connected Puppeteer to GoLogin browser');

    // Create stop function
    const stop = async (): Promise<void> => {
      try {
        logger.info(`Stopping GoLogin session for profile ${profileId}`);

        // Close Puppeteer connection
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
            await browser.disconnect();
          } catch (error) {
            logger.warn('Error disconnecting browser:', error);
          }
          browser = null;
        }

        // Stop GoLogin session
        if (puppeteerBrowser) {
          try {
            await puppeteerBrowser.close();
          } catch (error) {
            logger.warn('Error closing Puppeteer browser:', error);
          }
          puppeteerBrowser = null;
        }

        if (gologin) {
          try {
            await gologin.exit();
            logger.info(`GoLogin session stopped for profile ${profileId}`);
          } catch (error) {
            logger.warn('Error exiting GoLogin session:', error);
          }
          gologin = null;
        }
      } catch (error) {
        logger.error('Error in stop function:', error);
        throw error;
      }
    };

    return {
      browser,
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
        await browser.disconnect();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    throw error;
  }
}

