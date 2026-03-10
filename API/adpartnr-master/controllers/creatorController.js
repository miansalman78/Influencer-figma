const User = require('../models/User');
const Profile = require('../models/Profile');
const Review = require('../models/Review');
const { successResponse, errorResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');
const { syncStaleMetrics } = require('../utils/socialSyncHelpers');
const { buildProfileUrl } = require('../utils/socialHelpers');

// Get all creators with filters and pagination
const getCreators = async (req, res) => {
  try {
    const params = extractQueryParams(req.query);
    const pageNum = parseInt(params.page) || 1;
    const limitNum = parseInt(params.limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build Match Stage
    const matchStage = {
      role: 'creator',
      isActive: true
    };

    if (params.search) {
      const searchRegex = new RegExp(params.search, 'i');
      matchStage.$or = [
        { name: searchRegex },
        { 'socialAccounts.instagram.username': searchRegex },
        { 'socialAccounts.tiktok.username': searchRegex },
        { 'socialAccounts.youtube.username': searchRegex }
      ];
    }

    if (params.city) matchStage['location.city'] = params.city;
    if (params.state) matchStage['location.state'] = params.state;
    if (params.country) matchStage['location.country'] = params.country;

    // Build Pipeline
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'profiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'profile'
        }
      },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } }
    ];

    // Filter by Profile Categories
    if (params.categories && params.categories.length > 0) {
      pipeline.push({ $match: { 'profile.categories': { $in: params.categories } } });
    }

    // Filter by Followers (stored in Profile or computed from User)
    if (params.minFollowers) {
      pipeline.push({ $match: { 'profile.totalFollowers': { $gte: params.minFollowers } } });
    }
    if (params.maxFollowers) {
      pipeline.push({ $match: { 'profile.totalFollowers': { $lte: params.maxFollowers } } });
    }

    // Filter by Platform
    if (params.platform && params.platform.length > 0) {
      const platformFilters = params.platform.map(p => ({ [`socialAccounts.${p}.username`]: { $exists: true, $ne: null } }));
      pipeline.push({ $match: { $or: platformFilters } });
    }

    // Counting and Pagination using $facet for single-trip execution
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $sort: { [params.sortBy]: params.sortOrder } },
          { $skip: skip },
          { $limit: limitNum }
        ]
      }
    });

    const results = await User.aggregate(pipeline);
    const total = results[0].metadata[0]?.total || 0;
    const data = results[0].data || [];

    // Format results
    const creators = data.map(user => {
      const totalFollowers = user.profile?.totalFollowers || calculateTotalFollowers(user);
      const totalEngagement = user.profile?.totalEngagementRate || calculateTotalEngagement(user);
      return {
        id: user._id,
        name: user.name,
        avatar: resolveProfileImage(user),
        location: user.location,
        categories: user.profile?.categories || [],
        totalFollowers,
        totalEngagementRate: totalEngagement,
        platformReach: buildPlatformReach(user),
        rating: user.ratings || 0,
        createdAt: user.createdAt
      };
    });

    const totalPages = Math.ceil(total / limitNum);
    const pagination = {
      currentPage: pageNum,
      totalPages,
      totalItems: total,
      itemsPerPage: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    };

    return successResponse(res, { creators, pagination }, 'Creators retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Apply pagination to an array
const applyPaginationToArray = (array, page = 1, limit = 10) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const maxLimit = 100;
  const finalLimit = Math.min(limitNum, maxLimit);
  const finalPage = Math.max(pageNum, 1);
  const skip = (finalPage - 1) * finalLimit;

  const total = array.length;
  const data = array.slice(skip, skip + finalLimit);
  const totalPages = Math.ceil(total / finalLimit);

  const pagination = {
    currentPage: finalPage,
    totalPages,
    totalItems: total,
    itemsPerPage: finalLimit,
    hasNextPage: finalPage < totalPages,
    hasPrevPage: finalPage > 1,
    nextPage: finalPage < totalPages ? finalPage + 1 : null,
    prevPage: finalPage > 1 ? finalPage - 1 : null,
    totalResults: data.length
  };

  return { data, pagination };
};

// Extract and sanitize query parameters
const extractQueryParams = (query) => {
  return {
    page: query.page || 1,
    limit: query.limit || 10,
    search: query.search ? sanitizeString(query.search) : null,
    categories: query.categories ? (Array.isArray(query.categories) ? query.categories : [query.categories]) : null,
    platform: query.platform ? (Array.isArray(query.platform) ? query.platform : [query.platform]) : null,
    city: query.city ? sanitizeString(query.city) : null,
    state: query.state ? sanitizeString(query.state) : null,
    country: query.country ? sanitizeString(query.country) : null,
    minFollowers: query.minFollowers ? parseInt(query.minFollowers) : null,
    maxFollowers: query.maxFollowers ? parseInt(query.maxFollowers) : null,
    minEngagement: query.minEngagement ? parseFloat(query.minEngagement) : null,
    maxEngagement: query.maxEngagement ? parseFloat(query.maxEngagement) : null,
    minRating: query.minRating ? parseFloat(query.minRating) : null,
    sortBy: query.sortBy || 'createdAt',
    sortOrder: query.sortOrder === 'asc' ? 1 : -1
  };
};

