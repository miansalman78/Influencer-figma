const mongoose = require('mongoose');

const paymentIntentSchema = new mongoose.Schema({
  intentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  paymentMethodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BrandPaymentMethod',
    required: true
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'NGN'
  },
  gatewayProvider: {
    type: String,
    required: true,
    enum: ['stripe', 'paystack', 'flutterwave', 'paypal']
  },
  clientSecret: {
    type: String // For Stripe
  },
  paymentReference: {
    type: String // For Paystack/Flutterwave
  },
  authorizationCode: {
    type: String // For Paystack
  },
  cardToken: {
    type: String // For Flutterwave
  },
  paypalOrderId: {
    type: String // PayPal order ID
  },
  payerId: {
    type: String // PayPal payer ID
  },
  paypalApprovalUrl: {
    type: String // PayPal approval URL for redirect
  },
  status: {
    type: String,
    enum: ['pending', 'requires_action', 'succeeded', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  requiresAction: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiry: 24 hours from creation
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    },
    index: true
  },
  confirmedAt: {
    type: Date
  },
  gatewayReference: {
    type: String // Final transaction reference after confirmation
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed // Store additional data like currency conversion
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for is expired
paymentIntentSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Virtual for is valid
paymentIntentSchema.virtual('isValid').get(function() {
  return this.status === 'pending' && !this.isExpired;
});

// Mark as confirmed
paymentIntentSchema.methods.markConfirmed = function(gatewayReference) {
  this.status = 'succeeded';
  this.confirmedAt = new Date();
  if (gatewayReference) {
    this.gatewayReference = gatewayReference;
  }
  return this.save();
};

// Mark as failed
paymentIntentSchema.methods.markFailed = function() {
  this.status = 'failed';
  return this.save();
};

// Mark as requires action
paymentIntentSchema.methods.markRequiresAction = function() {
  this.status = 'requires_action';
  this.requiresAction = true;
  return this.save();
};

// Indexes
paymentIntentSchema.index({ brandId: 1, status: 1 });
paymentIntentSchema.index({ orderId: 1 });
paymentIntentSchema.index({ createdAt: -1 });
paymentIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-cleanup

module.exports = mongoose.model('PaymentIntent', paymentIntentSchema);

