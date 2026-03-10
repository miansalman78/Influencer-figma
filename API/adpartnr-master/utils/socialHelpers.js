const crypto = require('crypto');
const User = require('../models/User');

// Validate platform
const validatePlatform = (platform) => {
  const validPlatforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];
  if (!validPlatforms.includes(platform)) {
    throw new Error('Invalid platform. Must be one of: instagram, tiktok, youtube, twitter, facebook');
  }
};

// Generate encrypted state for OAuth
const generateState = (userId, platform, deepLink = null) => {
  const data = JSON.stringify({ 
    userId: userId.toString(), 
    platform, 
    timestamp: Date.now(),
    deepLink // Include deep link for mobile app redirects
  });
  
  // Ensure JWT_SECRET is at least 32 characters for AES-256
  const secretKey = process.env.JWT_SECRET || '';
  if (secretKey.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long for state encryption');
  }
  
  const key = Buffer.from(secretKey.substring(0, 32), 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
};

// Verify and decrypt state
const verifyState = (state) => {
  try {
    if (!state || typeof state !== 'string') {
      console.error('Invalid state: not a string', state);
      return null;
    }
    
    // Remove any URL fragments (like Facebook's #_=_)
    state = state.split('#')[0].trim();
    
    const [ivHex, encrypted] = state.split(':');
    if (!ivHex || !encrypted) {
      console.error('Invalid state format: missing IV or encrypted data', state);
      return null;
    }
    
    // Ensure JWT_SECRET is at least 32 characters for AES-256
    const secretKey = process.env.JWT_SECRET || '';
    if (secretKey.length < 32) {
      console.error('JWT_SECRET is too short for decryption');
      return null;
    }
    
    const key = Buffer.from(secretKey.substring(0, 32), 'utf8');
    const iv = Buffer.from(ivHex, 'hex');
    
    if (iv.length !== 16) {
      console.error('Invalid IV length:', iv.length);
      return null;
    }
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const data = JSON.parse(decrypted);
    
    // Check if state is not too old (5 minutes)
    if (Date.now() - data.timestamp > 5 * 60 * 1000) {
      console.error('State expired. Age:', Date.now() - data.timestamp, 'ms');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('State verification error:', error.message);
    console.error('State that failed:', state);
    return null;
  }
};

// Generate PKCE for Twitter
const generatePKCE = () => {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
};

// Ensure backend URL uses HTTPS (required for OAuth redirect URIs)
// Facebook and Instagram require HTTPS for all OAuth redirect URIs (except localhost)
const ensureHttpsBackendUrl = (req) => {
  // First, check if BACKEND_URL is set in environment
  let backendUrl = process.env.BACKEND_URL;
  
  if (backendUrl) {
    // If BACKEND_URL is set, ensure it uses HTTPS (unless it's localhost)
    const isLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    
    if (isLocalhost) {
      // Keep HTTP for localhost (for local development)
      if (!backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
        backendUrl = `http://${backendUrl}`;
      }
    } else {
      // Force HTTPS for non-localhost URLs (production)
      if (!backendUrl.startsWith('https://')) {
        // Remove http:// if present and add https://
        backendUrl = backendUrl.replace(/^https?:\/\//, '');
        backendUrl = `https://${backendUrl}`;
      }
    }
  } else {
    // If not set, construct from request
    const host = req.get('host') || 'localhost:5000';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    
    // Check if request is already HTTPS (via protocol or x-forwarded-proto header)
    const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
    
    if (isLocalhost) {
      // Use HTTP for localhost (for local development)
      backendUrl = `http://${host}`;
    } else {
      // Always use HTTPS for production (non-localhost)
      backendUrl = `https://${host}`;
    }
  }
  
  // Ensure no trailing slash
  backendUrl = backendUrl.replace(/\/$/, '');
  
  return backendUrl;
};

const buildProfileUrl = (platform, socialAccount) => {
  if (!platform || !socialAccount) return null;
  const username = socialAccount.username;
  const pageId = socialAccount.facebookPageId;
  const platformUserId = socialAccount.platformUserId;
  switch (platform) {
    case 'instagram':
      return username ? `https://www.instagram.com/${username}/` : 'https://www.instagram.com';
    case 'facebook': {
      if (pageId) return `https://www.facebook.com/${pageId}`;
      if (platformUserId) return `https://www.facebook.com/${platformUserId}`;
      if (username) return `https://www.facebook.com/${encodeURIComponent(username.trim())}`;
      return 'https://www.facebook.com';
    }
    case 'tiktok':
      return username ? `https://www.tiktok.com/@${username}` : 'https://www.tiktok.com';
    case 'youtube': {
      if (platformUserId && platformUserId.startsWith('UC')) {
        return `https://www.youtube.com/channel/${platformUserId}`;
      }
      return username ? `https://www.youtube.com/@${username}` : 'https://www.youtube.com';
    }
    case 'twitter':
      return username ? `https://twitter.com/${username}` : 'https://twitter.com';
    default:
      return null;
  }
};

// Save social account with tokens
const saveSocialAccountWithTokens = async (userId, platform, accountData) => {
  const updateQuery = {};
  const accountUpdate = {
    username: accountData.username,
    followers: accountData.followers || 0,
    engagement: accountData.engagement || 0,
    verified: accountData.verified || false,
    connectedAt: new Date(),
    accessToken: accountData.accessToken,
    refreshToken: accountData.refreshToken,
    tokenExpiresAt: accountData.tokenExpiresAt,
    platformUserId: accountData.platformUserId
  };
  
  // Add Instagram Graph API specific fields
  if (platform === 'instagram') {
    if (accountData.instagramBusinessAccountId) {
      accountUpdate.instagramBusinessAccountId = accountData.instagramBusinessAccountId;
    }
    if (accountData.facebookPageId) {
      accountUpdate.facebookPageId = accountData.facebookPageId;
    }
  }
  
  // Add Facebook Page ID for Facebook platform (from Business Login)
  if (platform === 'facebook' && accountData.facebookPageId) {
    accountUpdate.facebookPageId = accountData.facebookPageId;
  }
  
  // Use $set operator to avoid path collision errors
  const finalUpdateQuery = {
    $set: {
      [`socialAccounts.${platform}`]: accountUpdate
    }
  };
  
  return await User.findByIdAndUpdate(userId, finalUpdateQuery, { new: true, runValidators: true });
};

// Update social account token
// Always updates: accessToken, connectedAt, tokenExpiresAt
// Optionally updates: refreshToken, verified
const updateSocialAccountToken = async (userId, platform, tokenData) => {
  // Use $set operator to avoid path collision errors
  const updateQuery = {
    $set: {}
  };
  
  updateQuery.$set[`socialAccounts.${platform}.accessToken`] = tokenData.accessToken;
  
  // Always update connectedAt (tracks last successful token refresh/connection)
  updateQuery.$set[`socialAccounts.${platform}.connectedAt`] = new Date();
  
  // Always update tokenExpiresAt if provided
  if (tokenData.tokenExpiresAt) {
    updateQuery.$set[`socialAccounts.${platform}.tokenExpiresAt`] = tokenData.tokenExpiresAt;
  }
  
  // Update refreshToken if provided
  if (tokenData.refreshToken !== undefined) {
    updateQuery.$set[`socialAccounts.${platform}.refreshToken`] = tokenData.refreshToken;
  }
  
  // Update verified status if provided
  if (tokenData.verified !== undefined) {
    updateQuery.$set[`socialAccounts.${platform}.verified`] = tokenData.verified;
  }
  
  return await User.findByIdAndUpdate(userId, updateQuery, { new: true });
};

// Update social account metrics
const updateSocialAccountMetrics = async (userId, platform, metrics) => {
  // Use $set operator to avoid path collision errors
  const updateQuery = {
    $set: {}
  };
  
  updateQuery.$set[`socialAccounts.${platform}.followers`] = metrics.followers || 0;
  updateQuery.$set[`socialAccounts.${platform}.engagement`] = metrics.engagement || 0;
  if (metrics.avgViews !== undefined) {
    updateQuery.$set[`socialAccounts.${platform}.avgViews`] = metrics.avgViews;
  }
  if (metrics.audienceInsights) {
    updateQuery.$set[`socialAccounts.${platform}.audienceInsights`] = metrics.audienceInsights;
  }
  // Facebook-specific metrics
  if (metrics.pageImpressions !== undefined) {
    updateQuery.$set[`socialAccounts.${platform}.pageImpressions`] = metrics.pageImpressions || 0;
  }
  if (metrics.pageViews !== undefined) {
    updateQuery.$set[`socialAccounts.${platform}.pageViews`] = metrics.pageViews || 0;
  }
  if (metrics.postImpressions !== undefined) {
    updateQuery.$set[`socialAccounts.${platform}.postImpressions`] = metrics.postImpressions || 0;
  }
  
  return await User.findByIdAndUpdate(userId, updateQuery, { new: true });
};

module.exports = {
  validatePlatform,
  generateState,
  verifyState,
  generatePKCE,
  ensureHttpsBackendUrl,
  buildProfileUrl,
  saveSocialAccountWithTokens,
  updateSocialAccountToken,
  updateSocialAccountMetrics
};
