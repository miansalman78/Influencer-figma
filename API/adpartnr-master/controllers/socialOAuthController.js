const User = require('../models/User');
const axios = require('axios');
const { successResponse, errorResponse } = require('../utils/response');
const { validatePlatform, generateState, verifyState, saveSocialAccountWithTokens, updateSocialAccountToken, updateSocialAccountMetrics, buildProfileUrl } = require('../utils/socialHelpers');

// Platform-specific controllers
const instagramController = require('./social/instagramController');
const tiktokController = require('./social/tiktokController');
const youtubeController = require('./social/youtubeController');
const twitterController = require('./social/twitterController');
const facebookController = require('./social/facebookController');

// Platform controller map
const platformControllers = {
  instagram: instagramController,
  tiktok: tiktokController,
  youtube: youtubeController,
  twitter: twitterController,
  facebook: facebookController
};

// Initiate OAuth flow - Get authorization URL
const initiateOAuth = async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user._id;
    const { deepLink } = req.body; // Accept deepLink from request body (for mobile apps)

    validatePlatform(platform);

    // Include deepLink in state if provided (for mobile app redirects)
    const state = generateState(userId, platform, deepLink || null);
    const controller = platformControllers[platform];
    const authUrl = controller.generateAuthUrl(state, req);

    return successResponse(res, {
      authUrl,
      platform,
      state
    }, 'OAuth flow initiated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

// Handle OAuth callback
const handleOAuthCallback = async (req, res) => {
  try {
    const { platform } = req.params;
    let { code, state, error } = req.query;

    if (error) {
      return errorResponse(res, `OAuth error: ${error}`, 400);
    }

    if (!code) {
      return errorResponse(res, 'Authorization code is required', 400);
    }

    validatePlatform(platform);

    // Decode URL-encoded state parameter (Facebook URL-encodes it)
    if (state) {
      state = decodeURIComponent(state);
      // Remove Facebook's #_=_ fragment if present
      state = state.split('#')[0];
    }

    if (!state) {
      return errorResponse(res, 'State parameter is required', 400);
    }

    // Verify state
    const stateData = verifyState(state);
    if (!stateData) {
      console.error('State verification failed. State received:', state);
      console.error('State length:', state?.length);
      return errorResponse(res, 'Invalid state parameter. The OAuth flow may have expired or been tampered with. Please try again.', 400);
    }

    const { userId, deepLink } = stateData;
    const controller = platformControllers[platform];

    // Use backend URL from environment variable (required for Facebook OAuth)
    // Ensure HTTPS is used for all OAuth redirect URIs
    const { ensureHttpsBackendUrl } = require('../utils/socialHelpers');
    const backendUrl = ensureHttpsBackendUrl(req);
    const redirectUri = `${backendUrl}/api/social/callback/${platform}`;

    // Log for debugging (remove in production)
    console.log('OAuth callback redirect URI:', redirectUri);

    // Exchange code for access token
    const tokenData = await controller.exchangeToken(code, redirectUri, state);

    // Fetch user profile from platform
    // Pass pageId for Facebook (from Business Login selection)
    const profileData = await controller.fetchProfile(
      tokenData.accessToken,
      tokenData.instagramBusinessAccountId || null,
      tokenData.pageId || null // Pass pageId for Facebook Business Login
    );

    // Save social account with tokens
    const saveOptions = {
      username: profileData.username,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      tokenExpiresAt: tokenData.expiresAt,
      platformUserId: profileData.userId,
      followers: profileData.followers || 0,
      engagement: profileData.engagement || 0,
      verified: profileData.verified || false
    };

    // Correctly attribute Page ID based on platform
    if (platform === 'instagram') {
      saveOptions.instagramBusinessAccountId = tokenData.instagramBusinessAccountId;
      saveOptions.facebookPageId = tokenData.facebookPageId;
    } else if (platform === 'facebook') {
      saveOptions.facebookPageId = tokenData.facebookPageId || tokenData.pageId;
    }

    await saveSocialAccountWithTokens(userId, platform, saveOptions);

    // Immediately sync metrics once after connection so the user sees data right away.
    // We still keep the background job for periodic refresh.
    try {
      const { syncPlatformForUser } = require('../utils/socialSyncHelpers');
      const syncResult = await syncPlatformForUser(userId, platform);
      if (syncResult.success) {
        console.log(`Successfully synced metrics for ${platform} right after connection`);
      } else {
        console.error(`Initial metrics sync failed for ${platform}:`, syncResult.error);
      }
    } catch (syncError) {
      console.error(`Error during initial metrics sync for ${platform}:`, syncError.message);
      console.error('Full error:', syncError);
      // Do not fail the connection if metrics sync fails
    }

    // Determine redirect URL based on source (mobile app or web)
    let redirectUrl;

    if (deepLink) {
      let profileUrl = null;
      try {
        const user = await User.findById(userId);
        const socialAccount = user?.socialAccounts?.[platform];
        if (socialAccount) {
          profileUrl = buildProfileUrl(platform, {
            username: profileData.username || socialAccount.username,
            facebookPageId: tokenData.facebookPageId || tokenData.pageId || socialAccount.facebookPageId,
            platformUserId: socialAccount.platformUserId || profileData.userId
          });
        }
      } catch (_) { }
      const params = new URLSearchParams({
        platform,
        success: 'true',
        username: profileData.username,
        profileUrl: profileUrl || ''
      });
      redirectUrl = `${deepLink}?${params.toString()}`;
    } else {
      // Web app: redirect to frontend URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      redirectUrl = `${frontendUrl}/creator/profile?connected=${platform}&success=true&username=${encodeURIComponent(profileData.username)}`;
    }

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    // Log full error details for debugging
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }

    // Determine redirect URL based on source (mobile app or web)
    // Try to extract deepLink from state if available (for error cases)
    let deepLink = null;
    try {
      if (req.query.state) {
        const stateData = verifyState(req.query.state);
        if (stateData && stateData.deepLink) {
          deepLink = stateData.deepLink;
        }
      }
    } catch (err) {
      // If state verification fails, continue with web redirect
    }

    let redirectUrl;
    const { platform } = req.params;
    const errorMessage = error.message || 'Failed to connect social media account';

    if (deepLink) {
      // Mobile app: redirect to deep link with error
      const params = new URLSearchParams({
        platform,
        success: 'false',
        error: errorMessage
      });
      redirectUrl = `${deepLink}?${params.toString()}`;
    } else {
      // Web app: redirect to frontend URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      redirectUrl = `${frontendUrl}/creator/profile?connected=${platform}&success=false&error=${encodeURIComponent(errorMessage)}`;
    }

    return res.redirect(redirectUrl);
  }
};

