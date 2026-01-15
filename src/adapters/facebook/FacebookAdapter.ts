
import { BaseAdapter } from '../base/BaseAdapter';
import {
  InteractionResult,
  Post,
} from '../interfaces/IPlatformAdapter';
import { SocialAccountCredentials } from '../../models/SocialAccount';
import { facebookSelectors } from './selectors';
import { logger } from '../../utils/logger';
import { humanDelay } from '../../utils/delay';

export class FacebookAdapter extends BaseAdapter {
  getHomeUrl(): string {
    return 'https://www.facebook.com';
  }

  async login(credentials: SocialAccountCredentials): Promise<void> {
    await this.initializeBrowser();
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      // Enter email/username
      if (credentials.email || credentials.username) {
        const email = credentials.email || credentials.username || '';
        await this.page.evaluate((sel, val) => {
          // @ts-expect-error - This code runs in browser context where document and DOM types exist
          const el = document.querySelector(sel);
          // @ts-expect-error - HTMLInputElement exists in browser context
          if (el && el instanceof HTMLInputElement) {
            el.value = '';
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, facebookSelectors.emailInput, email);
        await humanDelay(1000);
      }

      // Enter password
      if (credentials.password) {
        await this.page.evaluate((sel, val) => {
          // @ts-expect-error - This code runs in browser context where document and DOM types exist
          const el = document.querySelector(sel);
          // @ts-expect-error - HTMLInputElement exists in browser context
          if (el && el instanceof HTMLInputElement) {
            el.value = '';
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, facebookSelectors.passwordInput, credentials.password);
        await humanDelay(1000);
        const navigationPromise = this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
        await this.page.click(facebookSelectors.loginButton);
        await navigationPromise;
        // Check if we're on home page
        const url = this.page.url();
        if (!url.includes('/home')) {
          throw new Error('Login failed - did not navigate to home page');
        }
      }

      // If cookies/session data provided, use it
      if (credentials.cookies) {
        const cookies = JSON.parse(credentials.cookies);
        await this.page.setCookie(...cookies);
        await this.page.goto('https://www.facebook.com', { waitUntil: 'networkidle0' });
      }

      this.isAuthenticated = await this.isLoggedIn();
      if (!this.isAuthenticated) {
        throw new Error('Login failed - could not verify authentication');
      }

      logger.info('Facebook login successful');
    } catch (error) {
      logger.error('Facebook login failed:', error);
      throw error;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      const url = this.page.url();
      return url.includes('facebook.com') && !url.includes('/login');
    } catch {
      return false;
    }
  }

  async likePost(postUrl: string): Promise<InteractionResult> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto(postUrl, { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      await this.humanMouseMove(this.page, facebookSelectors.likeButton);
      await humanDelay(500);
      await this.page.click(facebookSelectors.likeButton);
      await humanDelay(1000);

      const postId = this.extractPostId(postUrl);

      return {
        success: true,
        entityId: postId,
        entityType: 'post',
        entityUrl: postUrl,
      };
    } catch (error) {
      logger.error('Failed to like post:', error);
      return {
        success: false,
        entityId: '',
        entityType: 'post',
        entityUrl: postUrl,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async commentOnPost(postUrl: string, comment: string): Promise<InteractionResult> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto(postUrl, { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      await this.page.click(facebookSelectors.commentButton);
      await humanDelay(1000);

      await this.humanType(this.page, facebookSelectors.composeTextarea, comment);
      await humanDelay(1000);

      await this.page.click(facebookSelectors.postButton);
      await humanDelay(2000);

      const postId = this.extractPostId(postUrl);

      return {
        success: true,
        entityId: postId,
        entityType: 'post',
        entityUrl: postUrl,
      };
    } catch (error) {
      logger.error('Failed to comment on post:', error);
      return {
        success: false,
        entityId: '',
        entityType: 'post',
        entityUrl: postUrl,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async reportPost(postUrl: string, reason: string): Promise<InteractionResult> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto(postUrl, { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      // Click more options
      await this.page.click('[aria-label*="More"]');
      await humanDelay(500);

      // Click report - use evaluate to find element with text
      await this.page.evaluate(() => {
        // @ts-expect-error - This code runs in browser context where document exists
        const spans = Array.from(document.querySelectorAll('span'));
        const reportSpan = spans.find((span: any) => span.textContent?.includes('Report'));
        if (reportSpan) {
          // @ts-expect-error - HTMLElement exists in browser context
          (reportSpan as HTMLElement).click();
        }
      });
      await humanDelay(1000);

      // Select reason
      await this.page.evaluate((reasonText) => {
        // @ts-expect-error - This code runs in browser context where document exists
        const spans = Array.from(document.querySelectorAll('span'));
        const reasonSpan = spans.find((span: any) => span.textContent?.includes(reasonText));
        if (reasonSpan) {
          // @ts-expect-error - HTMLElement exists in browser context
          (reasonSpan as HTMLElement).click();
        }
      }, reason);
      await humanDelay(500);
      await this.page.evaluate(() => {
        // @ts-expect-error - This code runs in browser context where document exists
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitButton = buttons.find((btn: any) => btn.textContent?.includes('Submit'));
        if (submitButton) {
          // @ts-expect-error - button elements have click method in browser context
          submitButton.click();
        }
      });
      await humanDelay(1000);

      const postId = this.extractPostId(postUrl);

      return {
        success: true,
        entityId: postId,
        entityType: 'post',
        entityUrl: postUrl,
      };
    } catch (error) {
      logger.error('Failed to report post:', error);
      return {
        success: false,
        entityId: '',
        entityType: 'post',
        entityUrl: postUrl,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async likeComment(commentUrl: string): Promise<InteractionResult> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto(commentUrl, { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      // Find the specific comment and like it
      const commentId = this.extractCommentId(commentUrl);
      // Find comment container with the comment ID using evaluate
      const commentContainerHandle = await this.page.evaluateHandle((commentId) => {
        // @ts-expect-error - This code runs in browser context where document exists
        const containers = Array.from(document.querySelectorAll('[data-testid="UFI2Comment/root"]'));
        return containers.find((container: any) => {
          const link = container.querySelector(`[href*="${commentId}"]`);
          return link !== null;
        });
      }, commentId);

      if (commentContainerHandle && commentContainerHandle.asElement()) {
        const commentLikeButton = await commentContainerHandle.asElement()?.$(facebookSelectors.commentLikeButton);
        if (commentLikeButton) {
          await this.humanMouseMove(this.page, facebookSelectors.commentLikeButton);
          await humanDelay(500);
          await commentLikeButton.click();
          await humanDelay(1000);
        }
        await commentContainerHandle.dispose();
      } else {
        // Fallback: try to click the like button directly
        await this.humanMouseMove(this.page, facebookSelectors.commentLikeButton);
        await humanDelay(500);
        await this.page.click(facebookSelectors.commentLikeButton);
        await humanDelay(1000);
      }

      return {
        success: true,
        entityId: commentId,
        entityType: 'comment',
        entityUrl: commentUrl,
      };
    } catch (error) {
      logger.error('Failed to like comment:', error);
      return {
        success: false,
        entityId: '',
        entityType: 'comment',
        entityUrl: commentUrl,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async replyToComment(commentUrl: string, replyText: string): Promise<InteractionResult> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto(commentUrl, { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      const commentId = this.extractCommentId(commentUrl);
      // Find comment container with the comment ID using evaluate
      const commentContainerHandle = await this.page.evaluateHandle((commentId) => {
        // @ts-expect-error - This code runs in browser context where document exists
        const containers = Array.from(document.querySelectorAll('[data-testid="UFI2Comment/root"]'));
        return containers.find((container: any) => {
          const link = container.querySelector(`[href*="${commentId}"]`);
          return link !== null;
        });
      }, commentId);

      if (commentContainerHandle && commentContainerHandle.asElement()) {
        const commentReplyButton = await commentContainerHandle.asElement()?.$(facebookSelectors.commentReplyButton);
        if (commentReplyButton) {
          await commentReplyButton.click();
        } else {
          await this.page.click(facebookSelectors.commentReplyButton);
        }
        await commentContainerHandle.dispose();
      } else {
        await this.page.click(facebookSelectors.commentReplyButton);
      }
      await humanDelay(1000);

      await this.humanType(this.page, facebookSelectors.composeTextarea, replyText);
      await humanDelay(1000);

      await this.page.click(facebookSelectors.postButton);
      await humanDelay(2000);

      return {
        success: true,
        entityId: commentId,
        entityType: 'comment',
        entityUrl: commentUrl,
        parentEntityId: commentId,
        parentEntityType: 'comment',
      };
    } catch (error) {
      logger.error('Failed to reply to comment:', error);
      return {
        success: false,
        entityId: '',
        entityType: 'comment',
        entityUrl: commentUrl,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async searchPosts(query: string): Promise<Post[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto('https://www.facebook.com/search/posts', { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      await this.page.evaluate((sel, val) => {
        // @ts-expect-error - This code runs in browser context where document and DOM types exist
        const el = document.querySelector(sel);
        // @ts-expect-error - HTMLInputElement exists in browser context
        if (el && el instanceof HTMLInputElement) {
          el.value = '';
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, facebookSelectors.searchInput, query);
      await this.page.keyboard.press('Enter');
      await this.page.waitForSelector(facebookSelectors.post, { timeout: 10000 });
      await humanDelay(2000);

      const posts = await this.page.$$(facebookSelectors.post);
      const postList: Post[] = [];

      for (const post of posts.slice(0, 10)) {
        try {
          const text = await post.$eval(facebookSelectors.postText, (el) => el.textContent || '');
          const linkElement = await post.$('a[href*="/posts/"]');
          const link = linkElement ? await linkElement.evaluate((el) => el.getAttribute('href')) : null;
          const postId = link ? this.extractPostId(`https://www.facebook.com${link}`) : '';

          if (text && postId) {
            postList.push({
              id: postId,
              url: `https://www.facebook.com${link}`,
              content: text,
            });
          }
        } catch (error) {
          logger.warn('Failed to extract post data:', error);
        }
      }

      return postList;
    } catch (error) {
      logger.error('Failed to search posts:', error);
      return [];
    }
  }

  async logout(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      await this.page.goto('https://www.facebook.com/logout', { waitUntil: 'networkidle0' });
      this.isAuthenticated = false;
      logger.info('Facebook logout successful');
    } catch (error) {
      logger.error('Facebook logout failed:', error);
    }
  }

  private extractPostId(url: string): string {
    const match = url.match(/\/posts\/([^/?]+)/);
    return match ? match[1] : '';
  }

  private extractCommentId(url: string): string {
    const match = url.match(/\/comment\/id\/([^/?]+)/);
    return match ? match[1] : '';
  }
}