// Build MongoDB query for creators
const buildCreatorQuery = (params) => {
  let query = User.find({ role: 'creator', isActive: true }).select('-password');

  // Search by name or username
  if (params.search) {
    const searchRegex = new RegExp(params.search, 'i');
    query = query.or([
      { name: searchRegex },
      { 'socialAccounts.instagram.username': searchRegex },
      { 'socialAccounts.tiktok.username': searchRegex },
      { 'socialAccounts.youtube.username': searchRegex },
      { 'socialAccounts.twitter.username': searchRegex },
      { 'socialAccounts.facebook.username': searchRegex }
    ]);
  }

  // Location filters
  if (params.city) {
    query = query.where({ 'location.city': new RegExp(params.city, 'i') });
  }
  if (params.state) {
    query = query.where({ 'location.state': new RegExp(params.state, 'i') });
  }
  if (params.country) {
    query = query.where({ 'location.country': new RegExp(params.country, 'i') });
  }

  // Rating filter
  if (params.minRating) {
    query = query.where({ ratings: { $gte: params.minRating } });
  }

  // Sort
  const sortObj = {};
  sortObj[params.sortBy] = params.sortOrder;
  query = query.sort(sortObj);

  return query;
};

// Filter creators by platform, followers, engagement, and categories
const filterCreators = async (users, params) => {
  if (!params.platform && !params.minFollowers && !params.maxFollowers &&
    !params.minEngagement && !params.maxEngagement && !params.categories) {
    return users;
  }

  const userIds = users.map(u => u._id);
  const profiles = await Profile.find({ userId: { $in: userIds } });
  const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));

  return users.filter(user => {
    // Platform filter
    if (params.platform && params.platform.length > 0) {
      const hasPlatform = params.platform.some(platform =>
        user.socialAccounts && user.socialAccounts[platform] && user.socialAccounts[platform].username
      );
      if (!hasPlatform) return false;
    }

    // Categories filter
    if (params.categories && params.categories.length > 0) {
      const profile = profileMap.get(user._id.toString());
      if (!profile || !profile.categories) return false;
      const hasCategory = params.categories.some(cat => profile.categories.includes(cat));
      if (!hasCategory) return false;
    }

    // Followers filter
    const totalFollowers = calculateTotalFollowers(user);
    if (params.minFollowers && totalFollowers < params.minFollowers) return false;
    if (params.maxFollowers && totalFollowers > params.maxFollowers) return false;

    // Engagement filter
    const totalEngagement = calculateTotalEngagement(user);
    if (params.minEngagement && totalEngagement < params.minEngagement) return false;
    if (params.maxEngagement && totalEngagement > params.maxEngagement) return false;

    return true;
  });
};

// Format creators response with profile data
const formatCreatorsResponse = async (users) => {
  const creators = await Promise.all(users.map(async (user) => {
    const profile = await Profile.findOne({ userId: user._id });
    const reviewsSummary = await Review.getUserAverageRatings(user._id);
    return formatCreatorData(user, profile, reviewsSummary);
  }));
  return creators;
};

// Format individual creator data
const formatCreatorData = (user, profile, reviewsSummary) => {
  const totalFollowers = calculateTotalFollowers(user);
  const totalEngagement = calculateTotalEngagement(user);
  const platformReach = buildPlatformReach(user);
  const profileImage = resolveProfileImage(user);

  return {
    id: user._id,
    name: user.name,
    avatar: profileImage,
    profileImage,
    bio: user.bio || null,
    location: user.location || null,
    role: user.creatorRole || null,
    categories: profile?.categories || [],
    tags: profile?.tags || [],
    totalFollowers,
    totalEngagementRate: totalEngagement,
    platformReach,
    averageRating: reviewsSummary.overall || 0,
    totalReviews: reviewsSummary.totalReviews || 0,
    rating: user.ratings || 0,
    isVerified: hasVerifiedAccount(user),
    createdAt: user.createdAt
  };
};

// Calculate total followers from social accounts
const calculateTotalFollowers = (user) => {
  if (!user || !user.socialAccounts) return 0;
  let total = 0;
  Object.values(user.socialAccounts).forEach(account => {
    if (account && account.followers) total += account.followers;
  });
  return total;
};

// Calculate total engagement rate
const calculateTotalEngagement = (user) => {
  if (!user || !user.socialAccounts) return 0;
  let totalWeighted = 0;
  let totalFollowers = 0;
  Object.values(user.socialAccounts).forEach(account => {
    if (account && account.followers && account.engagement) {
      totalWeighted += (account.followers * account.engagement);
      totalFollowers += account.followers;
    }
  });
  return totalFollowers > 0 ? (totalWeighted / totalFollowers) : 0;
};

// Build platform reach array (include profileUrl so app can open correct link, e.g. Facebook page)
const buildPlatformReach = (user) => {
  const platforms = [];
  if (!user || !user.socialAccounts) return platforms;
  Object.keys(user.socialAccounts).forEach(platform => {
    const account = user.socialAccounts[platform];
    if (account && (account.username || account.facebookPageId || account.platformUserId)) {
      const profileUrl = buildProfileUrl(platform, account);
      platforms.push({
        platform,
        username: account.username,
        followers: account.followers || 0,
        engagementRate: account.engagement || 0,
        verified: account.verified || false,
        profileImage: account.profileImage || account.profile_picture || null,
        profileUrl: profileUrl || null,
        url: profileUrl || null
      });
    }
  });
  return platforms;
};

// Check if user has any verified account
const hasVerifiedAccount = (user) => {
  if (!user || !user.socialAccounts) return false;
  return Object.values(user.socialAccounts).some(account => account && account.verified);
};

// Resolve profile image from user or any connected social account
const resolveProfileImage = (user) => {
  if (!user) return null;
  if (user.profileImage) return user.profileImage;
  if (user.socialAccounts) {
    const firstWithImage = Object.values(user.socialAccounts).find(
      (acct) => acct && (acct.profileImage || acct.profile_picture)
    );
    if (firstWithImage) {
      return firstWithImage.profileImage || firstWithImage.profile_picture;
    }
  }
  return null;
};

module.exports = {
  getCreators
};

