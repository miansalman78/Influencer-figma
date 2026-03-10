const mongoose = require('mongoose');
const { getAllValidServiceIds } = require('../utils/serviceHelpers');
const { categories } = require('../utils/categories');

const offerSchema = new mongoose.Schema({
  creatorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  title: { 
    type: String, 
    required: [true, 'Offer title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  serviceType: { 
    type: String,
    validate: {
      validator: function(value) {
        // Service type is optional for drafts
        if (this.status === 'draft' && !value) return true;
        // For published offers, validate against services from serviceController
        if (this.status !== 'draft' && !value) return false;
        if (value) {
          const { isValidService } = require('../utils/serviceHelpers');
          return isValidService(value);
        }
        return true;
      },
      message: 'Service type must be a valid service ID from the services list'
    },
    required: function() {
      // Service type is required for published offers, optional for drafts
      return this.status !== 'draft';
    }
  },
  platform: [{ 
    type: String,
    enum: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'],
    required: function() {
      // Platform is required for published offers, optional for drafts
      return this.status !== 'draft';
    }
  }],
  rate: {
    ngn: {
      type: Number,
      min: [1, 'NGN rate must be at least 1'],
      default: null
    },
    usd: {
      type: Number,
      min: [1, 'USD rate must be at least 1'],
      default: null
    }
  },
  deliveryDays: { 
    type: Number, 
    required: function() {
      // Delivery days is required for published offers, optional for drafts
      return this.status !== 'draft';
    },
    min: [1, 'Delivery days must be at least 1'],
    max: [30, 'Delivery days cannot exceed 30']
  },
  duration: { 
    type: Number, 
    required: function() {
      // Duration is required for published offers, optional for drafts
      return this.status !== 'draft';
    },
    min: [1, 'Duration must be at least 1 day'],
    max: [365, 'Duration cannot exceed 365 days']
  },
  quantity: { 
    type: Number, 
    required: function() {
      // Quantity is required for published offers, optional for drafts
      return this.status !== 'draft';
    },
    min: [1, 'Quantity must be at least 1'],
    max: [100, 'Quantity cannot exceed 100']
  },
  description: { 
    type: String, 
    required: function() {
      // Description is required for published offers, optional for drafts
      return this.status !== 'draft';
    },
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  media: [{ 
    url: String,
    type: { type: String, enum: ['image', 'video'] },
    caption: String
  }],
  isCustom: { 
    type: Boolean, 
    default: false 
  },
  sentToBrands: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: { 
    type: String, 
    enum: ['draft', 'active', 'accepted', 'completed', 'cancelled'],
    default: 'draft'
  },
  category: { 
    type: String,
    enum: categories,
    validate: {
      validator: function(value) {
        if (!value) return true; // Optional field
        const { isValidCategory } = require('../utils/categories');
        return isValidCategory(value);
      },
      message: 'Category must be a valid category from the categories list'
    }
  },
  tags: [{ type: String }],
  isNegotiable: { type: Boolean, default: true },
  minOrder: { type: Number, default: 1 },
  maxOrder: { type: Number },
  revisions: { type: Number, default: 2 },
  requirements: { type: String },
  portfolio: [{ 
    url: String,
    type: { type: String, enum: ['image', 'video'] },
    title: String,
    description: String
  }],
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  orders: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  location: {
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number }
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for average rating
offerSchema.virtual('averageRating').get(function() {
  return this.totalReviews > 0 ? (this.rating / this.totalReviews) : 0;
});

// Virtual for completion rate
offerSchema.virtual('completionRate').get(function() {
  return this.orders > 0 ? ((this.orders - (this.status === 'cancelled' ? 1 : 0)) / this.orders) * 100 : 0;
});

// Increment views
offerSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Add order
offerSchema.methods.addOrder = function() {
  this.orders += 1;
  return this.save();
};

// Update rating
offerSchema.methods.updateRating = function(newRating) {
  const totalRating = (this.rating * this.totalReviews) + newRating;
  this.totalReviews += 1;
  this.rating = totalRating / this.totalReviews;
  return this.save();
};

// Check if offer is available
offerSchema.methods.isAvailable = function() {
  return this.status === 'active' && this.isActive;
};

// Validate that at least one currency rate is provided (only for published offers)
offerSchema.pre('validate', function(next) {
  // Rate is required only for published offers (not drafts)
  if (this.status !== 'draft' && !this.rate.ngn && !this.rate.usd) {
    this.invalidate('rate', 'At least one currency rate (NGN or USD) is required');
  }
  next();
});

// Indexes for better performance
offerSchema.index({ creatorId: 1 });
offerSchema.index({ serviceType: 1 });
offerSchema.index({ platform: 1 });
offerSchema.index({ status: 1 });
offerSchema.index({ category: 1 });
offerSchema.index({ 'rate.ngn': 1 });
offerSchema.index({ 'rate.usd': 1 });
offerSchema.index({ featured: 1 });
offerSchema.index({ isCustom: 1, sentToBrands: 1 });
offerSchema.index({ createdAt: -1 });
offerSchema.index({ rating: -1 });
offerSchema.index({ 'location.city': 1 });
offerSchema.index({ 'location.state': 1 });
offerSchema.index({ 'location.country': 1 });
offerSchema.index({ 'location.coordinates': '2dsphere' });

module.exports = mongoose.model('Offer', offerSchema);
