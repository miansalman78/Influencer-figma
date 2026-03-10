const User = require('../models/User');
const { updateSocialAccountToken, updateSocialAccountMetrics } = require('./socialHelpers');
const platformControllers = {
  instagram: require('../controllers/social/instagramController'),
  tiktok: require('../controllers/social/tiktokController'),
  youtube: require('../controllers/social/youtubeController'),
  twitter: require('../controllers/social/twitterController'),
  facebook: require('../controllers/social/facebookController')
};

// Check if metrics are stale (older than specified hours)
const isMetricsStale = (connectedAt, staleHours = 24) => {
  if (!connectedAt) return true;
  const hoursSinceSync = (Date.now() - new Date(connectedAt)) / (1000 * 60 * 60);
  return hoursSinceSync > staleHours;
};

// Sync metrics for a single platform (internal function, no response)
const syncPlatformMetrics = async (userId, platform, socialAccount) => {
  try {
    if (!socialAccount || !socialAccount.accessToken) {
      return { success: false, error: 'No access token' };
    }
    
    // Check if token is expired or about to expire and refresh if needed
    let accessToken = socialAccount.accessToken;
    const now = new Date();
    const expiresAt = socialAccount.tokenExpiresAt ? new Date(socialAccount.tokenExpiresAt) : null;
    
    // Improved proactive refresh: Refresh if expired or will expire within:
    // - 1 hour, OR
    // - 50% of token lifetime (whichever is more aggressive)
    let shouldRefresh = false;
    if (expiresAt) {
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      const isExpired = timeUntilExpiry <= 0;
      
      if (isExpired) {
        shouldRefresh = true;
      } else {
        // Calculate token lifetime (from connectedAt to expiresAt)
        const connectedAt = socialAccount.connectedAt ? new Date(socialAccount.connectedAt) : null;
        let tokenLifetime = null;
        
        if (connectedAt) {
          tokenLifetime = expiresAt.getTime() - connectedAt.getTime();
        }
        
        // Refresh if:
        // 1. Less than 1 hour remaining, OR
        // 2. Less than 50% of token lifetime remaining (if we know the lifetime)
        const oneHour = 60 * 60 * 1000;
        const fiftyPercentLifetime = tokenLifetime ? tokenLifetime * 0.5 : null;
        
        shouldRefresh = timeUntilExpiry < oneHour || 
                       (fiftyPercentLifetime && timeUntilExpiry < fiftyPercentLifetime);
      }
    }
    
    if (shouldRefresh) {
      const controller = platformControllers[platform];
      const needsRefreshToken = platform !== 'instagram' && platform !== 'facebook';
      
      if (needsRefreshToken && !socialAccount.refreshToken) {
        return { success: false, error: 'Token expired and no refresh token available' };
      }
      
      try {
        const refreshedToken = await controller.refreshToken(
          socialAccount.refreshToken || socialAccount.accessToken
        );
        accessToken = refreshedToken.accessToken;
        
        // Fetch updated profile to get verified status
        let verifiedStatus = socialAccount.verified || false;
        try {
          const profileData = await controller.fetchProfile(
            accessToken,
            socialAccount.instagramBusinessAccountId
          );
          verifiedStatus = profileData.verified || false;
        } catch (profileError) {
          // If profile fetch fails, keep existing verified status
          console.warn(`Failed to fetch profile for ${platform} during token refresh:`, profileError.message);
        }
        
        await updateSocialAccountToken(userId, platform, {
          accessToken: refreshedToken.accessToken,
          refreshToken: refreshedToken.refreshToken || socialAccount.refreshToken,
          tokenExpiresAt: refreshedToken.expiresAt,
          verified: verifiedStatus
        });
      } catch (refreshError) {
        return { success: false, error: `Token refresh failed: ${refreshError.message}` };
      }
    }
    
    const controller = platformControllers[platform];
    let metrics;
    if (platform === 'instagram') {
      metrics = await controller.fetchMetrics(
        accessToken,
        socialAccount.instagramBusinessAccountId
      );
    } else if (platform === 'facebook') {
      metrics = await controller.fetchMetrics(
        accessToken,
        socialAccount.platformUserId,
        socialAccount.facebookPageId || null,
        null
      );
    } else {
      metrics = await controller.fetchMetrics(
        accessToken,
        socialAccount.platformUserId
      );
    }
    
    // Update social account with latest metrics
    await updateSocialAccountMetrics(userId, platform, metrics);
    
    return { success: true, metrics };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Sync all platforms for a user (if stale)
const syncStaleMetrics = async (userId, staleHours = 24) => {
  // Explicitly select all accessToken and refreshToken fields for all platforms
  const user = await User.findById(userId).select('+socialAccounts.instagram.accessToken +socialAccounts.instagram.refreshToken +socialAccounts.tiktok.accessToken +socialAccounts.tiktok.refreshToken +socialAccounts.youtube.accessToken +socialAccounts.youtube.refreshToken +socialAccounts.twitter.accessToken +socialAccounts.twitter.refreshToken +socialAccounts.facebook.accessToken +socialAccounts.facebook.refreshToken');
  if (!user || !user.socialAccounts) {
    return { synced: [], failed: [] };
  }
  
  const synced = [];
  const failed = [];
  
  for (const [platform, socialAccount] of Object.entries(user.socialAccounts)) {
    if (!socialAccount || !socialAccount.accessToken) continue;
    
    // Check if metrics are stale
    if (isMetricsStale(socialAccount.connectedAt, staleHours)) {
      const result = await syncPlatformMetrics(userId, platform, socialAccount);
      if (result.success) {
        synced.push(platform);
      } else {
        failed.push({ platform, error: result.error });
      }
    }
  }
  
  return { synced, failed };
};

// Sync specific platform for a user
const syncPlatformForUser = async (userId, platform) => {
  // Explicitly select accessToken and refreshToken (they're hidden by default)
  const user = await User.findById(userId).select(`+socialAccounts.${platform}.accessToken +socialAccounts.${platform}.refreshToken`);
  if (!user || !user.socialAccounts || !user.socialAccounts[platform]) {
    return { success: false, error: 'Social account not found' };
  }
  
  return await syncPlatformMetrics(userId, platform, user.socialAccounts[platform]);
};

// Sync all users' social accounts (for background job)
const syncAllUsersSocialAccounts = async () => {
  const users = await User.find({
    'socialAccounts': { $exists: true, $ne: {} }
  }).select('_id socialAccounts');
  
  const results = {
    total: users.length,
    synced: 0,
    failed: 0,
    errors: []
  };
  
  for (const user of users) {
    try {
      const result = await syncStaleMetrics(user._id, 3); // Sync if older than 3 hours
      if (result.synced.length > 0) {
        results.synced += result.synced.length;
      }
      if (result.failed.length > 0) {
        results.failed += result.failed.length;
        results.errors.push(...result.failed);
      }
    } catch (error) {
      results.failed++;
      results.errors.push({ userId: user._id, error: error.message });
    }
  }
  
  return results;
};

module.exports = {
  isMetricsStale,
  syncPlatformMetrics,
  syncStaleMetrics,
  syncPlatformForUser,
  syncAllUsersSocialAccounts
};
