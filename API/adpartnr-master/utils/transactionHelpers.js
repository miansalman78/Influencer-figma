const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');

// Calculate platform fee (10%)
const calculatePlatformFee = (amount) => Math.round(amount * 0.10);

// Calculate net amount after fee
const calculateNetAmount = (amount, fee) => amount - fee;

// Get brand name by ID
const getBrandName = async (brandId) => {
  const brand = await User.findById(brandId);
  return brand ? brand.name : 'Unknown Brand';
};

// Update creator wallet balance
const updateCreatorWallet = async (creatorId, netAmount, grossAmount, currency = 'NGN') => {
  const wallet = await Wallet.findOne({ userId: creatorId });
  if (wallet) {
    // Ensure wallet has proper structure
    if (!wallet.balances || typeof wallet.balances !== 'object') {
      throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
    }
    
    // Helper to round balance and zero out tiny values
    const roundBalance = (amount, currency) => {
      if (currency === 'USD') {
        const rounded = Math.round(amount * 10000) / 10000;
        return Math.abs(rounded) < 0.0001 ? 0 : rounded;
      } else {
        const rounded = Math.round(amount);
        return Math.abs(rounded) < 0.01 ? 0 : rounded;
      }
    };
    
    // Update balance for the specified currency and round
    const currencyKey = currency.toUpperCase();
    const newBalance = (wallet.balances[currencyKey] || 0) + netAmount;
    wallet.balances[currencyKey] = roundBalance(newBalance, currencyKey);
    wallet.totalEarnings += grossAmount;
    await wallet.save();
  } else {
    const balances = {
      NGN: currency === 'NGN' ? netAmount : 0,
      USD: currency === 'USD' ? netAmount : 0
    };
    await Wallet.create({ 
      userId: creatorId, 
      balances,
      pendingWithdrawals: { NGN: 0, USD: 0 },
      totalEarnings: grossAmount 
    });
  }
};

// Legacy function - no longer used (User.walletBalance field removed)
// Kept for backward compatibility but does nothing
const updateUserWalletBalance = async (userId, amount) => {
  // Legacy field removed - only using Wallet.balances now
  // This function is kept to avoid breaking existing code but does nothing
};

// Check if earning transaction exists for order
const hasEarningTransaction = async (orderId, creatorId) => {
  return await Transaction.findOne({ type: 'earning', 'metadata.orderId': orderId, userId: creatorId });
};

// Complete withdrawal - update balances
const completeWithdrawalBalances = async (userId, amount, currency = 'NGN') => {
  const wallet = await Wallet.findOne({ userId });
  if (wallet) {
    // Ensure wallet has proper structure
    if (!wallet.balances || typeof wallet.balances !== 'object') {
      throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
    }
    if (!wallet.pendingWithdrawals || typeof wallet.pendingWithdrawals !== 'object') {
      throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
    }
    
    const currencyKey = currency.toUpperCase();
    
    // Update balance for the specified currency
    wallet.balances[currencyKey] = Math.max(0, (wallet.balances[currencyKey] || 0) - amount);
    
    // Update pending withdrawals for the specified currency
    wallet.pendingWithdrawals[currencyKey] = Math.max(0, (wallet.pendingWithdrawals[currencyKey] || 0) - amount);
    
    wallet.totalWithdrawn += amount;
    await wallet.save();
  }
  // Update user wallet balance (legacy - only for NGN)
  if (currency === 'NGN') {
    await updateUserWalletBalance(userId, -amount);
  }
};

// Release pending withdrawal (for failed/cancelled)
const releasePendingWithdrawal = async (userId, amount, currency = 'NGN') => {
  const wallet = await Wallet.findOne({ userId });
  if (wallet) {
    // Ensure wallet has proper structure
    if (!wallet.pendingWithdrawals || typeof wallet.pendingWithdrawals !== 'object') {
      throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
    }
    
    const currencyKey = currency.toUpperCase();
    
    // Update pending withdrawals for the specified currency
    wallet.pendingWithdrawals[currencyKey] = Math.max(0, (wallet.pendingWithdrawals[currencyKey] || 0) - amount);
    
    await wallet.save();
  }
};

// Format transaction for list response
const formatTransactionForList = (transaction) => {
  const formatted = {
    id: transaction._id,
    amount: transaction.amount,
    currency: transaction.currency || transaction.metadata?.currency || 'NGN',
    type: transaction.type,
    status: transaction.status,
    description: transaction.description,
    date: transaction.createdAt,
    metadata: transaction.metadata || {}
  };
  
  // Add fee and net amount for earning transactions
  if (transaction.type === 'earning') {
    formatted.fees = transaction.metadata?.fees || 0;
    formatted.netAmount = transaction.metadata?.netAmount || transaction.amount;
    formatted.isEarning = true;
    formatted.displayAmount = transaction.amount; // Gross amount
  } else if (transaction.type === 'payment') {
    formatted.isEarning = true;
    formatted.displayAmount = transaction.amount;
  } else if (transaction.type === 'withdrawal') {
    formatted.description = 'Withdrawal to Bank';
    formatted.isWithdrawal = true;
    formatted.displayAmount = -transaction.amount;
    formatted.fees = transaction.metadata?.fees || 0;
    formatted.netAmount = transaction.metadata?.netAmount || transaction.amount;
  } else {
    formatted.displayAmount = transaction.amount;
  }
  
  return formatted;
};

module.exports = {
  calculatePlatformFee,
  calculateNetAmount,
  getBrandName,
  updateCreatorWallet,
  updateUserWalletBalance,
  hasEarningTransaction,
  completeWithdrawalBalances,
  releasePendingWithdrawal,
  formatTransactionForList
};
