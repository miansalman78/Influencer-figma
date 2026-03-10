const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  reviewerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  revieweeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  rating: { 
    type: Number, 
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  comment: { 
    type: String,
    maxlength: [500, 'Comment cannot exceed 500 characters']
  },
  professionalism: { 
    type: Number,
    min: [1, 'Professionalism rating must be at least 1'],
    max: [5, 'Professionalism rating cannot exceed 5']
  },
  communication: { 
    type: Number,
    min: [1, 'Communication rating must be at least 1'],
    max: [5, 'Communication rating cannot exceed 5']
  },
  quality: { 
    type: Number,
    min: [1, 'Quality rating must be at least 1'],
    max: [5, 'Quality rating cannot exceed 5']
  },
  context: {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    serviceType: String,
    platform: String
  },
  isVerified: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: true },
  helpful: { type: Number, default: 0 },
  notHelpful: { type: Number, default: 0 },
  response: {
    comment: String,
    respondedAt: Date
  },
  votes: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    value: { type: Boolean, required: true },
    votedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for overall rating
reviewSchema.virtual('overallRating').get(function() {
  const ratings = [this.rating, this.professionalism, this.communication, this.quality];
  const validRatings = ratings.filter(r => r !== undefined);
  return validRatings.length > 0 ? 
    validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length : 
    this.rating;
});

// Virtual for helpful score
reviewSchema.virtual('helpfulScore').get(function() {
  const total = this.helpful + this.notHelpful;
  return total > 0 ? (this.helpful / total) * 100 : 0;
});

// Mark as verified
reviewSchema.methods.markVerified = function() {
  this.isVerified = true;
  return this.save();
};

// Add response
reviewSchema.methods.addResponse = function(comment) {
  this.response = {
    comment,
    respondedAt: new Date()
  };
  return this.save();
};

// Vote helpful
reviewSchema.methods.voteHelpful = function() {
  this.helpful += 1;
  return this.save();
};

// Vote not helpful
reviewSchema.methods.voteNotHelpful = function() {
  this.notHelpful += 1;
  return this.save();
};

// Idempotent per-user voting with ability to change vote
reviewSchema.methods.applyUserVote = async function(userId, isHelpful) {
  const userIdStr = userId.toString();
  if (!Array.isArray(this.votes)) this.votes = [];
  const existing = this.votes.find(v => v.userId.toString() === userIdStr);

  if (!existing) {
    // New vote
    if (isHelpful) {
      this.helpful += 1;
    } else {
      this.notHelpful += 1;
    }
    this.votes.push({ userId, value: isHelpful, votedAt: new Date() });
    return this.save();
  }

  // No change in vote
  if (existing.value === isHelpful) {
    return this; // no save needed
  }

  // Reverse previous and apply new
  if (existing.value) {
    this.helpful = Math.max(0, this.helpful - 1);
  } else {
    this.notHelpful = Math.max(0, this.notHelpful - 1);
  }

  if (isHelpful) {
    this.helpful += 1;
  } else {
    this.notHelpful += 1;
  }

  existing.value = isHelpful;
  existing.votedAt = new Date();
  return this.save();
};

// Check if user can review
// Rules: allow multiple reviews between same users, but prevent duplicates for the
// exact same order/context (transactionId or offerId or campaignId when provided)
reviewSchema.statics.canUserReview = async function(reviewerId, revieweeId, context = {}) {
  // If there is a strong context identifier, ensure only one review per context
  const contextQuery = {};
  if (context.transactionId) contextQuery['context.transactionId'] = context.transactionId;
  if (context.offerId) contextQuery['context.offerId'] = context.offerId;
  if (context.campaignId) contextQuery['context.campaignId'] = context.campaignId;

  // If no context identifiers provided, allow multiple reviews
  if (Object.keys(contextQuery).length === 0) {
    return true;
  }

  const existing = await this.findOne({ reviewerId, revieweeId, ...contextQuery });
  return !existing;
};

// Get average ratings for user
reviewSchema.statics.getUserAverageRatings = async function(userId) {
  const reviews = await this.find({ revieweeId: userId, isPublic: true });
  
  if (reviews.length === 0) {
    return {
      overall: 0,
      professionalism: 0,
      communication: 0,
      quality: 0,
      totalReviews: 0
    };
  }

  const averages = reviews.reduce((acc, review) => {
    acc.overall += review.rating;
    acc.professionalism += review.professionalism || 0;
    acc.communication += review.communication || 0;
    acc.quality += review.quality || 0;
    return acc;
  }, { overall: 0, professionalism: 0, communication: 0, quality: 0 });

  const total = reviews.length;
  return {
    overall: averages.overall / total,
    professionalism: averages.professionalism / total,
    communication: averages.communication / total,
    quality: averages.quality / total,
    totalReviews: total
  };
};

// Indexes for better performance
reviewSchema.index({ reviewerId: 1 });
reviewSchema.index({ revieweeId: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ isVerified: 1 });
reviewSchema.index({ 'context.campaignId': 1 });
reviewSchema.index({ 'context.offerId': 1 });

// Helpful single-field indexes retained; no compound unique index so multiple
// reviews between same users are allowed. To keep performance for context-based
// checks, add indexes below.
reviewSchema.index({ 'context.transactionId': 1 });
reviewSchema.index({ 'context.offerId': 1 });
reviewSchema.index({ 'context.campaignId': 1 });

module.exports = mongoose.model('Review', reviewSchema);
