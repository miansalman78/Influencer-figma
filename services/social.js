import { apiRequest } from './api';

/**
 * Social Media Services
 * Handles social media platform connection (OAuth) and metrics syncing
 */

// ============================================
// Instagram
// ============================================

/**
 * Initiate Instagram OAuth connection
 * @param {string} deepLink - Mobile app deep link for callback (e.g., 'adpartnr://social/callback')
 * @returns {Promise} OAuth URL and state token
 */
export const connectInstagram = async (deepLink = 'adpartnr://social/callback') => {
  return apiRequest('/social/connect/instagram', {
    method: 'POST',
    body: { deepLink },
  });
};

/**
 * Sync Instagram metrics (followers, engagement, etc.)
 * Call after Instagram connection is established
 * @returns {Promise} Synced metrics data
 */
export const syncInstagram = async () => {
  return apiRequest('/social/sync/instagram', {
    method: 'POST',
  });
};

// ============================================
// Facebook
// ============================================

/**
 * Initiate Facebook OAuth connection
 * @param {string} deepLink - Mobile app deep link for callback
 * @returns {Promise} OAuth URL and state token
 */
export const connectFacebook = async (deepLink = 'adpartnr://social/callback') => {
  return apiRequest('/social/connect/facebook', {
    method: 'POST',
    body: { deepLink },
  });
};

/**
 * Sync Facebook metrics
 * Call after Facebook connection is established
 * @returns {Promise} Synced metrics data
 */
export const syncFacebook = async () => {
  return apiRequest('/social/sync/facebook', {
    method: 'POST',
  });
};

/**
 * List Facebook Pages available for the connected account
 * @returns {Promise<{pages: Array<{id: string, name: string, followersCount: number}>}>}
 */
export const getFacebookPages = async () => {
  return apiRequest('/social/facebook/pages', {
    method: 'GET',
  });
};

/**
 * Select a specific Facebook Page to bind to this account
 * @param {string} pageId
 * @returns {Promise}
 */
export const selectFacebookPage = async (pageId) => {
  return apiRequest('/social/facebook/select-page', {
    method: 'POST',
    body: { pageId },
  });
};

// ============================================
// TikTok
// ============================================

/**
 * Initiate TikTok OAuth connection
 * @param {string} deepLink - Mobile app deep link for callback
 * @returns {Promise} OAuth URL and state token
 */
export const connectTikTok = async (deepLink = 'adpartnr://social/callback') => {
  return apiRequest('/social/connect/tiktok', {
    method: 'POST',
    body: { deepLink },
  });
};

/**
 * Sync TikTok metrics
 * Call after TikTok connection is established
 * @returns {Promise} Synced metrics data
 */
export const syncTikTok = async () => {
  return apiRequest('/social/sync/tiktok', {
    method: 'POST',
  });
};

// ============================================
// Twitter
// ============================================

/**
 * Initiate Twitter OAuth connection
 * @param {string} deepLink - Mobile app deep link for callback
 * @returns {Promise} OAuth URL and state token
 */
export const connectTwitter = async (deepLink = 'adpartnr://social/callback') => {
  return apiRequest('/social/connect/twitter', {
    method: 'POST',
    body: { deepLink },
  });
};

/**
 * Sync Twitter metrics
 * Call after Twitter connection is established
 * @returns {Promise} Synced metrics data
 */
export const syncTwitter = async () => {
  return apiRequest('/social/sync/twitter', {
    method: 'POST',
  });
};

// ============================================
// YouTube
// ============================================

/**
 * Initiate YouTube OAuth connection
 * @param {string} deepLink - Mobile app deep link for callback
 * @returns {Promise} OAuth URL and state token
 */
export const connectYouTube = async (deepLink = 'adpartnr://social/callback') => {
  return apiRequest('/social/connect/youtube', {
    method: 'POST',
    body: { deepLink },
  });
};

/**
 * Sync YouTube metrics
 * Call after YouTube connection is established
 * @returns {Promise} Synced metrics data
 */
export const syncYouTube = async () => {
  return apiRequest('/social/sync/youtube', {
    method: 'POST',
  });
};

// ============================================
// OAuth Callback Handling
// ============================================

/**
 * Handle OAuth callback after user authenticates on platform
 * This endpoint is called by the backend after OAuth redirect
 * Frontend should use deep linking to detect when user returns from OAuth flow
 * @param {string} platform - Platform name ('instagram', 'facebook', 'tiktok', 'twitter')
 * @param {string} code - OAuth authorization code
 * @param {string} state - OAuth state token (for security)
 * @returns {Promise} Connection status
 * 
 * Note: This is typically handled by backend automatically via redirect URL.
 * Frontend should listen for deep link and check connection status via getMyProfile()
 */
export const handleOAuthCallback = async (platform, code, state) => {
  // This is informational - backend handles the callback automatically
  // Frontend should verify connection by calling getMyProfile() after deep link
  console.log(`[Social] OAuth callback received for ${platform}`);
  // Return connection status check
  const userService = await import('./user');
  return userService.getMyProfile();
};

// ============================================
// Generic Helper Functions
// ============================================

/**
 * Get OAuth connection URL for a platform
 * @param {string} platform - Platform name ('instagram', 'facebook', 'tiktok', 'twitter')
 * @param {string} deepLink - Mobile app deep link for callback
 * @returns {Promise} OAuth URL
 */
export const connectSocialPlatform = async (platform, deepLink) => {
  const platformMap = {
    instagram: connectInstagram,
    facebook: connectFacebook,
    tiktok: connectTikTok,
    twitter: connectTwitter,
    youtube: connectYouTube,
  };

  const connectFunction = platformMap[platform.toLowerCase()];
  if (!connectFunction) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return connectFunction(deepLink);
};

/**
 * Sync metrics for a platform
 * @param {string} platform - Platform name ('instagram', 'facebook', 'tiktok', 'twitter')
 * @returns {Promise} Synced metrics data
 */
export const syncSocialPlatform = async (platform) => {
  const platformMap = {
    instagram: syncInstagram,
    facebook: syncFacebook,
    tiktok: syncTikTok,
    twitter: syncTwitter,
    youtube: syncYouTube,
  };

  const syncFunction = platformMap[platform.toLowerCase()];
  if (!syncFunction) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return syncFunction();
};

// ============================================
// Manual Social Media Updates
// ============================================

/**
 * Scrape follower count and engagement rate for onboarding
 * @param {string} platform - 'instagram', 'facebook', 'tiktok', 'twitter', 'youtube'
 * @param {string} usernameOrUrl - The handle or profile link
 * @returns {Promise} Scraped data { followers_count, engagement_rate, verified }
 */
export const scrapeFollowers = async (platform, usernameOrUrl) => {
  return apiRequest('/onboarding/scrape-followers', {
    method: 'POST',
    body: { platform, usernameOrUrl },
  });
};

/**
 * Update social media account details manually
 * @param {Object} data - { platform, username, followers, etc. }
 * @returns {Promise} Updated account data
 */
export const updateSocialMedia = async (data) => {
  return apiRequest('/user/profile/social-media', {
    method: 'PUT',
    body: data,
  });
};

// ============================================
// Profile URL
// ============================================

/**
 * Get the external profile/page URL for a connected platform
 * @param {string} platform
 * @returns {Promise<{profileUrl: string}>}
 */
export const getProfileUrl = async (platform) => {
  return apiRequest(`/social/profile-url/${platform}`, {
    method: 'GET',
  });
};