// Sync/Refresh social media metrics
const syncSocialMetrics = async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user._id;

    validatePlatform(platform);

    // Explicitly select accessToken and refreshToken (they're hidden by default)
    const user = await User.findById(userId).select(`+socialAccounts.${platform}.accessToken +socialAccounts.${platform}.refreshToken`);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    const socialAccount = user.socialAccounts[platform];
    if (!socialAccount) {
      return errorResponse(res, 'Social media account not connected', 404);
    }

    if (!socialAccount.accessToken) {
      return errorResponse(res, 'OAuth token not found. Please reconnect your account', 400);
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
        return errorResponse(res, 'Token expired and no refresh token available. Please reconnect your account', 400);
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
        return errorResponse(res, `Token refresh failed: ${refreshError.message}. Please reconnect your account`, 400);
      }
    }

    // Fetch latest metrics from platform
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

    return successResponse(res, {
      platform,
      metrics
    }, 'Social media metrics synced successfully');
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to sync social media metrics', 500);
  }
};

// Handle Facebook deauthorize callback (required for Live apps)
// Meta requires this endpoint to exist and return { status: "ok" }
const handleDeauthorize = async (req, res) => {
  try {
    // Facebook sends a signed_request in POST body
    const { signed_request } = req.body;

    // TODO: Add logic to revoke tokens and disconnect user's Facebook account
    // For now, just acknowledge - Meta requires this endpoint to exist
    // You can verify signed_request and revoke tokens later if needed

    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Deauthorize error:', error);
    // Always return ok to Meta even on error
    return res.json({ status: 'ok' });
  }
};

