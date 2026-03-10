const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  accountNumber: {
    type: String,
    required: [true, 'Account number is required'],
    trim: true
  },
  accountName: {
    type: String,
    required: [true, 'Account name is required'],
    trim: true
  },
  currency: {
    type: String,
    enum: ['NGN', 'USD'],
    default: 'NGN',
    required: true
  },
  routingNumber: { type: String, trim: true }, // For US banks
  swiftCode: { type: String, trim: true }, // For international transfers
  accountType: {
    type: String,
    enum: ['checking', 'savings', 'current'],
    default: 'checking'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: { type: Date },
  lastUsedAt: { type: Date }
}, { _id: true });

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  balances: {
    NGN: {
      type: Number,
      default: 0,
      min: [0, 'NGN balance cannot be negative']
    },
    USD: {
      type: Number,
      default: 0,
      min: [0, 'USD balance cannot be negative']
    }
  },
  // Legacy balance and currency fields removed - using balances object instead
  paymentMethods: [bankAccountSchema],
  pendingWithdrawals: {
    NGN: {
      type: Number,
      default: 0,
      min: [0, 'NGN pending withdrawals cannot be negative']
    },
    USD: {
      type: Number,
      default: 0,
      min: [0, 'USD pending withdrawals cannot be negative']
    }
  },
  totalEarnings: {
    type: Number,
    default: 0,
    min: [0, 'Total earnings cannot be negative']
  },
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: [0, 'Total withdrawn cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Helper function to round balance to appropriate precision and zero out tiny values
const roundBalance = (amount, currency) => {
  if (currency === 'USD') {
    // Round to 4 decimal places for USD
    const rounded = Math.round(amount * 10000) / 10000;
    // If very close to zero (within epsilon), set to exactly 0
    return Math.abs(rounded) < 0.0001 ? 0 : rounded;
  } else {
    // Round to whole number for NGN
    const rounded = Math.round(amount);
    // If very close to zero (within epsilon), set to exactly 0
    return Math.abs(rounded) < 0.01 ? 0 : rounded;
  }
};

// Pre-save hook - ensure new wallets have proper structure and round balances
walletSchema.pre('save', function (next) {
  // Initialize balances for new documents
  if (this.isNew && (!this.balances || typeof this.balances !== 'object')) {
    this.balances = {
      NGN: 0,
      USD: 0
    };
  }

  // Initialize pendingWithdrawals for new documents
  if (this.isNew && (!this.pendingWithdrawals || typeof this.pendingWithdrawals !== 'object')) {
    this.pendingWithdrawals = {
      NGN: 0,
      USD: 0
    };
  }

  // Ensure balances structure is correct and round to prevent floating-point errors
  if (this.balances && typeof this.balances === 'object') {
    if (typeof this.balances.NGN !== 'number') {
      this.balances.NGN = 0;
    } else {
      this.balances.NGN = roundBalance(this.balances.NGN, 'NGN');
    }
    if (typeof this.balances.USD !== 'number') {
      this.balances.USD = 0;
    } else {
      this.balances.USD = roundBalance(this.balances.USD, 'USD');
    }
  }

  // Ensure pendingWithdrawals structure is correct and round to prevent floating-point errors
  if (this.pendingWithdrawals && typeof this.pendingWithdrawals === 'object') {
    if (typeof this.pendingWithdrawals.NGN !== 'number') {
      this.pendingWithdrawals.NGN = 0;
    } else {
      this.pendingWithdrawals.NGN = roundBalance(this.pendingWithdrawals.NGN, 'NGN');
    }
    if (typeof this.pendingWithdrawals.USD !== 'number') {
      this.pendingWithdrawals.USD = 0;
    } else {
      this.pendingWithdrawals.USD = roundBalance(this.pendingWithdrawals.USD, 'USD');
    }
  }

  next();
});

// Virtual for available balance per currency (shows full balance, not reduced by pending withdrawals)
// We prevent double spending by blocking new withdrawals if there's already a pending withdrawal
walletSchema.virtual('availableBalances').get(function () {
  const balances = this.balances || { NGN: 0, USD: 0 };

  // Return full balance as available (not reduced by pending withdrawals)
  // Double spending is prevented by blocking new withdrawals when pending withdrawals exist
  return {
    NGN: Math.round(balances.NGN || 0),
    USD: Math.round((balances.USD || 0) * 10000) / 10000 // Round to 4 decimal places
  };
});

// Legacy virtual for backward compatibility (uses NGN)
// Returns full balance, not reduced by pending withdrawals
walletSchema.virtual('availableBalance').get(function () {
  const balances = this.balances || { NGN: 0, USD: 0 };
  return balances.NGN || 0;
});

// Ensure only one default payment method
walletSchema.methods.setDefaultPaymentMethod = function (paymentMethodId) {
  // Set all to false first
  this.paymentMethods.forEach(method => {
    method.isDefault = false;
  });

  // Set the selected one as default
  const method = this.paymentMethods.id(paymentMethodId);
  if (method) {
    method.isDefault = true;
  }

  return this.save();
};

// Get default payment method
walletSchema.methods.getDefaultPaymentMethod = function () {
  return this.paymentMethods.find(method => method.isDefault) || this.paymentMethods[0] || null;
};

// Add payment method
walletSchema.methods.addPaymentMethod = async function (paymentMethodData) {
  // If this is the first payment method or explicitly set as default, make it default
  if (this.paymentMethods.length === 0 || paymentMethodData.isDefault) {
    this.paymentMethods.forEach(method => {
      method.isDefault = false;
    });
    paymentMethodData.isDefault = true;
  }

  this.paymentMethods.push(paymentMethodData);
  return this.save();
};

// Remove payment method
walletSchema.methods.removePaymentMethod = function (paymentMethodId) {
  const method = this.paymentMethods.id(paymentMethodId);
  if (method && method.isDefault && this.paymentMethods.length > 1) {
    // If removing default, set another as default
    const otherMethod = this.paymentMethods.find(m => m._id.toString() !== paymentMethodId);
    if (otherMethod) {
      otherMethod.isDefault = true;
    }
  }

  this.paymentMethods.pull(paymentMethodId);
  return this.save();
};

// Indexes
walletSchema.index({ userId: 1 });
walletSchema.index({ isActive: 1 });

module.exports = mongoose.model('Wallet', walletSchema);
