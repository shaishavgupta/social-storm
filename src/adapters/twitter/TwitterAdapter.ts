
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
      await this.page.goto('https://twitter.com/login', { waitUntil: 'networkidle' });
      await humanDelay(2000);

      // Enter username
      if (credentials.username || credentials.email) {
        const username = credentials.username || credentials.email || '';
        await this.page.fill(twitterSelectors.usernameInput, username);
        await humanDelay(1000);
        await this.page.click(twitterSelectors.nextButton);
        await humanDelay(1500);
      }

      // Enter password
      if (credentials.password) {
        await this.page.fill(twitterSelectors.passwordInput, credentials.password);
        await humanDelay(1000);
        await this.page.click(twitterSelectors.loginSubmit);
        await this.page.waitForURL('**/home', { timeout: 30000 });
      }

      // If cookies/session data provided, use it
      if (credentials.cookies) {
        const cookies = JSON.parse(credentials.cookies);
        await this.context?.addCookies(cookies);
        await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle' });
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
      await this.page.goto(postUrl, { waitUntil: 'networkidle' });
      await humanDelay(2000);

      const likeButton = this.page.locator(twitterSelectors.likeButton).first();
      await this.humanMouseMove(this.page, twitterSelectors.likeButton);
      await humanDelay(500);
      await likeButton.click();
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
      await this.page.goto(postUrl, { waitUntil: 'networkidle' });
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
      await this.page.goto(postUrl, { waitUntil: 'networkidle' });
      await humanDelay(2000);

      // Click more options
      await this.page.click('div[data-testid="caret"]');
      await humanDelay(500);

      // Click report
      await this.page.click('span:has-text("Report")');
      await humanDelay(1000);

      // Select reason (simplified - actual flow is more complex)
      await this.page.click(`span:has-text("${reason}")`);
      await humanDelay(500);
      await this.page.click('div[role="button"]:has-text("Next")');
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
      await this.page.goto(commentUrl, { waitUntil: 'networkidle' });
      await humanDelay(2000);

      // Find the specific comment and like it
      const commentId = this.extractPostId(commentUrl);
      const commentLikeButton = this.page
        .locator(`article[data-testid="tweet"]:has([href*="${commentId}"])`)
        .locator(twitterSelectors.commentLikeButton)
        .first();

      await this.humanMouseMove(this.page, twitterSelectors.commentLikeButton);
      await humanDelay(500);
      await commentLikeButton.click();
      await humanDelay(1000);

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
      await this.page.goto(commentUrl, { waitUntil: 'networkidle' });
      await humanDelay(2000);

      const commentId = this.extractPostId(commentUrl);
      const commentReplyButton = this.page
        .locator(`article[data-testid="tweet"]:has([href*="${commentId}"])`)
        .locator(twitterSelectors.commentReplyButton)
        .first();

      await commentReplyButton.click();
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
      await this.page.goto('https://twitter.com/search', { waitUntil: 'networkidle' });
      await humanDelay(2000);

      await this.page.fill(twitterSelectors.searchInput, query);
      await this.page.keyboard.press('Enter');
      await this.page.waitForSelector(twitterSelectors.tweet, { timeout: 10000 });
      await humanDelay(2000);

      const tweets = await this.page.locator(twitterSelectors.tweet).all();
      const posts: Post[] = [];

      for (const tweet of tweets.slice(0, 10)) {
        try {
          const text = await tweet.locator(twitterSelectors.tweetText).textContent();
          const link = await tweet.locator('a[href*="/status/"]').first().getAttribute('href');
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
      await this.page.goto('https://twitter.com/logout', { waitUntil: 'networkidle' });
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

