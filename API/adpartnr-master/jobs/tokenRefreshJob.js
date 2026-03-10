const cron = require('node-cron');
const User = require('../models/User');
const { updateSocialAccountToken } = require('../utils/socialHelpers');

const platformControllers = {
  instagram: require('../controllers/social/instagramController'),
  tiktok: require('../controllers/social/tiktokController'),
  youtube: require('../controllers/social/youtubeController'),
  twitter: require('../controllers/social/twitterController'),
  facebook: require('../controllers/social/facebookController')
};

// Refresh tokens for all users (dedicated job - doesn't fetch metrics)
const refreshAllTokens = async () => {
  // Select users with social accounts; include hidden token fields via +path (omit parent to avoid path collision)
  const users = await User.find({
    'socialAccounts': { $exists: true, $ne: {} }
  }).select(
    '+socialAccounts.instagram.accessToken +socialAccounts.instagram.refreshToken' +
    ' +socialAccounts.tiktok.accessToken +socialAccounts.tiktok.refreshToken' +
    ' +socialAccounts.youtube.accessToken +socialAccounts.youtube.refreshToken' +
    ' +socialAccounts.twitter.accessToken +socialAccounts.twitter.refreshToken' +
    ' +socialAccounts.facebook.accessToken +socialAccounts.facebook.refreshToken'
  );

  const results = {
    total: 0,
    refreshed: 0,
    failed: 0,
    errors: []
  };

  const platforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];

  for (const user of users) {
    if (!user.socialAccounts) continue;

    for (const platform of platforms) {
      const socialAccount = user.socialAccounts[platform];
      if (!socialAccount || !socialAccount.accessToken) continue;

      results.total++;

      try {
        const now = new Date();
        const expiresAt = socialAccount.tokenExpiresAt ? new Date(socialAccount.tokenExpiresAt) : null;

        if (!expiresAt) continue; // Skip if no expiration date

        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        const isExpired = timeUntilExpiry <= 0;

        // Only refresh if expired or will expire within 1 hour
        if (isExpired || timeUntilExpiry < (60 * 60 * 1000)) {
          const controller = platformControllers[platform];
          const needsRefreshToken = platform !== 'instagram' && platform !== 'facebook';

          // Instagram and Facebook don't have refresh tokens - they use long-lived tokens
          // For these, we can't refresh, so skip
          if (needsRefreshToken && !socialAccount.refreshToken) {
            results.failed++;
            results.errors.push({
              userId: user._id,
              platform,
              error: 'No refresh token available'
            });
            continue;
          }

          // For Instagram/Facebook, tokens are long-lived (60 days) and can't be refreshed
          // They need to be reconnected after expiration
          if (!needsRefreshToken) {
            // These platforms use long-lived tokens that can't be refreshed
            // If expired, user needs to reconnect
            if (isExpired) {
              results.failed++;
              results.errors.push({
                userId: user._id,
                platform,
                error: 'Long-lived token expired - user needs to reconnect'
              });
            }
            continue;
          }

          // Refresh the token
          const refreshedToken = await controller.refreshToken(
            socialAccount.refreshToken || socialAccount.accessToken
          );

          // Fetch updated profile to get verified status
          let verifiedStatus = socialAccount.verified || false;
          try {
            const profileData = await controller.fetchProfile(
              refreshedToken.accessToken,
              socialAccount.instagramBusinessAccountId
            );
            verifiedStatus = profileData.verified || false;
          } catch (profileError) {
            // If profile fetch fails, keep existing verified status
            console.warn(`Failed to fetch profile for ${platform} during token refresh:`, profileError.message);
          }

          await updateSocialAccountToken(user._id, platform, {
            accessToken: refreshedToken.accessToken,
            refreshToken: refreshedToken.refreshToken || socialAccount.refreshToken,
            tokenExpiresAt: refreshedToken.expiresAt,
            verified: verifiedStatus
          });

          results.refreshed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          userId: user._id,
          platform,
          error: `Token refresh failed: ${error.message}`
        });
      }
    }
  }

  return results;
};

// Schedule: Run every hour at minute 0
// Format: minute hour day month day-of-week
// '0 * * * *' = every hour
const schedule = process.env.TOKEN_REFRESH_SCHEDULE || '0 * * * *';

let jobRunning = false;

const runTokenRefreshJob = async () => {
  if (jobRunning) {
    console.log('Token refresh job already running, skipping...');
    return;
  }

  jobRunning = true;
  console.log(`[${new Date().toISOString()}] Starting token refresh job...`);

  try {
    const results = await refreshAllTokens();
    console.log(`[${new Date().toISOString()}] Token refresh job completed:`, {
      total: results.total,
      refreshed: results.refreshed,
      failed: results.failed
    });

    if (results.errors.length > 0) {
      console.error('Token refresh errors:', results.errors.slice(0, 10)); // Log first 10 errors
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Token refresh job failed:`, error.message);
  } finally {
    jobRunning = false;
  }
};

// Start the scheduled job
const startTokenRefreshJob = () => {
  console.log(`Token refresh job scheduled: ${schedule}`);
  cron.schedule(schedule, runTokenRefreshJob, {
    scheduled: true,
    timezone: 'UTC'
  });
};

// Manual trigger (for testing)
const triggerTokenRefreshJob = async () => {
  await runTokenRefreshJob();
};

module.exports = {
  startTokenRefreshJob,
  triggerTokenRefreshJob,
  runTokenRefreshJob
};

