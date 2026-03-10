const Profile = require('../models/Profile');
const User = require('../models/User');
const Review = require('../models/Review');
const BrandPaymentMethod = require('../models/BrandPaymentMethod');
const { successResponse, errorResponse, createdResponse, notFoundResponse } = require('../utils/response');
const { sanitizeString } = require('../utils/helpers');
const { syncStaleMetrics } = require('../utils/socialSyncHelpers');

// Get profile by userId (public)
const getProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user
    let user = await User.findById(userId).select('-password');
    if (!user) {
      return notFoundResponse(res, 'User not found');
    }

    // Find or create profile
    let profile = await Profile.findOne({ userId });

    // If profile doesn't exist, create a basic one
    if (!profile) {
      profile = await Profile.create({ userId });
    }

    // Get reviews summary for average rating
    const reviewsSummary = await Review.getUserAverageRatings(userId);

    // Combine user and profile data (using current cached data)
    const profileData = buildProfileResponse(user, profile, reviewsSummary);

    // Sync stale social media metrics in the background (non-blocking)
    // Only sync for influencers who have social media accounts
    // This ensures fast response times while keeping data fresh
    if (user.creatorRole === 'influencer') {
      syncStaleMetrics(userId, 24).catch(error => {
        // Log error but don't block the response
        console.error(`Background sync failed for user ${userId}:`, error.message);
      });
    }

    return successResponse(res, profileData, 'Profile retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get own profile (authenticated user)
const getOwnProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find user
    let user = await User.findById(userId).select('-password');
    if (!user) {
      return notFoundResponse(res, 'User not found');
    }

    // Sync stale social media metrics (if older than 24 hours)
    // Only sync for influencers who have social media accounts
    if (user.creatorRole === 'influencer') {
      await syncStaleMetrics(userId, 24);

      // Refresh user data after sync
      user = await User.findById(userId).select('-password');
    }

    // Find or create profile
    let profile = await Profile.findOne({ userId });

    if (!profile) {
      profile = await Profile.create({ userId });
    }

    // Get reviews summary
    const reviewsSummary = await Review.getUserAverageRatings(userId);

    let paymentMethods = [];
    if (user.role === 'brand') {
      paymentMethods = await BrandPaymentMethod.find({ brandId: userId });
    }

    // Combine user and profile data
    let profileData = buildProfileResponse(user, profile, reviewsSummary, paymentMethods);

    // Add brand-specific data if user is a brand
    if (user.role === 'brand') {
      profileData = {
        ...profileData,
        billingAddress: paymentMethods.find(pm => pm.isDefault && pm.cardDetails?.billingAddress)?.cardDetails?.billingAddress || null,
        // Optional: Add other brand-specific summary stats here if needed
      };
    }

    return successResponse(res, profileData, 'Profile retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const updateData = sanitizeProfileUpdateData(req.body);

    // Update user data
    if (updateData.user) {
      await User.findByIdAndUpdate(userId, updateData.user, { new: true, runValidators: true });
    }

    // Update or create profile
    let profile = await Profile.findOne({ userId });

    if (updateData.profile) {
      if (profile) {
        // Update existing profile
        Object.assign(profile, updateData.profile);

        // Note: Platform metrics and audience insights are now in User.socialAccounts
        // Update them via /api/user/profile/social-media endpoints

        await profile.save();
      } else {
        // Create new profile
        profile = await Profile.create({
          userId,
          ...updateData.profile
        });
      }
    } else if (!profile) {
      // Create basic profile if it doesn't exist
      profile = await Profile.create({ userId });
    }

    // Get updated user and reviews summary
    const user = await User.findById(userId).select('-password');
    const reviewsSummary = await Review.getUserAverageRatings(userId);

    let paymentMethods = [];
    if (user.role === 'brand') {
      paymentMethods = await BrandPaymentMethod.find({ brandId: userId });
    }

    // Build response
    let profileData = buildProfileResponse(user, profile, reviewsSummary, paymentMethods);

    // Add brand-specific data if user is a brand
    if (user.role === 'brand') {
      profileData = {
        ...profileData,
        billingAddress: paymentMethods.find(pm => pm.isDefault && pm.cardDetails?.billingAddress)?.cardDetails?.billingAddress || null,
      };
    }

    return successResponse(res, profileData, 'Profile updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper function to build comprehensive profile response
const buildProfileResponse = (user, profile, reviewsSummary, paymentMethods = []) => {
  // Build platform reach data from User.socialAccounts (single source of truth)
  const platformReach = buildPlatformReach(user);

  // Calculate totals from User.socialAccounts
  const calculateTotalsFromSocialAccounts = (user, profile) => {
    if (!user || !user.socialAccounts || Object.keys(user.socialAccounts).length === 0) {
      return {
        totalFollowers: profile?.totalFollowers || 0,
        totalEngagementRate: profile?.totalEngagementRate || 0
      };
    }

    let totalFollowers = 0;
    let totalWeightedEngagement = 0;
    let accountsFound = 0;

    Object.values(user.socialAccounts).forEach(account => {
      if (account && account.username) {
        accountsFound++;
        if (account.followers) {
          totalFollowers += Number(account.followers);
          if (account.engagement) {
            totalWeightedEngagement += (Number(account.followers) * Number(account.engagement));
          }
        }
      }
    });

    // If no actual accounts were found with data, fallback to profile values
    if (accountsFound === 0 || totalFollowers === 0) {
      return {
        totalFollowers: profile?.totalFollowers || 0,
        totalEngagementRate: profile?.totalEngagementRate || 0
      };
    }

    const totalEngagementRate = totalFollowers > 0
      ? (totalWeightedEngagement / totalFollowers)
      : 0;

    return { totalFollowers, totalEngagementRate };
  };

  const totals = calculateTotalsFromSocialAccounts(user, profile);

  return {
    // Basic info from User
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.profileImage,
    profileImage: user.profileImage, // Also include as profileImage for consistency
    bannerImage: profile?.bannerImage || null,
    bio: user.bio,
    // Manual social links (or empty; frontend can fallback to platformReach usernames)
    socialMedia: user.socialMedia && typeof user.socialMedia === 'object' ? { ...user.socialMedia } : {},
    location: user.location,
    phone: user.phone,
    website: user.website,
    companyName: user.companyName,
    industry: user.industry,
    brandTagline: user.brandTagline,
    campaignBudget: user.campaignBudget,

    // Roles
    role: user.role,
    creatorRole: user.creatorRole,
    roles: user.role === 'creator' ? [user.creatorRole, 'creator'] : [user.role],

    // Categories and tags
    categories: profile?.categories || [],
    tags: profile?.tags || [],

    // Badges
    badges: profile?.badges || [],
    activeBadgesCount: profile?.activeBadgesCount || 0,

    // Follower counts (calculated from User.socialAccounts)
    totalFollowers: totals.totalFollowers,
    platformFollowers: platformReach.map(p => ({
      platform: p.platform,
      followers: p.followers
    })),

    // Engagement rates (calculated from User.socialAccounts)
    totalEngagementRate: totals.totalEngagementRate,
    platformEngagementRates: platformReach.map(p => ({
      platform: p.platform,
      engagementRate: p.engagementRate
    })),

    // Platform reach details (includes audienceInsights per platform)
    platformReach,

    // Curated Audience Insights (pick best available platform, e.g., Instagram)
    audienceInsights: (() => {
      if (!platformReach || platformReach.length === 0) return null;
      // Prioritize Instagram for global insights view
      const ig = platformReach.find(p => p.platform === 'instagram' && p.audienceInsights);
      if (ig) return ig.audienceInsights;
      // Fallback to any platform with insights
      const anyWithInsights = platformReach.find(p => p.audienceInsights);
      return anyWithInsights ? anyWithInsights.audienceInsights : null;
    })(),

    // Ratings and reviews
    averageRating: reviewsSummary.overall || 0,
    totalReviews: reviewsSummary.totalReviews || 0,
    rating: user.ratings || 0,

    // Payment info (for owners/brands)
    paymentMethods,

    // Profile status
    isProfileComplete: profile?.isProfileComplete || false,
    isPublic: profile?.isPublic !== false,
    isActive: user.isActive,

    // Timestamps
    createdAt: user.createdAt,
    updatedAt: profile?.updatedAt || user.updatedAt,
    lastActive: user.lastActive
  };
};

// Build platform reach from User.socialAccounts (single source of truth)
const buildPlatformReach = (user) => {
  const platformReach = [];
  if (!user || !user.socialAccounts) return platformReach;

  Object.keys(user.socialAccounts).forEach(platform => {
    const account = user.socialAccounts[platform];
    if (account && account.username) {
      platformReach.push({
        platform,
        username: account.username,
        followers: account.followers || 0,
        engagementRate: account.engagement || 0,
        avgViews: account.avgViews || 0,
        verified: account.verified || false,
        audienceInsights: account.audienceInsights || null
      });
    }
  });
  return platformReach;
};

// Calculate totals from User.socialAccounts
const calculateTotalsFromSocialAccounts = (user, profile) => {
  if (!user || !user.socialAccounts || Object.keys(user.socialAccounts).length === 0) {
    return {
      totalFollowers: profile?.totalFollowers || 0,
      totalEngagementRate: profile?.totalEngagementRate || 0
    };
  }

  let totalFollowers = 0;
  let totalWeightedEngagement = 0;
  let accountsFound = 0;

  Object.values(user.socialAccounts).forEach(account => {
    if (account && account.username) {
      accountsFound++;
      if (account.followers) {
        totalFollowers += Number(account.followers);
        if (account.engagement) {
          totalWeightedEngagement += (Number(account.followers) * Number(account.engagement));
        }
      }
    }
  });

  // If no actual accounts were found with data, fallback to profile values
  if (accountsFound === 0 || totalFollowers === 0) {
    return {
      totalFollowers: profile?.totalFollowers || 0,
      totalEngagementRate: profile?.totalEngagementRate || 0
    };
  }

  const totalEngagementRate = totalFollowers > 0
    ? (totalWeightedEngagement / totalFollowers)
    : 0;

  return { totalFollowers, totalEngagementRate };
};

// Note: Audience insights are stored per platform in User.socialAccounts
// Each platform in platformReach includes its own audienceInsights
// No aggregation needed - access insights via platformReach[].audienceInsights

// Sanitize and validate profile update data
const sanitizeProfileUpdateData = (data) => {
  const sanitized = { user: {}, profile: {} };

  // User updateable fields
  const userFields = ['name', 'bio', 'phone', 'website', 'profileImage', 'location', 'companyName', 'industry', 'brandTagline', 'campaignBudget'];
  if (data.socialMedia !== undefined && typeof data.socialMedia === 'object') {
    const platforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'];
    sanitized.user.socialMedia = {};
    platforms.forEach(p => {
      const v = data.socialMedia[p];
      sanitized.user.socialMedia[p] = (v && typeof v === 'string') ? sanitizeString(v).trim().slice(0, 500) : '';
    });
  }
  userFields.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'location' && typeof data[field] === 'object') {
        sanitized.user[field] = data[field];
      } else if (field === 'profileImage') {
        sanitized.user[field] = data[field];
      } else {
        sanitized.user[field] = typeof data[field] === 'string' ? sanitizeString(data[field]) : data[field];
      }
    }
  });

  // Profile updateable fields
  if (data.bannerImage !== undefined) {
    sanitized.profile.bannerImage = data.bannerImage;
  }

  if (data.categories !== undefined && Array.isArray(data.categories)) {
    sanitized.profile.categories = data.categories;
  }

  if (data.tags !== undefined && Array.isArray(data.tags)) {
    sanitized.profile.tags = data.tags.map(tag => sanitizeString(tag)).filter(tag => tag.length > 0);
  }

  // Note: Platform metrics and audience insights are stored in User.socialAccounts
  // Update them via /api/user/profile/social-media endpoints, not here

  if (data.isPublic !== undefined) {
    sanitized.profile.isPublic = Boolean(data.isPublic);
  }

  return sanitized;
};

module.exports = {
  getProfile,
  getOwnProfile,
  updateProfile
};

