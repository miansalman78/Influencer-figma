const mongoose = require('mongoose');
const { categories } = require('../utils/categories');

const requirementSchema = new mongoose.Schema({
  followerRange: {
    range: { 
      type: String,
      enum: ['nano', 'micro', 'mid', 'macro', 'mega'],
      default: 'micro'
    },
    min: { type: Number, default: 0 },
    max: { type: Number }
  },
  followers: {
    min: { type: Number, default: 0 },
    max: { type: Number }
  },
  location: [{ type: String }],
  niche: [{ 
    type: String,
    enum: categories,
    validate: {
      validator: function(value) {
        if (!value) return true; // Optional field
        const { isValidCategory } = require('../utils/categories');
        return isValidCategory(value);
      },
      message: 'Niche must be a valid category from the categories list'
    }
  }],
  ageRange: {
    min: { type: Number, min: 13 },
    max: { type: Number, max: 100 }
  },
  gender: [{ 
    type: String, 
    enum: ['male', 'female', 'non_binary', 'all'] 
  }]
});

const campaignSchema = new mongoose.Schema({
  brandId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: { 
    type: String, 
    required: [true, 'Campaign name is required'],
    trim: true,
    maxlength: [100, 'Campaign name cannot exceed 100 characters']
  },
  description: { 
    type: String, 
    required: [true, 'Campaign description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  budget: { 
    type: Number,
    required: function() {
      return this.compensationType === 'paid' || this.compensationType === 'both';
    },
    min: [1, 'Budget must be at least 1']
  },
  currency: {
    type: String,
    enum: ['NGN', 'USD'],
    default: 'NGN'
  },
  platform: [{ 
    type: String,
    enum: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'],
    required: true
  }],
  mainGoal: { 
    type: String,
    enum: ['brand_awareness', 'content_creation', 'sales', 'lead_generation'],
    required: function() {
      // Main goal is required for published campaigns, optional for drafts
      return this.status !== 'draft';
    }
  },
  goals: [{ 
    type: String,
    enum: [
      'brand_awareness', 'product_launch', 'sales_conversion',
      'engagement', 'followers_growth', 'website_traffic',
      'app_downloads', 'event_promotion', 'seasonal_campaign',
      'content_creation', 'lead_generation'
    ]
  }],
  serviceType: { 
    type: String,
    validate: {
      validator: function(value) {
        // Service type is optional for drafts and in_progress campaigns
        if ((this.status === 'draft' || this.status === 'in_progress') && !value) return true;
        // For published/open campaigns, validate against services from serviceController
        if ((this.status === 'open' || this.status === 'accepting_bids') && !value) return false;
        if (value) {
          const { isValidService } = require('../utils/serviceHelpers');
          return isValidService(value);
        }
        return true;
      },
      message: 'Service type must be a valid service ID from the services list'
    },
    required: function() {
      // Service type is required for published/open campaigns, optional for drafts and in_progress
      return this.status === 'open' || this.status === 'accepting_bids';
    }
  },
  campaignDuration: { 
    type: String,
    trim: true
  },
  postVisibilityDuration: { 
    type: String,
    trim: true
  },
  compensationType: { 
    type: String,
    enum: ['paid', 'free_product', 'both'],
    required: function() {
      // Compensation type is required for published campaigns, optional for drafts
      return this.status !== 'draft';
    }
  },
  budgetRange: {
    min: { type: Number },
    max: { type: Number },
    currency: {
      type: String,
      enum: ['NGN', 'USD'],
      default: 'NGN'
    }
  },
  deliverables: [{ 
    type: String,
    validate: {
      validator: function(value) {
        if (!value) return false;
        const { isValidService } = require('../utils/serviceHelpers');
        return isValidService(value);
      },
      message: 'Each deliverable must be a valid service ID from the services list'
    }
    // required: only when status is not draft (enforced in publishCampaign and in pre-save if needed)
  }],
  requirements: requirementSchema,
  applicants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  hiredCreators: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  status: { 
    type: String, 
    enum: ['draft', 'open', 'accepting_bids', 'in_progress', 'completed', 'cancelled'],
    default: 'draft'
  },
  dueDate: { 
    type: Date, 
    required: function() {
      // Due date is required for published campaigns, optional for drafts
      return this.status !== 'draft';
    },
    validate: {
      validator: function(value) {
        // Only validate if dueDate is provided and campaign is not a draft
        if (!value) return true; // Allow null/undefined for drafts
        if (this.status === 'draft') return true; // Skip validation for drafts
        return value > new Date();
      },
      message: 'Due date must be in the future'
    }
  },
  startDate: { type: Date },
  endDate: { type: Date },
  tags: [{ type: String }],
  isUrgent: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: true },
  maxApplicants: { type: Number, default: 50 },
  applicationDeadline: { type: Date },
  media: [{ 
    url: String,
    type: { type: String, enum: ['image', 'video'] },
    caption: String
  }],
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

// Virtual for applicant count
campaignSchema.virtual('applicantCount').get(function() {
  return Array.isArray(this.applicants) ? this.applicants.length : 0;
});

// Virtual for hired count
campaignSchema.virtual('hiredCount').get(function() {
  return Array.isArray(this.hiredCreators) ? this.hiredCreators.length : 0;
});

// Virtual for remaining budget
campaignSchema.virtual('remainingBudget').get(function() {
  if (!this.budget || !this.maxApplicants) return this.budget || 0;
  const hiredCount = Array.isArray(this.hiredCreators) ? this.hiredCreators.length : 0;
  return this.budget - (hiredCount * this.budget / this.maxApplicants);
});

// Check if campaign is open for applications
campaignSchema.methods.isOpenForApplications = function() {
  const now = new Date();
  const applicantCount = Array.isArray(this.applicants) ? this.applicants.length : 0;
  return this.status === 'open' && 
         (!this.applicationDeadline || now < this.applicationDeadline) &&
         applicantCount < this.maxApplicants;
};

// Add applicant
campaignSchema.methods.addApplicant = function(userId) {
  if (!Array.isArray(this.applicants)) {
    this.applicants = [];
  }
  if (!this.applicants.includes(userId)) {
    this.applicants.push(userId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Hire creator
campaignSchema.methods.hireCreator = function(userId) {
  if (!Array.isArray(this.hiredCreators)) {
    this.hiredCreators = [];
  }
  if (!this.hiredCreators.includes(userId)) {
    this.hiredCreators.push(userId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Indexes for better performance
campaignSchema.index({ brandId: 1 });
campaignSchema.index({ status: 1 });
campaignSchema.index({ platform: 1 });
campaignSchema.index({ dueDate: 1 });
campaignSchema.index({ createdAt: -1 });
campaignSchema.index({ budget: 1 });
campaignSchema.index({ currency: 1 });
campaignSchema.index({ 'requirements.niche': 1 });
campaignSchema.index({ 'location.city': 1 });
campaignSchema.index({ 'location.state': 1 });
campaignSchema.index({ 'location.country': 1 });
campaignSchema.index({ 'location.coordinates': '2dsphere' });

module.exports = mongoose.model('Campaign', campaignSchema);
