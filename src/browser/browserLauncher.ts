import { Browser, Page, launch } from 'puppeteer-core';
import { logger } from '../utils/logger';
import { openGoLoginSession, GoLoginSession } from './gologinPuppeteer';
import * as fs from 'fs';
import * as path from 'path';

export interface BrowserSession {
  browser: Browser;
  page: Page;
  stop: () => Promise<void>;
}

export interface BrowserSessionOptions {
  gologinToken?: string;
  profileId?: string;
}

/**
 * Determines if Chrome should be used instead of GoLogin
 * Chrome is used in local/development environments
 */
function shouldUseChrome(): boolean {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  return nodeEnv === 'development' || nodeEnv === 'local';
}

/**
 * Gets the Chrome executable path based on the operating system
 * Falls back to CHROME_EXECUTABLE_PATH environment variable if provided
 */
function getChromeExecutablePath(): string {
  // Check env var first
  if (process.env.CHROME_EXECUTABLE_PATH) {
    const chromePath = process.env.CHROME_EXECUTABLE_PATH;
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
    logger.warn(`CHROME_EXECUTABLE_PATH set to ${chromePath} but file does not exist`);
  }

  // OS-specific detection
  const platform = process.platform;
  let chromePaths: string[] = [];

  if (platform === 'darwin') {
    // macOS
    chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  } else if (platform === 'linux') {
    // Linux
    chromePaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];
  } else if (platform === 'win32') {
    // Windows
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    chromePaths = [
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  }

  // Try to find an existing Chrome executable
  for (const chromePath of chromePaths) {
    if (fs.existsSync(chromePath)) {
      logger.info(`Found Chrome at: ${chromePath}`);
      return chromePath;
    }
  }

  // If no Chrome found, throw error with helpful message
  throw new Error(
    `Chrome executable not found. Please either:
    1. Install Google Chrome
    2. Set CHROME_EXECUTABLE_PATH environment variable to your Chrome executable path
    Tried paths: ${chromePaths.join(', ')}`
  );
}

/**
 * Opens a Chrome session using puppeteer-core
 * @returns Browser, page, and stop function
 */
async function openChromeSession(): Promise<BrowserSession> {
  const executablePath = getChromeExecutablePath();

  logger.info(`Launching Chrome from: ${executablePath}`);

  const browser = await launch({
    executablePath,
    headless: false, // Show browser in local development
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  logger.info('Chrome browser launched successfully');

  const stop = async (): Promise<void> => {
    try {
      logger.info('Stopping Chrome session');

      if (page) {
        try {
          await page.close();
        } catch (error) {
          logger.warn('Error closing page:', error);
        }
      }

      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          logger.warn('Error closing browser:', error);
        }
      }

      logger.info('Chrome session stopped');
    } catch (error) {
      logger.error('Error in Chrome stop function:', error);
      throw error;
    }
  };

  return {
    browser,
    page,
    stop,
  };
}

/**
 * Opens a browser session based on environment
 * - Local/Development: Uses Chrome directly
 * - Production/Staging: Uses GoLogin
 * @param options Optional GoLogin token and profile ID (required for GoLogin mode)
 * @returns Browser, page, and stop function
 */
export async function openBrowserSession(
  options?: BrowserSessionOptions
): Promise<BrowserSession> {
  if (shouldUseChrome()) {
    logger.info('Using Chrome for local development');
    return openChromeSession();
  } else {
    logger.info('Using GoLogin for development/production environment');

    if (!options?.gologinToken) {
      throw new Error('GOLOGIN_TOKEN environment variable is required for GoLogin mode');
    }

    if (!options?.profileId) {
      throw new Error('GoLogin profile ID is required for GoLogin mode');
    }

    const goLoginSession: GoLoginSession = await openGoLoginSession({
      gologinToken: options.gologinToken,
      profileId: options.profileId,
    });

    // Convert GoLoginSession to BrowserSession (they have the same interface)
    return {
      browser: goLoginSession.browser,
      page: goLoginSession.page,
      stop: goLoginSession.stop,
    };
  }
}