// Handle data deletion request (required for Live apps)
// Meta requires this endpoint to exist and return { status: "ok" } or { url: "...", confirmation_code: "..." }
const handleDataDeletion = async (req, res) => {
  try {
    // Facebook sends user_id in POST body
    const { user_id } = req.body;

    // TODO: Add logic to delete user's Facebook/Instagram data
    // For now, just acknowledge - Meta requires this endpoint to exist
    // You can process deletion asynchronously and return confirmation_code if needed

    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Data deletion error:', error);
    // Always return ok to Meta even on error
    return res.json({ status: 'ok' });
  }
};

const listFacebookPages = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('+socialAccounts.facebook.accessToken');
    if (!user || !user.socialAccounts || !user.socialAccounts.facebook || !user.socialAccounts.facebook.accessToken) {
      return errorResponse(res, 'Facebook not connected', 404);
    }
    const accessToken = user.socialAccounts.facebook.accessToken;
    const response = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: { access_token: accessToken, fields: 'id,name,followers_count' }
    });
    const pages = (response.data?.data || []).map(p => ({
      id: p.id,
      name: p.name,
      followersCount: p.followers_count || 0
    }));
    return successResponse(res, { pages }, 'Pages fetched');
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    return errorResponse(res, message, 400);
  }
};

const selectFacebookPage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { pageId } = req.body || {};
    if (!pageId) {
      return errorResponse(res, 'pageId is required', 400);
    }
    const user = await User.findById(userId).select('+socialAccounts.facebook.accessToken');
    if (!user || !user.socialAccounts || !user.socialAccounts.facebook || !user.socialAccounts.facebook.accessToken) {
      return errorResponse(res, 'Facebook not connected', 404);
    }
    const accessToken = user.socialAccounts.facebook.accessToken;
    const pageResp = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
      params: { access_token: accessToken, fields: 'id,name,followers_count' }
    });
    const page = pageResp.data;
    if (!page || page.id !== pageId) {
      return errorResponse(res, 'Invalid page', 400);
    }
    const update = {
      $set: {
        'socialAccounts.facebook.facebookPageId': pageId,
        'socialAccounts.facebook.username': page.name,
        'socialAccounts.facebook.followers': page.followers_count || 0
      }
    };
    await User.findByIdAndUpdate(userId, update, { new: true });
    try {
      const { syncPlatformForUser } = require('../utils/socialSyncHelpers');
      await syncPlatformForUser(userId, 'facebook');
    } catch (_) { }
    const profileUrl = `https://www.facebook.com/${pageId}`;
    return successResponse(res, { page: { id: page.id, name: page.name, followersCount: page.followers_count || 0 }, profileUrl }, 'Page selected');
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    return errorResponse(res, message, 400);
  }
};

const getProfileUrl = async (req, res) => {
  try {
    const { platform } = req.params;
    validatePlatform(platform);
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user || !user.socialAccounts || !user.socialAccounts[platform]) {
      return errorResponse(res, 'Not connected', 404);
    }
    const url = buildProfileUrl(platform, user.socialAccounts[platform]);
    return successResponse(res, { platform, profileUrl: url }, 'Profile URL');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

module.exports = {
  initiateOAuth,
  handleOAuthCallback,
  syncSocialMetrics,
  listFacebookPages,
  selectFacebookPage,
  getProfileUrl,
  handleDeauthorize,
  handleDataDeletion
};
