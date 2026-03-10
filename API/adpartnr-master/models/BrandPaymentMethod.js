const mongoose = require('mongoose');

const billingAddressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true },
  zipCode: { type: String, trim: true }
}, { _id: false });

const bankAccountSchema = new mongoose.Schema({
  bankName: {
    type: String,
    required: true,
    trim: true
  },
  accountNumber: {
    type: String,
    required: true,
    trim: true
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  bankCode: { type: String, trim: true }, // For Nigerian banks
  routingNumber: { type: String, trim: true }, // For US banks
  swiftCode: { type: String, trim: true }, // For international transfers
  accountType: {
    type: String,
    enum: ['checking', 'savings', 'current'],
    default: 'checking'
  }
}, { _id: false });

const cardDetailsSchema = new mongoose.Schema({
  last4: {
    type: String,
    required: true,
    match: [/^\d{4}$/, 'Last 4 digits must be 4 digits']
  },
  brand: {
    type: String,
    required: true,
    enum: ['visa', 'mastercard', 'amex', 'discover', 'other']
  },
  expiryMonth: {
    type: Number,
    required: true,
    min: [1, 'Month must be between 1 and 12'],
    max: [12, 'Month must be between 1 and 12']
  },
  expiryYear: {
    type: Number,
    required: true,
    min: [new Date().getFullYear(), 'Year cannot be in the past']
  },
  cardholderName: {
    type: String,
    required: true,
    trim: true
  },
  billingAddress: billingAddressSchema,
  gatewayToken: {
    type: String,
    required: true,
    trim: true
  },
  gatewayProvider: {
    type: String,
    required: true,
    enum: ['paystack', 'flutterwave', 'stripe']
  },
  gatewayCustomerId: { type: String, trim: true }, // Gateway's customer ID
  requiresCvv: {
    type: Boolean,
    default: false
  } // Whether gateway requires CVV for charges
}, { _id: false });

const paypalAccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  }
}, { _id: false });

const brandPaymentMethodSchema = new mongoose.Schema({
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['bank_account', 'card', 'paypal']
  },
  currency: {
    type: String,
    required: true,
    enum: ['NGN', 'USD', 'GBP', 'EUR'],
    default: 'NGN'
  },
  // Type-specific data (only one will be populated based on type)
  bankAccount: bankAccountSchema,
  cardDetails: cardDetailsSchema,
  paypalAccount: paypalAccountSchema,
  // Common fields
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: { type: Date },
  lastUsedAt: { type: Date },
  // Metadata
  nickname: { type: String, trim: true }, // User-friendly name like "My Business Card"
  notes: { type: String, trim: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Validation: Ensure type-specific data is provided
brandPaymentMethodSchema.pre('validate', function (next) {
  if (this.type === 'bank_account' && !this.bankAccount) {
    return next(new Error('Bank account details are required for bank_account type'));
  }
  if (this.type === 'card' && !this.cardDetails) {
    return next(new Error('Card details are required for card type'));
  }
  if (this.type === 'paypal' && !this.paypalAccount) {
    return next(new Error('PayPal account details are required for paypal type'));
  }
  next();
});

// Ensure only one default payment method per brand per currency
brandPaymentMethodSchema.pre('save', async function (next) {
  if (this.isDefault && this.isNew) {
    await mongoose.model('BrandPaymentMethod').updateMany(
      {
        brandId: this.brandId,
        currency: this.currency,
        isDefault: true,
        _id: { $ne: this._id }
      },
      { $set: { isDefault: false } }
    );
  }
  next();
});

// Indexes
brandPaymentMethodSchema.index({ brandId: 1, currency: 1 });
brandPaymentMethodSchema.index({ brandId: 1, isDefault: 1 });
brandPaymentMethodSchema.index({ brandId: 1, type: 1 });
brandPaymentMethodSchema.index({ 'cardDetails.gatewayToken': 1 });

module.exports = mongoose.model('BrandPaymentMethod', brandPaymentMethodSchema);

