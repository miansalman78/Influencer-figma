const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'payment', 'refund', 'commission', 'earning', 'exchange'],
    required: true
  },
  amount: { 
    type: Number, 
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be at least 0.01']
  },
  currency: {
    type: String,
    enum: ['NGN', 'USD'],
    default: 'NGN'
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paystackRef: { 
    type: String,
    unique: true,
    sparse: true
  },
  paystackAccessCode: { type: String },
  description: { 
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  metadata: {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For earnings - brand who paid
    currency: { type: String, default: 'NGN' },
    fees: { type: Number, default: 0 },
    netAmount: { type: Number }
  },
  paymentMethod: { 
    type: String,
    enum: ['card', 'bank_transfer', 'wallet', 'paystack', 'paypal', 'stripe', 'flutterwave'],
    default: 'paystack'
  },
  failureReason: { type: String },
  processedAt: { type: Date },
  expiresAt: { type: Date }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for net amount
transactionSchema.virtual('calculatedNetAmount').get(function() {
  return this.amount - (this.metadata.fees || 0);
});

// Virtual for is expired
transactionSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Mark as completed
transactionSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.processedAt = new Date();
  return this.save();
};

// Mark as failed
transactionSchema.methods.markFailed = function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  this.processedAt = new Date();
  return this.save();
};

// Check if transaction is valid
transactionSchema.methods.isValid = function() {
  return this.status === 'pending' && 
         (!this.expiresAt || new Date() < this.expiresAt);
};

// Calculate fees
transactionSchema.methods.calculateFees = function() {
  const feePercentage = 0.025; // 2.5% fee
  const fixedFee = 50; // 50 NGN fixed fee
  const calculatedFee = (this.amount * feePercentage) + fixedFee;
  
  this.metadata.fees = Math.round(calculatedFee);
  this.metadata.netAmount = this.amount - this.metadata.fees;
  
  return this.metadata.fees;
};

// Indexes for better performance
transactionSchema.index({ userId: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ paystackRef: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ amount: 1 });
transactionSchema.index({ 'metadata.campaignId': 1 });
transactionSchema.index({ 'metadata.offerId': 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
