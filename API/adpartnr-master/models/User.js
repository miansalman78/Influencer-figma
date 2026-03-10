const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const locationDistributionSchema = new mongoose.Schema({
  country: { type: String, required: true, trim: true },
  percentage: {
    type: Number,
    required: true,
    min: [0, 'Percentage cannot be negative'],
    max: [100, 'Percentage cannot exceed 100']
  }
}, { _id: false });

const ageGroupSchema = new mongoose.Schema({
  range: { type: String, required: true, trim: true },
  percentage: {
    type: Number,
    required: true,
    min: [0, 'Percentage cannot be negative'],
    max: [100, 'Percentage cannot exceed 100']
  }
}, { _id: false });

const genderDistributionSchema = new mongoose.Schema({
  male: { type: Number, default: 0, min: 0, max: 100 },
  female: { type: Number, default: 0, min: 0, max: 100 },
  nonBinary: { type: Number, default: 0, min: 0, max: 100 },
  other: { type: Number, default: 0, min: 0, max: 100 }
}, { _id: false });

const socialAccountSchema = new mongoose.Schema({
  username: { type: String, required: true },
  followers: { type: Number, default: 0 },
  engagement: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  connectedAt: { type: Date, default: Date.now },
  // OAuth tokens (encrypted in production)
  accessToken: { type: String, select: false }, // Hidden by default for security
  refreshToken: { type: String, select: false }, // Hidden by default for security
  tokenExpiresAt: { type: Date },
  platformUserId: { type: String }, // Platform-specific user ID
  // Instagram Graph API specific fields
  instagramBusinessAccountId: { type: String }, // Instagram Business Account ID (for Graph API)
  facebookPageId: { type: String }, // Facebook Page ID (for Instagram Graph API)
  // Platform-specific metrics
  avgViews: { type: Number, default: 0 },
  // Facebook-specific metrics
  pageImpressions: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
  postImpressions: { type: Number, default: 0 },
  // Platform-specific audience insights
  audienceInsights: {
    topLocations: [locationDistributionSchema],
    genderDistribution: genderDistributionSchema,
    ageGroups: [ageGroupSchema],
    avgViews: { type: Number, default: 0 }
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function () { return !this.oauthProvider; }, // Not required if OAuth user
    minlength: [6, 'Password must be at least 6 characters']
  },
  // OAuth provider information
  oauthProvider: {
    type: String,
    default: null,
    required: false,
    validate: {
      validator: function (value) {
        // Allow null/undefined for regular email/password users
        if (value === null || value === undefined) return true;
        // If value is provided, it must be either 'google' or 'apple'
        return ['google', 'apple'].includes(value);
      },
      message: 'OAuth provider must be either google or apple'
    }
  },
  googleId: { type: String, sparse: true, unique: true },
  appleId: { type: String, sparse: true, unique: true },
  role: {
    type: String,
    enum: ['brand', 'creator'],
    required: true
  },
  creatorRole: {
    type: String,
    required: function () { return this.role === 'creator'; },
    validate: {
      validator: function (value) {
        // If role is creator, creatorRole must be set
        if (this.role === 'creator' && !value) return false;
        // If role is influencer (or user selected influencer), creatorRole must be "influencer"
        // For service creators, creatorRole can be any predefined role or custom text
        return true;
      },
      message: 'Creator role is required for creators'
    }
  },
  services: [{
    type: String,
    validate: {
      validator: function (value) {
        // Allow predefined services or custom services (prefixed with "custom_")
        if (!value || typeof value !== 'string') return false;

        // Allow custom services
        if (value.startsWith('custom_')) {
          const customServiceName = value.replace('custom_', '');
          return customServiceName.trim().length > 0 && customServiceName.length <= 100;
        }

        // Validate against predefined services using serviceHelpers
        const { isValidService } = require('../utils/serviceHelpers');
        return isValidService(value);
      },
      message: 'Service must be a valid predefined service ID or a custom service (prefixed with custom_)'
    }
  }],
  socialAccounts: {
    instagram: socialAccountSchema,
    tiktok: socialAccountSchema,
    youtube: socialAccountSchema,
    twitter: socialAccountSchema,
    facebook: socialAccountSchema
  },
  // Manual social links/handles (URLs or usernames) when not using OAuth
  socialMedia: {
    instagram: { type: String, trim: true, default: '' },
    tiktok: { type: String, trim: true, default: '' },
    youtube: { type: String, trim: true, default: '' },
    twitter: { type: String, trim: true, default: '' },
    facebook: { type: String, trim: true, default: '' }
  },
  // walletBalance field removed - using Wallet.balances instead
  // Running total of all ratings received (used with totalReviews to compute average)
  ratings: {
    type: Number,
    default: 0,
    min: [0, 'Rating total cannot be negative']
  },
  totalReviews: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  profileImage: { type: String },
  bio: { type: String, maxlength: [500, 'Bio cannot exceed 500 characters'] },
  location: {
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number }
    }
  },
  // Brand specific fields
  companyName: { type: String, trim: true },
  industry: { type: String, trim: true },
  brandTagline: { type: String, trim: true },
  campaignBudget: { type: String, trim: true },
  savedCampaigns: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  }],
  phone: { type: String },
  website: { type: String },
  fcmToken: { type: String, default: null },
  lastActive: { type: Date, default: Date.now },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for average rating
userSchema.virtual('averageRating').get(function () {
  return this.totalReviews > 0 ? (this.ratings / this.totalReviews) : 0;
});

// Hash password before saving (only if password is provided and modified)
userSchema.pre('save', async function (next) {
  // Skip password hashing for OAuth users or if password is not modified
  if (!this.password || !this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  // OAuth users don't have passwords
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update last active
userSchema.methods.updateLastActive = function () {
  this.lastActive = new Date();
  return this.save();
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return resetToken;
};

// Clear password reset token (without saving)
userSchema.methods.clearPasswordResetToken = function () {
  this.passwordResetToken = undefined;
  this.passwordResetExpires = undefined;
};

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ creatorRole: 1 });
userSchema.index({ services: 1 });
userSchema.index({ 'socialAccounts.instagram.username': 1 });
userSchema.index({ 'socialAccounts.tiktok.username': 1 });
userSchema.index({ 'location.city': 1 });
userSchema.index({ 'location.state': 1 });
userSchema.index({ 'location.country': 1 });
// Note: 2dsphere index removed - coordinates stored as {latitude, longitude} object
// To enable geospatial queries, convert coordinates to GeoJSON format: [longitude, latitude]
// Then uncomment: userSchema.index({ 'location.coordinates': '2dsphere' });

module.exports = mongoose.model('User', userSchema);
