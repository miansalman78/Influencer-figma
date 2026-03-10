const Wallet = require('../models/Wallet');
const User = require('../models/User');

// Get or create wallet
// Note: This assumes wallets have been migrated. Run scripts/migrateWallets.js first.
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    // Create new wallet with zero balances
    // Legacy User.walletBalance field removed - start with 0
    wallet = await Wallet.create({
      userId,
      balances: {
        NGN: 0,
        USD: 0
      },
      pendingWithdrawals: {
        NGN: 0,
        USD: 0
      },
      totalEarnings: 0
    });
  }

  // Ensure wallet has proper structure (safety check)
  if (!wallet.balances || typeof wallet.balances !== 'object') {
    throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
  }

  if (!wallet.pendingWithdrawals || typeof wallet.pendingWithdrawals !== 'object') {
    throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
  }

  return wallet;
};

// Format payment method for response
const formatPaymentMethod = (method) => {
  if (!method) return null;
  return {
    id: method._id,
    bankName: method.bankName,
    accountNumber: method.accountNumber ? `**** **** **** ${method.accountNumber.slice(-4)}` : null,
    accountName: method.accountName,
    currency: method.currency || 'NGN',
    accountType: method.accountType,
    isDefault: method.isDefault,
    isVerified: method.isVerified
  };
};

// Format wallet data for response
const formatWalletData = (wallet, paymentMethod) => {
  const balances = wallet.balances || { NGN: 0, USD: 0 };
  const pendingWithdrawals = wallet.pendingWithdrawals || { NGN: 0, USD: 0 };
  const availableBalances = wallet.availableBalances || {
    NGN: Math.max(0, (balances.NGN || 0) - (pendingWithdrawals.NGN || 0)),
    USD: Math.max(0, (balances.USD || 0) - (pendingWithdrawals.USD || 0))
  };

  return {
    balances,
    availableBalances,
    paymentMethod,
    pendingWithdrawals,
    totalEarnings: wallet.totalEarnings || 0,
    totalWithdrawn: wallet.totalWithdrawn || 0
  };
};

// Validate bank account data
const validateBankAccount = (bankName, accountNumber, accountName) => {
  return !!(bankName && accountNumber && accountName);
};

// Check if account already exists
const accountExists = (wallet, accountNumber, bankName) => {
  return wallet.paymentMethods.some(method => method.accountNumber === accountNumber && method.bankName === bankName);
};

module.exports = {
  getOrCreateWallet,
  formatPaymentMethod,
  formatWalletData,
  validateBankAccount,
  accountExists
};
