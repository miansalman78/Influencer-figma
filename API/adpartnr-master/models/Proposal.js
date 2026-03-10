const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  campaignId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Campaign', 
    required: true,
    index: true
  },
  creatorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  message: { 
    type: String, 
    required: [true, 'Proposal message is required'],
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  proposedDeliverables: [{
    type: { 
      type: String,
      required: true
    },
    quantity: { type: Number, default: 1, min: 1 },
    platform: { 
      type: String,
      enum: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'],
      required: true
    },
    description: { type: String } // Optional description for the deliverable
  }],
  compensation: {
    type: { 
      type: String,
      enum: ['fixed_price', 'free_product', 'in_kind'],
      required: true
    },
    amount: { type: Number, default: 0 },
    description: { type: String }
  },
  currency: {
    type: String,
    enum: ['NGN', 'USD'],
    default: 'NGN'
  },
  estimatedDeliveryDays: { 
    type: Number, 
    required: true,
    min: [1, 'Delivery days must be at least 1'],
    max: [90, 'Delivery days cannot exceed 90']
  },
  duration: { 
    type: Number, 
    min: [1, 'Duration must be at least 1 day'],
    max: [365, 'Duration cannot exceed 365 days'],
    description: 'Number of days the content will stay visible on creator\'s page (required for influencer services)'
  },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
    default: 'pending'
  },
  reviewedAt: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Prevent duplicate proposals from same creator for same campaign
proposalSchema.index({ campaignId: 1, creatorId: 1 }, { unique: true });

// Indexes
proposalSchema.index({ campaignId: 1, status: 1 });
proposalSchema.index({ creatorId: 1, status: 1 });
proposalSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Proposal', proposalSchema);

