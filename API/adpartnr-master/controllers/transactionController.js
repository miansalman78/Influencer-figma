const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const { successResponse, errorResponse, createdResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');
const { buildTransactionQuery, getBrandNameFromTransaction, formatTransactionMetadata } = require('../utils/queryHelpers');
const { runInTransaction } = require('../utils/transactionWrapper');
const { 
  calculatePlatformFee, 
  calculateNetAmount, 
  getBrandName, 
  updateCreatorWallet, 
  updateUserWalletBalance,
  hasEarningTransaction,
  completeWithdrawalBalances,
  releasePendingWithdrawal,
  formatTransactionForList
} = require('../utils/transactionHelpers');
const { canUpdateTransaction, isBrandOwner } = require('../utils/authorizationHelpers');

// Get transaction history with filters
const getTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, type, status } = req.query;
    const queryObj = buildTransactionQuery(userId, { type, status });
    const query = Transaction.find(queryObj)
      .populate('metadata.orderId', 'title compensation')
      .populate('metadata.brandId', 'name')
      .populate('metadata.campaignId', 'name')
      .sort({ createdAt: -1 });
    const { data, pagination } = await applyPagination(query, page, limit);
    const formattedTransactions = await formatTransactionsWithBrandName(data);
    return successResponse(res, { transactions: formattedTransactions, pagination }, 'Transactions retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Format transactions with brand names
const formatTransactionsWithBrandName = async (transactions) => {
  return Promise.all(transactions.map(transaction => {
    const formatted = formatTransactionForList(transaction);
    if (transaction.type === 'payment' || transaction.type === 'earning') {
      const brandName = getBrandNameFromTransaction(transaction);
      formatted.description = `Payment from ${brandName}`;
    }
    formatted.metadata = formatTransactionMetadata(transaction);
    return formatted;
  }));
};

// Get transaction by ID
const getTransactionById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const transaction = await findTransactionById(id);
    if (!transaction) return errorResponse(res, 'Transaction not found', 404);
    if (transaction.userId.toString() !== userId.toString()) {
      return errorResponse(res, 'Not authorized to view this transaction', 403);
    }
    return successResponse(res, transaction, 'Transaction retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Find transaction by ID with population
const findTransactionById = async (id) => {
  return await Transaction.findById(id)
    .populate('metadata.orderId')
    .populate('metadata.brandId', 'name email profileImage')
    .populate('metadata.campaignId')
    .populate('userId', 'name email');
};

// Create earning transaction (called when order is completed)
// Wrapped in transaction to ensure atomicity: transaction creation + wallet update
// If session is provided, use it (for nested transactions); otherwise create a new transaction
const createEarningTransaction = async (orderId, creatorId, brandId, amount, orderTitle, currency = 'NGN', providedSession = null) => {
  try {
    const brandName = await getBrandName(brandId);
    const platformFee = calculatePlatformFee(amount);
    const netAmount = calculateNetAmount(amount, platformFee);

    // Internal function to perform the actual work
    const performTransaction = async (session) => {
      const Wallet = require('../models/Wallet');
      const User = require('../models/User');
      
      // Create transaction record with session
      const transactions = await Transaction.create([{
        userId: creatorId,
        type: 'earning',
        amount,
        currency,
        status: 'completed',
        description: `Payment from ${brandName}`,
        metadata: { 
          orderId, 
          brandId, 
          currency: currency || 'NGN', 
          fees: platformFee, 
          netAmount 
        },
        paymentMethod: 'wallet',
        processedAt: new Date()
      }], { session });

      const transaction = transactions[0];

      // Update wallet with session
      const wallet = await Wallet.findOne({ userId: creatorId }).session(session);
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
        wallet.totalEarnings += amount;
        await wallet.save({ session });
      } else {
        // Create new wallet if it doesn't exist
        const balances = {
          NGN: currency === 'NGN' ? netAmount : 0,
          USD: currency === 'USD' ? netAmount : 0
        };
        await Wallet.create([{
          userId: creatorId,
          balances,
          pendingWithdrawals: { NGN: 0, USD: 0 },
          totalEarnings: amount
        }], { session });
      }

      // Legacy User.walletBalance field removed - only using Wallet.balances now

      return transaction;
    };

    // If session is provided, use it directly; otherwise create a new transaction
    if (providedSession) {
      return await performTransaction(providedSession);
    } else {
      // Run in transaction to ensure atomicity
      return await runInTransaction(async (session) => {
        return await performTransaction(session);
      });
    }
  } catch (error) {
    console.error('Error creating earning transaction:', error);
    throw error;
  }
};

// Create transaction record
const createTransactionRecord = async (orderId, creatorId, brandId, amount, description, platformFee, netAmount, currency = 'NGN') => {
  return await Transaction.create({
    userId: creatorId,
    type: 'earning',
    amount,
    status: 'completed',
    description,
    metadata: { orderId, brandId, currency: currency || 'NGN', fees: platformFee, netAmount },
    paymentMethod: 'wallet',
    processedAt: new Date()
  });
};

// Create withdrawal transaction (with optional currency conversion)
// Wrapped in transaction to ensure atomicity: validation + wallet update + transaction creation
const createWithdrawalTransaction = async (userId, withdrawalAmount, paymentMethodId, withdrawalCurrency = 'NGN', sourceCurrency = null, conversionDetails = null) => {
  try {
    // Run in transaction to ensure atomicity
    const result = await runInTransaction(async (session) => {
      // Validate withdrawal request with session
      const Wallet = require('../models/Wallet');
      const wallet = await Wallet.findOne({ userId }).session(session);
      if (!wallet) throw new Error('Wallet not found');
      
      const paymentMethod = wallet.paymentMethods.id(paymentMethodId);
      if (!paymentMethod) throw new Error('Payment method not found');
      
      const withdrawalCurrencyKey = withdrawalCurrency.toUpperCase();
      const sourceCurrencyKey = sourceCurrency ? sourceCurrency.toUpperCase() : withdrawalCurrencyKey;
      const needsConversion = sourceCurrencyKey !== withdrawalCurrencyKey;
      
      // Get available balance for the source currency (full balance, not reduced by pending)
      // Double spending is prevented by blocking new withdrawals when pending withdrawals exist
      const availableBalances = wallet.availableBalances || {
        NGN: wallet.balances?.NGN || 0,
        USD: wallet.balances?.USD || 0
      };
      
      const sourceAvailableBalance = availableBalances[sourceCurrencyKey] || 0;
      const sourceAmount = needsConversion && conversionDetails ? Number(conversionDetails.sourceAmount) : Number(withdrawalAmount);
      const finalWithdrawalAmount = Number(withdrawalAmount);
      
      if (sourceAvailableBalance < sourceAmount) {
        const currencySymbol = sourceCurrencyKey === 'USD' ? '$' : '₦';
        throw new Error(`Insufficient ${sourceCurrencyKey} balance. Available: ${currencySymbol}${sourceAvailableBalance.toFixed(sourceCurrencyKey === 'USD' ? 4 : 0)}`);
      }

      // Update pending withdrawal with session
      if (!wallet.pendingWithdrawals || typeof wallet.pendingWithdrawals !== 'object') {
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
      
      // Deduct from source currency balance and round
      const newSourceBalance = (wallet.balances[sourceCurrencyKey] || 0) - sourceAmount;
      wallet.balances[sourceCurrencyKey] = roundBalance(newSourceBalance, sourceCurrencyKey);
      
      // If conversion occurred, DO NOT add to target currency balance
      // The converted amount is being withdrawn, not kept in the wallet
      // We only lock it in pending withdrawals, then it gets sent to the payment method
      
      const newPendingBalance = (wallet.pendingWithdrawals[withdrawalCurrencyKey] || 0) + finalWithdrawalAmount;
      wallet.pendingWithdrawals[withdrawalCurrencyKey] = roundBalance(newPendingBalance, withdrawalCurrencyKey);
      paymentMethod.lastUsedAt = new Date();
      await wallet.save({ session });

      // Legacy User.walletBalance field removed - only using Wallet.balances now

      // Create exchange transaction if conversion occurred
      let exchangeTransaction = null;
      if (needsConversion && conversionDetails) {
        exchangeTransaction = await Transaction.create([{
          userId,
          type: 'exchange',
          amount: sourceAmount,
          currency: sourceCurrencyKey,
          status: 'completed',
          description: `Currency conversion: ${sourceCurrencyKey} → ${withdrawalCurrencyKey}`,
          metadata: {
            fromCurrency: sourceCurrencyKey,
            toCurrency: withdrawalCurrencyKey,
            convertedAmount: finalWithdrawalAmount,
            rate: conversionDetails.rate,
            fee: conversionDetails.fee,
            netAmount: finalWithdrawalAmount
          }
        }], { session });
      }

      // Create withdrawal transaction record with session
      const withdrawalTransaction = await Transaction.create([{
        userId,
        type: 'withdrawal',
        amount: finalWithdrawalAmount,
        currency: withdrawalCurrencyKey,
        status: 'pending',
        description: `Withdrawal to ${paymentMethod.bankName}${needsConversion ? ` (converted from ${sourceCurrencyKey})` : ''}`,
        metadata: { 
          currency: withdrawalCurrencyKey, 
          fees: conversionDetails?.fee || 0, 
          netAmount: withdrawalAmount,
          conversion: needsConversion ? conversionDetails : null
        },
        paymentMethod: 'bank_transfer'
      }], { session });

      return {
        transaction: withdrawalTransaction[0],
        exchangeTransaction: exchangeTransaction ? exchangeTransaction[0] : null
      };
    });

    return result;
  } catch (error) {
    // Only log unexpected errors, not expected business logic errors
    const expectedErrors = [
      'Insufficient',
      'Wallet not found',
      'Payment method not found',
      'Validation failed'
    ];
    const isExpectedError = expectedErrors.some(msg => 
      error.message && error.message.toLowerCase().includes(msg.toLowerCase())
    );
    
    if (!isExpectedError) {
      console.error('Error creating withdrawal transaction:', error);
    }
    throw error;
  }
};

// Validate withdrawal request
const validateWithdrawalRequest = async (userId, amount, paymentMethodId, currency = 'NGN') => {
  const Wallet = require('../models/Wallet');
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw new Error('Wallet not found');
  const paymentMethod = wallet.paymentMethods.id(paymentMethodId);
  if (!paymentMethod) throw new Error('Payment method not found');
  
  // Get available balance for the specified currency (full balance, not reduced by pending)
  // Double spending is prevented by blocking new withdrawals when pending withdrawals exist
  const availableBalances = wallet.availableBalances || {
    NGN: wallet.balances?.NGN || 0,
    USD: wallet.balances?.USD || 0
  };
  
  const currencyKey = currency.toUpperCase();
  const availableBalance = availableBalances[currencyKey] || 0;
  
  if (availableBalance < amount) {
    const currencySymbol = currency === 'USD' ? '$' : '₦';
    throw new Error(`Insufficient available balance. Available: ${currencySymbol}${availableBalance.toLocaleString()}`);
  }
  
  return { wallet, paymentMethod };
};

// Update pending withdrawal
const updatePendingWithdrawal = async (wallet, paymentMethod, amount, currency = 'NGN') => {
  // Ensure wallet has proper structure
  if (!wallet.pendingWithdrawals || typeof wallet.pendingWithdrawals !== 'object') {
    throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
  }
  
  const currencyKey = currency.toUpperCase();
  if (wallet.pendingWithdrawals[currencyKey] !== undefined) {
    wallet.pendingWithdrawals[currencyKey] = (wallet.pendingWithdrawals[currencyKey] || 0) + amount;
  } else {
    wallet.pendingWithdrawals[currencyKey] = amount;
  }
  
  paymentMethod.lastUsedAt = new Date();
  await wallet.save();
};

// Create withdrawal transaction record
const createWithdrawalRecord = async (userId, amount, paymentMethod, currency) => {
  return await Transaction.create({
    userId,
    type: 'withdrawal',
    amount,
    status: 'pending',
    description: `Withdrawal to ${paymentMethod.bankName}`,
    metadata: { currency: currency || 'NGN', fees: 0, netAmount: amount },
    paymentMethod: 'bank_transfer'
  });
};

// Complete withdrawal (admin action or webhook)
// Wrapped in transaction to ensure atomicity: transaction update + wallet update
const completeWithdrawal = async (transactionId) => {
  try {
    // Run in transaction to ensure atomicity
    const result = await runInTransaction(async (session) => {
      // Validate withdrawal completion with session
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.type !== 'withdrawal') throw new Error('Transaction is not a withdrawal');
      if (transaction.status !== 'pending') throw new Error('Withdrawal already processed');

      const currency = transaction.metadata?.currency || 'NGN';
      
      // Update wallet balances with session
      const Wallet = require('../models/Wallet');
      const User = require('../models/User');
      const wallet = await Wallet.findOne({ userId: transaction.userId }).session(session);
      if (wallet) {
        // Ensure wallet has proper structure
        if (!wallet.balances || typeof wallet.balances !== 'object') {
          throw new Error('Wallet structure is invalid. Please run migration script: node scripts/migrateWallets.js');
        }
        if (!wallet.pendingWithdrawals || typeof wallet.pendingWithdrawals !== 'object') {
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
        
        const currencyKey = currency.toUpperCase();
        const isConvertedWithdrawal = transaction.metadata?.conversion !== null && transaction.metadata?.conversion !== undefined;
        
        // For converted withdrawals:
        // - Source currency was already deducted when withdrawal was created
        // - Target currency was never added to balance (it's being withdrawn)
        // - So we only need to release the pending withdrawal, NOT deduct from balance
        // For normal withdrawals (no conversion):
        // - Deduct from balance and release pending withdrawal
        if (!isConvertedWithdrawal) {
          // Normal withdrawal: deduct from balance
          const newBalance = Math.max(0, (wallet.balances[currencyKey] || 0) - transaction.amount);
          wallet.balances[currencyKey] = roundBalance(newBalance, currencyKey);
        }
        // For both types: release pending withdrawal
        const newPending = Math.max(0, (wallet.pendingWithdrawals[currencyKey] || 0) - transaction.amount);
        wallet.pendingWithdrawals[currencyKey] = roundBalance(newPending, currencyKey);
        
        wallet.totalWithdrawn += transaction.amount;
        await wallet.save({ session });
      }
      
      // Legacy User.walletBalance field removed - only using Wallet.balances now

      // Update transaction status with session
      transaction.status = 'completed';
      transaction.processedAt = new Date();
      await transaction.save({ session });

      return transaction;
    });

    return result;
  } catch (error) {
    // Only log unexpected errors, not expected business logic errors
    const expectedErrors = [
      'Insufficient available balance',
      'Wallet not found',
      'Payment method not found',
      'Transaction not found',
      'Validation failed'
    ];
    const isExpectedError = expectedErrors.some(msg => 
      error.message && error.message.toLowerCase().includes(msg.toLowerCase())
    );
    
    if (!isExpectedError) {
      console.error('Error completing withdrawal:', error);
    }
    throw error;
  }
};

// Validate withdrawal completion
const validateWithdrawalCompletion = async (transactionId) => {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw new Error('Transaction not found');
  if (transaction.type !== 'withdrawal') throw new Error('Transaction is not a withdrawal');
  if (transaction.status !== 'pending') throw new Error('Withdrawal already processed');
  return transaction;
};

// Create earning transaction manually (admin/brand)
const createEarningTransactionAPI = async (req, res) => {
  try {
    const { orderId, creatorId, brandId, amount, description, currency = 'NGN' } = req.body;
    await validateEarningTransactionRequest(req, orderId, creatorId, brandId, amount);
    const brandName = await getBrandName(brandId);
    const platformFee = calculatePlatformFee(amount);
    const netAmount = calculateNetAmount(amount, platformFee);
    const transactionDescription = description || `Payment from ${brandName}`;
    const transaction = await createTransactionRecord(orderId, creatorId, brandId, amount, transactionDescription, platformFee, netAmount, currency);
    await updateCreatorWallet(creatorId, netAmount, amount, currency);
    // Only update user wallet balance for NGN (legacy field)
    if (currency === 'NGN') {
      await updateUserWalletBalance(creatorId, netAmount);
    }
    const populatedTransaction = await populateTransaction(transaction._id);
    return createdResponse(res, populatedTransaction, 'Earning transaction created successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Validate earning transaction request
const validateEarningTransactionRequest = async (req, orderId, creatorId, brandId, amount) => {
  if (!orderId || !creatorId || !brandId || !amount) {
    throw new Error('orderId, creatorId, brandId, and amount are required');
  }
  if (amount <= 0) throw new Error('Amount must be greater than 0');
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (!isBrandOwner(order.brandId, req.user._id, req.user.role)) {
    throw new Error('Not authorized to create earning transaction for this order');
  }
  if (await hasEarningTransaction(orderId, creatorId)) {
    throw new Error('Earning transaction already exists for this order');
  }
};

// Populate transaction with related data
const populateTransaction = async (transactionId) => {
  return await Transaction.findById(transactionId)
    .populate('metadata.orderId', 'title compensation')
    .populate('metadata.brandId', 'name email profileImage')
    .populate('userId', 'name email');
};

// Update transaction (admin/brand for updating status, etc.)
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description } = req.body;
    const transaction = await Transaction.findById(id);
    if (!transaction) return errorResponse(res, 'Transaction not found', 404);
    if (!canUpdateTransaction(transaction, req.user._id, req.user.role)) {
      return errorResponse(res, 'Not authorized to update this transaction', 403);
    }
    await processTransactionUpdates(transaction, status, description);
    const updatedTransaction = await populateTransaction(id);
    return successResponse(res, updatedTransaction, 'Transaction updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Process transaction updates
const processTransactionUpdates = async (transaction, status, description) => {
  const updates = {};
  if (status !== undefined) {
    validateStatusUpdate(transaction, status);
    await handleStatusUpdate(transaction, status, updates);
    updates.status = status;
  }
  if (description !== undefined) {
    validateDescription(description);
    updates.description = sanitizeString(description);
  }
  Object.keys(updates).forEach(key => { transaction[key] = updates[key]; });
  await transaction.save();
};

// Validate status update
const validateStatusUpdate = (transaction, status) => {
  const validStatuses = ['pending', 'completed', 'failed', 'cancelled'];
  if (!validStatuses.includes(status)) throw new Error('Invalid status');
  if (transaction.status === 'completed' && status !== 'completed') {
    throw new Error('Cannot change status of completed transaction');
  }
};

// Handle status update logic
const handleStatusUpdate = async (transaction, status, updates) => {
  const currency = transaction.metadata?.currency || 'NGN';
  if (status === 'completed' && transaction.status === 'pending' && transaction.type === 'withdrawal') {
    await completeWithdrawalBalances(transaction.userId, transaction.amount, currency);
    updates.processedAt = new Date();
  }
  if ((status === 'failed' || status === 'cancelled') && transaction.type === 'withdrawal' && transaction.status === 'pending') {
    await releasePendingWithdrawal(transaction.userId, transaction.amount, currency);
    updates.processedAt = new Date();
  }
};

// Validate description
const validateDescription = (description) => {
  if (typeof description !== 'string' || description.length > 200) {
    throw new Error('Description must be a string and cannot exceed 200 characters');
  }
};

module.exports = {
  getTransactions,
  getTransactionById,
  createEarningTransaction,
  createEarningTransactionAPI,
  createWithdrawalTransaction,
  completeWithdrawal,
  updateTransaction
};

