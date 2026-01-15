/**
 * Twitter/X selectors
 * Note: These selectors may need to be updated as Twitter changes their UI
 */
export const twitterSelectors = {
  // Login
  loginButton: 'a[href="/i/flow/login"]',
  usernameInput: 'input[autocomplete="username"]',
  passwordInput: 'input[name="password"]',
  // Note: nextButton and loginSubmit use text-based selection via clickElementByText helper
  // Base selector for buttons with text content
  buttonBase: 'div[role="button"]',

  // Navigation
  homeButton: 'a[href="/home"]',
  searchInput: 'input[data-testid="SearchBox_Search_Input"]',

  // Post interactions
  likeButton: 'div[data-testid="like"]',
  retweetButton: 'div[data-testid="retweet"]',
  replyButton: 'div[data-testid="reply"]',
  bookmarkButton: 'div[data-testid="bookmark"]',

  // Comment interactions
  commentLikeButton: 'div[data-testid="like"]',
  commentReplyButton: 'div[data-testid="reply"]',

  // Post content
  tweetText: 'div[data-testid="tweetText"]',
  tweet: 'article[data-testid="tweet"]',

  // Comment content
  comment: 'article[data-testid="tweet"]',
  commentText: 'div[data-testid="tweetText"]',

  // Compose
  composeTextarea: 'div[data-testid="tweetTextarea_0"]',
  tweetButton: 'div[data-testid="tweetButton"]',

  // Search results
  searchResults: 'div[data-testid="cellInnerDiv"]',

  // User profile
  followButton: 'div[data-testid*="follow"]',

  // General
  loading: '[data-testid="loading"]',
  error: '[data-testid="error"]',
};

