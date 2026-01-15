import { Page } from 'playwright';
import { getActionLogService } from '../services/ActionLogService';
import { ActionType } from '../models/ActionLog';
import { logger } from './logger';

export interface ActionLogContext {
  sessionId: number;
  profileId?: number;
  socialAccountId: number;
  logAction: (params: {
    actionType: ActionType;
    target?: string;
    url?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

/**
 * Creates an action logging context for a session
 */
export function createActionLogContext(
  sessionId: number,
  profileId: number | undefined,
  socialAccountId: number
): ActionLogContext {
  const actionLogService = getActionLogService();

  const logAction = async (params: {
    actionType: ActionType;
    target?: string;
    url?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> => {
    try {
      await actionLogService.logAction({
        sessionId,
        profileId,
        socialAccountId,
        ...params,
      });
    } catch (error) {
      // Don't throw - logging failures shouldn't break the flow
      logger.warn('Failed to log action:', error);
    }
  };

  return {
    sessionId,
    profileId,
    socialAccountId,
    logAction,
  };
}

/**
 * Logged version of page.goto()
 */
export async function loggedGoto(
  page: Page,
  url: string,
  options: Parameters<Page['goto']>[1],
  logContext: ActionLogContext
): Promise<void> {
  await page.goto(url, options);
  await logContext.logAction({
    actionType: 'NAVIGATE',
    url: page.url(),
    metadata: {
      targetUrl: url,
      finalUrl: page.url(),
      options,
    },
  });
}

/**
 * Logged version of page.click()
 */
export async function loggedClick(
  page: Page,
  selector: string,
  logContext: ActionLogContext
): Promise<void> {
  await page.click(selector);
  await logContext.logAction({
    actionType: 'CLICK',
    target: selector,
    url: page.url(),
  });
}

/**
 * Logged version of page.fill() or page.type()
 * Logs only the length of text, not the actual content
 */
export async function loggedType(
  page: Page,
  selector: string,
  text: string,
  logContext: ActionLogContext
): Promise<void> {
  await page.fill(selector, text);
  await logContext.logAction({
    actionType: 'TYPE',
    target: selector,
    url: page.url(),
    metadata: {
      textLength: text.length,
      // Don't log actual text content for security
    },
  });
}

/**
 * Logged version of page.waitForTimeout()
 */
export async function loggedWaitForTimeout(
  page: Page,
  timeout: number,
  logContext: ActionLogContext
): Promise<void> {
  await page.waitForTimeout(timeout);
  await logContext.logAction({
    actionType: 'WAIT',
    url: page.url(),
    metadata: {
      timeout,
      waitType: 'timeout',
    },
  });
}

/**
 * Logged version of page.waitForSelector()
 */
export async function loggedWaitForSelector(
  page: Page,
  selector: string,
  options?: Parameters<Page['waitForSelector']>[1],
  logContext?: ActionLogContext
): Promise<void> {
  await page.waitForSelector(selector);
  if (logContext) {
    await logContext.logAction({
      actionType: 'WAIT',
      target: selector,
      url: page.url(),
      metadata: {
        waitType: 'selector',
        options,
      },
    });
  }
}

/**
 * Logged version of page.screenshot()
 */
export async function loggedScreenshot(
  page: Page,
  options?: Parameters<Page['screenshot']>[0],
  logContext?: ActionLogContext
): Promise<Buffer> {
  const screenshot = await page.screenshot(options);
  if (logContext) {
    await logContext.logAction({
      actionType: 'SCREENSHOT',
      url: page.url(),
      metadata: {
        options,
      },
    });
  }
  return screenshot;
}

/**
 * Logs a custom action
 */
export async function logCustomAction(
  logContext: ActionLogContext,
  actionName: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logContext.logAction({
    actionType: 'CUSTOM',
    metadata: {
      actionName,
      ...metadata,
    },
  });
}

/**
 * Logs a scroll action
 */
export async function loggedScroll(
  page: Page,
  logContext: ActionLogContext,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logContext.logAction({
    actionType: 'SCROLL',
    url: page.url(),
    metadata,
  });
}

