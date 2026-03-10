const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true
  },
  proposalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal',
    required: true,
    index: true
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    index: true
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  deliverables: [{
    type: { type: String },
    quantity: { type: Number, default: 1 },
    platform: { type: String },
    description: { type: String }
  }],
  compensation: {
    type: { type: String, required: true },
    amount: { type: Number, default: 0 },
    description: { type: String }
  },
  status: {
    type: String,
    enum: [
      'pending',
      'content_creation',
      'awaiting_approval',
      'revisions',
      'in_progress',
      'completed',
      'cancelled',
      'rejected'
    ],
    default: 'pending',
    index: true
  },
  rejectionReason: { type: String },
  timeline: {
    startDate: { type: Date },
    dueDate: { type: Date, required: true },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    completedAt: { type: Date }
  },
  deliverablesSubmissions: [{
    url: { type: String, required: true },
    type: { type: String },
    platform: { type: String },
    submittedAt: { type: Date, default: Date.now },
    approved: { type: Boolean, default: false },
    revisionNotes: { type: String }
  }],
  payment: {
    amount: { type: Number, required: true },
    currency: {
      type: String,
      enum: ['NGN', 'USD'],
      default: 'NGN'
    },
    status: {
      type: String,
      enum: ['pending', 'partial', 'completed', 'refunded'],
      default: 'pending'
    },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    paidAt: { type: Date }
  },
  creatorPaid: {
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending'
    },
    paidAt: { type: Date }
  },
  revisions: {
    requested: { type: Number, default: 0 },
    maxAllowed: { type: Number, default: 2 },
    notes: [{
      note: String,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  brief: {
    type: String,
    maxlength: [2000, 'Brief cannot exceed 2000 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for progress percentage (status-based: reflects order state, not time)
orderSchema.virtual('progress').get(function () {
  const statusProgress = {
    pending: 15,
    content_creation: 35,
    in_progress: 40,
    awaiting_approval: 75,
    revisions: 55,
    completed: 100,
    cancelled: 0,
    rejected: 0
  };
  return statusProgress[this.status] !== undefined ? statusProgress[this.status] : 0;
});

// Virtual for days remaining
orderSchema.virtual('daysRemaining').get(function () {
  if (!this.timeline.dueDate || this.status === 'completed' || this.status === 'cancelled') return 0;
  const now = new Date();
  const diff = this.timeline.dueDate - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// Indexes
orderSchema.index({ brandId: 1, status: 1 });
orderSchema.index({ creatorId: 1, status: 1 });
orderSchema.index({ campaignId: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'timeline.dueDate': 1 });

module.exports = mongoose.model('Order', orderSchema);

