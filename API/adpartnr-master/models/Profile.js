const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  type: { 
    type: String, 
    enum: ['verified', 'top_performer', 'rising_star', 'collaborator', 'brand_favorite', 'milestone'],
    required: true
  },
  icon: { type: String }, // URL to badge icon
  description: { type: String },
  earnedAt: { type: Date, default: Date.now }
});

// Note: Location, age group, and gender distribution schemas are now in User model
// They are part of socialAccountSchema.audienceInsights

const profileSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true
  },
  bannerImage: { type: String }, // URL to banner/cover image
  categories: [{ 
    type: String,
    enum: [
      'fashion_beauty', 'tech_gadgets', 'fitness_health',
      'travel_lifestyle', 'food_drink', 'entertainment_media',
      'sports', 'education', 'business', 'parenting',
      'automotive', 'gaming', 'music', 'art_design'
    ]
  }],
  tags: [{ 
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  badges: [badgeSchema],
  // Note: Platform metrics and audience insights are now stored in User.socialAccounts
  // This keeps all platform-specific data together in one place
  // Computed fields - will be calculated on the fly
  totalFollowers: { 
    type: Number, 
    default: 0,
    min: [0, 'Total followers cannot be negative']
  },
  totalEngagementRate: { 
    type: Number, 
    default: 0,
    min: [0, 'Engagement rate cannot be negative'],
    max: [100, 'Engagement rate cannot exceed 100']
  },
  isProfileComplete: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for active badges count
profileSchema.virtual('activeBadgesCount').get(function() {
  return this.badges ? this.badges.length : 0;
});

// Method to calculate total followers from User.socialAccounts (requires user to be populated)
profileSchema.methods.calculateTotalFollowers = function(user) {
  if (!user || !user.socialAccounts) return 0;
  let total = 0;
  Object.values(user.socialAccounts).forEach(account => {
    if (account && account.followers) {
      total += account.followers;
    }
  });
  return total;
};

// Method to calculate total engagement rate from User.socialAccounts (requires user to be populated)
profileSchema.methods.calculateTotalEngagementRate = function(user) {
  if (!user || !user.socialAccounts) return 0;
  let totalWeightedEngagement = 0;
  let totalFollowers = 0;
  Object.values(user.socialAccounts).forEach(account => {
    if (account && account.followers && account.engagement) {
      totalWeightedEngagement += (account.followers * account.engagement);
      totalFollowers += account.followers;
    }
  });
  return totalFollowers > 0 ? (totalWeightedEngagement / totalFollowers) : 0;
};

// Method to update computed fields (requires user to be passed)
profileSchema.methods.updateComputedFields = function(user) {
  if (user) {
    this.totalFollowers = this.calculateTotalFollowers(user);
    this.totalEngagementRate = this.calculateTotalEngagementRate(user);
  }
  return this;
};

// Method to add/update platform analytics (only avgViews, not basic metrics)
profileSchema.methods.upsertPlatformAnalytics = function(platform, avgViews) {
  if (!this.platformAnalytics) {
    this.platformAnalytics = [];
  }
  const existingIndex = this.platformAnalytics.findIndex(
    p => p.platform === platform
  );
  if (existingIndex >= 0) {
    this.platformAnalytics[existingIndex].avgViews = avgViews || 0;
  } else {
    this.platformAnalytics.push({ platform, avgViews: avgViews || 0 });
  }
  return this;
};

// Method to add badge
profileSchema.methods.addBadge = function(badgeData) {
  if (!this.badges) {
    this.badges = [];
  }

  // Check if badge already exists
  const exists = this.badges.some(b => b.name === badgeData.name && b.type === badgeData.type);
  if (!exists) {
    this.badges.push(badgeData);
  }
  return this;
};

// Note: Computed fields (totalFollowers, totalEngagementRate) are now calculated
// from User.socialAccounts in the controller, not in pre-save middleware

// Static method to get profile with user data
profileSchema.statics.getProfileWithUser = async function(userId) {
  const profile = await this.findOne({ userId }).populate('userId', '-password');
  return profile;
};

// Indexes for better performance
profileSchema.index({ userId: 1 });
profileSchema.index({ categories: 1 });
profileSchema.index({ tags: 1 });
profileSchema.index({ 'badges.type': 1 });
profileSchema.index({ totalFollowers: -1 });
profileSchema.index({ totalEngagementRate: -1 });
profileSchema.index({ isPublic: 1 });
profileSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Profile', profileSchema);

