const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');
const { sanitizeString } = require('../utils/helpers');

// Get social media accounts
const getSocialMedia = async (req, res) => {
  try {
    const user = await findUserById(req.user._id);
    const socialAccounts = formatSocialAccounts(user.socialAccounts);
    return successResponse(res, socialAccounts, 'Social media accounts retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const updateSocialMedia = async (req, res) => {
  try {
    const { platform, username, followers, engagement, avgViews, audienceInsights } = req.body;
    validatePlatform(platform);
    let scrapedFollowers = null;
    try {
      const { scrapeFollowerCount } = require('../services/socialScraperService');
      const result = await scrapeFollowerCount(platform, username);
      scrapedFollowers = result && typeof result.followers === 'number' ? result.followers : null;
    } catch (_) {}
    const finalFollowers = typeof followers === 'number' ? followers : (scrapedFollowers ?? 0);
    const updatedUser = await updateSocialAccount(req.user._id, platform, { username, followers: finalFollowers, engagement, avgViews, audienceInsights });
    const updatedAccount = updatedUser.socialAccounts[platform];
    return successResponse(res, updatedAccount, 'Social media account updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

// Delete social media account
const deleteSocialMedia = async (req, res) => {
  try {
    const { platform } = req.params;
    validatePlatform(platform);
    await removeSocialAccount(req.user._id, platform);
    return successResponse(res, null, 'Social media account deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

// Helper functions
const findUserById = async (userId) => {
  return await User.findById(userId);
};

const validatePlatform = (platform) => {
  const validPlatforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];
  if (!validPlatforms.includes(platform)) {
    throw new Error('Invalid platform. Must be one of: instagram, tiktok, youtube, twitter, facebook');
  }
};

const updateSocialAccount = async (userId, platform, accountData) => {
  const updateQuery = {};
  const accountUpdate = {
    username: sanitizeString(accountData.username),
    followers: accountData.followers || 0,
    engagement: accountData.engagement || 0,
    verified: false,
    connectedAt: new Date()
  };
  
  if (accountData.avgViews !== undefined) {
    accountUpdate.avgViews = accountData.avgViews;
  }
  
  if (accountData.audienceInsights) {
    accountUpdate.audienceInsights = sanitizeAudienceInsights(accountData.audienceInsights);
  }
  
  updateQuery[`socialAccounts.${platform}`] = accountUpdate;
  return await User.findByIdAndUpdate(userId, updateQuery, { new: true, runValidators: true });
};

const sanitizeAudienceInsights = (insights) => {
  const sanitized = {};
  
  if (insights.topLocations && Array.isArray(insights.topLocations)) {
    sanitized.topLocations = insights.topLocations.map(loc => ({
      country: sanitizeString(loc.country),
      percentage: Math.max(0, Math.min(100, Number(loc.percentage) || 0))
    }));
  }
  
  if (insights.genderDistribution) {
    sanitized.genderDistribution = {
      male: Math.max(0, Math.min(100, Number(insights.genderDistribution.male) || 0)),
      female: Math.max(0, Math.min(100, Number(insights.genderDistribution.female) || 0)),
      nonBinary: Math.max(0, Math.min(100, Number(insights.genderDistribution.nonBinary) || 0)),
      other: Math.max(0, Math.min(100, Number(insights.genderDistribution.other) || 0))
    };
  }
  
  if (insights.ageGroups && Array.isArray(insights.ageGroups)) {
    sanitized.ageGroups = insights.ageGroups.map(age => ({
      range: sanitizeString(age.range),
      percentage: Math.max(0, Math.min(100, Number(age.percentage) || 0))
    }));
  }
  
  if (insights.avgViews !== undefined) {
    sanitized.avgViews = Number(insights.avgViews) || 0;
  }
  
  return sanitized;
};

const removeSocialAccount = async (userId, platform) => {
  const updateQuery = { $unset: {} };
  updateQuery.$unset[`socialAccounts.${platform}`] = '';
  return await User.findByIdAndUpdate(userId, updateQuery, { new: true });
};

const formatSocialAccounts = (socialAccounts) => {
  const formatted = {};
  const platforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];
  platforms.forEach(platform => {
    if (socialAccounts[platform]) {
      formatted[platform] = socialAccounts[platform];
    }
  });
  return formatted;
};


module.exports = {
  getSocialMedia,
  updateSocialMedia,
  deleteSocialMedia
};
