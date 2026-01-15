
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
      await this.page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle' });
      await humanDelay(2000);

      // Enter email/username
      if (credentials.email || credentials.username) {
        const email = credentials.email || credentials.username || '';
        await this.page.fill(facebookSelectors.emailInput, email);
        await humanDelay(1000);
      }

      // Enter password
      if (credentials.password) {
        await this.page.fill(facebookSelectors.passwordInput, credentials.password);
        await humanDelay(1000);
        await this.page.click(facebookSelectors.loginButton);
        await this.page.waitForURL('**/home**', { timeout: 30000 });
      }

      // If cookies/session data provided, use it
      if (credentials.cookies) {
        const cookies = JSON.parse(credentials.cookies);
        await this.context?.addCookies(cookies);
        await this.page.goto('https://www.facebook.com', { waitUntil: 'networkidle' });
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
      await this.page.goto(postUrl, { waitUntil: 'networkidle' });
      await humanDelay(2000);

      const likeButton = this.page.locator(facebookSelectors.likeButton).first();
      await this.humanMouseMove(this.page, facebookSelectors.likeButton);
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
      await this.page.goto(postUrl, { waitUntil: 'networkidle' });
      await humanDelay(2000);

      // Click more options
      await this.page.click('[aria-label*="More"]');
      await humanDelay(500);

      // Click report
      await this.page.click('span:has-text("Report")');
      await humanDelay(1000);

      // Select reason
      await this.page.click(`span:has-text("${reason}")`);
      await humanDelay(500);
      await this.page.click('button:has-text("Submit")');
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
      const commentId = this.extractCommentId(commentUrl);
      const commentLikeButton = this.page
        .locator(`[data-testid="UFI2Comment/root"]:has([href*="${commentId}"])`)
        .locator(facebookSelectors.commentLikeButton)
        .first();

      await this.humanMouseMove(this.page, facebookSelectors.commentLikeButton);
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

      const commentId = this.extractCommentId(commentUrl);
      const commentReplyButton = this.page
        .locator(`[data-testid="UFI2Comment/root"]:has([href*="${commentId}"])`)
        .locator(facebookSelectors.commentReplyButton)
        .first();

      await commentReplyButton.click();
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
      await this.page.goto('https://www.facebook.com/search/posts', { waitUntil: 'networkidle' });
      await humanDelay(2000);

      await this.page.fill(facebookSelectors.searchInput, query);
      await this.page.keyboard.press('Enter');
      await this.page.waitForSelector(facebookSelectors.post, { timeout: 10000 });
      await humanDelay(2000);

      const posts = await this.page.locator(facebookSelectors.post).all();
      const postList: Post[] = [];

      for (const post of posts.slice(0, 10)) {
        try {
          const text = await post.locator(facebookSelectors.postText).textContent();
          const link = await post.locator('a[href*="/posts/"]').first().getAttribute('href');
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
      await this.page.goto('https://www.facebook.com/logout', { waitUntil: 'networkidle' });
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

