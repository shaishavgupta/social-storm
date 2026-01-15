
import { BaseAdapter } from '../base/BaseAdapter';
import {
  InteractionResult,
  Post,
} from '../interfaces/IPlatformAdapter';
import { SocialAccountCredentials } from '../../models/SocialAccount';
import { twitterSelectors } from './selectors';
import { logger } from '../../utils/logger';
import { humanDelay } from '../../utils/delay';

export class TwitterAdapter extends BaseAdapter {
  getHomeUrl(): string {
    return 'https://twitter.com/home';
  }

  async login(credentials: SocialAccountCredentials): Promise<void> {
    await this.initializeBrowser();
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      await this.page.goto('https://twitter.com/login', { waitUntil: 'networkidle0' });
      await humanDelay(2000);

      // Enter username
      if (credentials.username || credentials.email) {
        const username = credentials.username || credentials.email || '';
        await this.page.evaluate((sel, val) => {
          // @ts-expect-error - This code runs in browser context where document and DOM types exist
          const el = document.querySelector(sel);
          // @ts-expect-error - HTMLInputElement exists in browser context
          if (el && el instanceof HTMLInputElement) {
            el.value = '';
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, twitterSelectors.usernameInput, username);
        await humanDelay(1000);
        // Click "Next" button by text content (Puppeteer doesn't support :has-text() selector)
        await this.clickElementByText(this.page, twitterSelectors.buttonBase, 'Next');
        await humanDelay(1500);
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
        }, twitterSelectors.passwordInput, credentials.password);
        await humanDelay(1000);
        const navigationPromise = this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
        // Click "Log in" button by text content (Puppeteer doesn't support :has-text() selector)
        await this.clickElementByText(this.page, twitterSelectors.buttonBase, 'Log in');
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
        await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle0' });
      }

      this.isAuthenticated = await this.isLoggedIn();
      if (!this.isAuthenticated) {
        throw new Error('Login failed - could not verify authentication');
      }

      logger.info('Twitter login successful');
    } catch (error) {
      logger.error('Twitter login failed:', error);
      throw error;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      const url = this.page.url();
      return url.includes('twitter.com') && !url.includes('/login');
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

      await this.humanMouseMove(this.page, twitterSelectors.likeButton);
      await humanDelay(500);
      await this.page.click(twitterSelectors.likeButton);
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

      await this.page.click(twitterSelectors.replyButton);
      await humanDelay(1000);

      await this.humanType(this.page, twitterSelectors.composeTextarea, comment);
      await humanDelay(1000);

      await this.page.click(twitterSelectors.tweetButton);
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
      await this.page.click('div[data-testid="caret"]');
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

      // Select reason (simplified - actual flow is more complex)
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
        const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
        const nextButton = buttons.find((btn: any) => btn.textContent?.includes('Next'));
        if (nextButton) {
          // @ts-expect-error - button elements have click method in browser context
          nextButton.click();
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
      const commentId = this.extractPostId(commentUrl);
      // Find tweet article with the comment ID using evaluate
      const tweetArticleHandle = await this.page.evaluateHandle((commentId) => {
        // @ts-expect-error - This code runs in browser context where document exists
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        return articles.find((article: any) => {
          const link = article.querySelector(`[href*="${commentId}"]`);
          return link !== null;
        });
      }, commentId);

      if (tweetArticleHandle && tweetArticleHandle.asElement()) {
        const commentLikeButton = await tweetArticleHandle.asElement()?.$(twitterSelectors.commentLikeButton);
        if (commentLikeButton) {
          await this.humanMouseMove(this.page, twitterSelectors.commentLikeButton);
          await humanDelay(500);
          await commentLikeButton.click();
          await humanDelay(1000);
        }
        await tweetArticleHandle.dispose();
      } else {
        // Fallback: try to click the like button directly
        await this.humanMouseMove(this.page, twitterSelectors.commentLikeButton);
        await humanDelay(500);
        await this.page.click(twitterSelectors.commentLikeButton);
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

      const commentId = this.extractPostId(commentUrl);
      // Find tweet article with the comment ID using evaluate
      const tweetArticleHandle = await this.page.evaluateHandle((commentId) => {
        // @ts-expect-error - This code runs in browser context where document exists
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        return articles.find((article: any) => {
          const link = article.querySelector(`[href*="${commentId}"]`);
          return link !== null;
        });
      }, commentId);

      if (tweetArticleHandle && tweetArticleHandle.asElement()) {
        const commentReplyButton = await tweetArticleHandle.asElement()?.$(twitterSelectors.commentReplyButton);
        if (commentReplyButton) {
          await commentReplyButton.click();
        } else {
          await this.page.click(twitterSelectors.commentReplyButton);
        }
        await tweetArticleHandle.dispose();
      } else {
        await this.page.click(twitterSelectors.commentReplyButton);
      }
      await humanDelay(1000);

      await this.humanType(this.page, twitterSelectors.composeTextarea, replyText);
      await humanDelay(1000);

      await this.page.click(twitterSelectors.tweetButton);
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
      await this.page.goto('https://twitter.com/search', { waitUntil: 'networkidle0' });
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
      }, twitterSelectors.searchInput, query);
      await this.page.keyboard.press('Enter');
      await this.page.waitForSelector(twitterSelectors.tweet, { timeout: 10000 });
      await humanDelay(2000);

      const tweets = await this.page.$$(twitterSelectors.tweet);
      const posts: Post[] = [];

      for (const tweet of tweets.slice(0, 10)) {
        try {
          const text = await tweet.$eval(twitterSelectors.tweetText, (el) => el.textContent || '');
          const linkElement = await tweet.$('a[href*="/status/"]');
          const link = linkElement ? await linkElement.evaluate((el) => el.getAttribute('href')) : null;
          const postId = link ? this.extractPostId(`https://twitter.com${link}`) : '';

          if (text && postId) {
            posts.push({
              id: postId,
              url: `https://twitter.com${link}`,
              content: text,
            });
          }
        } catch (error) {
          logger.warn('Failed to extract tweet data:', error);
        }
      }

      return posts;
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
      await this.page.goto('https://twitter.com/logout', { waitUntil: 'networkidle0' });
      this.isAuthenticated = false;
      logger.info('Twitter logout successful');
    } catch (error) {
      logger.error('Twitter logout failed:', error);
    }
  }

  private extractPostId(url: string): string {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : '';
  }
}

