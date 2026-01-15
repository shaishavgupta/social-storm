/**
 * Facebook selectors
 * Note: These selectors may need to be updated as Facebook changes their UI
 */
export const facebookSelectors = {
  // Login
  emailInput: 'input[type="email"], input[name="email"], input[id="email"]',
  passwordInput: 'input[type="password"], input[name="pass"]',
  loginButton: 'button[type="submit"], button[name="login"]',

  // Navigation
  homeButton: 'a[href*="/home"]',
  searchInput: 'input[placeholder*="Search"], input[type="search"]',

  // Post interactions
  likeButton: '[aria-label*="Like"], [aria-label*="like"]',
  commentButton: '[aria-label*="Comment"], [aria-label*="comment"]',
  shareButton: '[aria-label*="Share"], [aria-label*="share"]',

  // Comment interactions
  commentLikeButton: '[aria-label*="Like"], [aria-label*="like"]',
  commentReplyButton: '[aria-label*="Reply"], [aria-label*="reply"]',

  // Post content
  post: '[role="article"]',
  postText: '[data-ad-preview="message"]',

  // Comment content
  comment: '[data-testid="UFI2Comment/root"]',
  commentText: '[data-ad-preview="message"]',

  // Compose
  composeTextarea: '[contenteditable="true"][role="textbox"]',
  postButton: '[aria-label*="Post"], button[type="submit"]',

  // Search results
  searchResults: '[role="article"]',

  // User profile
  followButton: '[aria-label*="Follow"]',

  // General
  loading: '[role="progressbar"]',
  error: '[role="alert"]',
};

