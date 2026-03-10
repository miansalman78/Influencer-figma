const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { successResponse, errorResponse, createdResponse, notFoundResponse } = require('../utils/response');
const { sanitizeString } = require('../utils/helpers');
const { getExchangeRate } = require('../utils/exchangeRates');
const { getOrCreateWallet, formatPaymentMethod, formatWalletData, validateBankAccount, accountExists } = require('../utils/walletHelpers');
const { runInTransaction } = require('../utils/transactionWrapper');

// Get wallet balance and details
const getWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const wallet = await getOrCreateWallet(userId);
    const paymentMethod = formatPaymentMethod(wallet.getDefaultPaymentMethod());
    const walletData = formatWalletData(wallet, paymentMethod);
    return successResponse(res, walletData, 'Wallet retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Add payment method (bank account)
const addPaymentMethod = async (req, res) => {
  try {
    const userId = req.user._id;
    const { bankName, accountNumber, accountName, currency, routingNumber, swiftCode, accountType, isDefault } = req.body;
    if (!validateBankAccount(bankName, accountNumber, accountName)) {
      return errorResponse(res, 'Bank name, account number, and account name are required', 400);
    }
    if (currency && !['NGN', 'USD'].includes(currency)) {
      return errorResponse(res, 'Currency must be either NGN or USD', 400);
    }

    // Get or create wallet
    const wallet = await getOrCreateWallet(userId);

    if (accountExists(wallet, accountNumber, bankName)) {
      return errorResponse(res, 'This bank account is already added', 400);
    }

    const paymentMethodData = buildPaymentMethodData(bankName, accountNumber, accountName, currency, routingNumber, swiftCode, accountType, isDefault, wallet);

    // Use direct MongoDB update to add payment method, avoiding save() issues
    const updateQuery = { $push: { paymentMethods: paymentMethodData } };

    // If this should be default, unset all other defaults first
    if (paymentMethodData.isDefault || wallet.paymentMethods.length === 0) {
      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: { 'paymentMethods.$[].isDefault': false } }
      );
      paymentMethodData.isDefault = true;
    }

    // Add the payment method
    await Wallet.updateOne(
      { _id: wallet._id },
      { $push: { paymentMethods: paymentMethodData } }
    );

    // Reload to get the added method
    const updatedWallet = await Wallet.findOne({ userId });
    const addedMethod = updatedWallet.paymentMethods[updatedWallet.paymentMethods.length - 1];
    return createdResponse(res, formatPaymentMethod(addedMethod), 'Payment method added successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Build payment method data
const buildPaymentMethodData = (bankName, accountNumber, accountName, currency, routingNumber, swiftCode, accountType, isDefault, wallet) => {
  const data = {
    bankName: sanitizeString(bankName),
    accountNumber: accountNumber.trim(),
    accountName: sanitizeString(accountName),
    currency: currency || 'NGN',
    accountType: accountType || 'checking',
    isDefault: isDefault !== undefined ? isDefault : wallet.paymentMethods.length === 0
  };
  if (routingNumber) data.routingNumber = routingNumber.trim();
  if (swiftCode) data.swiftCode = swiftCode.trim();
  return data;
};

// Get all payment methods
const getPaymentMethods = async (req, res) => {
  try {
    const userId = req.user._id;
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return successResponse(res, { paymentMethods: [] }, 'No payment methods found');
    const paymentMethods = wallet.paymentMethods.map(method => ({
      ...formatPaymentMethod(method),
      lastUsedAt: method.lastUsedAt
    }));
    return successResponse(res, { paymentMethods }, 'Payment methods retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update payment method (set as default, verify, etc.)
const updatePaymentMethod = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { isDefault, currency } = req.body;
    const wallet = await getOrCreateWallet(userId);

    const paymentMethod = wallet.paymentMethods.id(id);
    if (!paymentMethod) return notFoundResponse(res, 'Payment method not found');

    // Prepare update operations using arrayFilters
    const updateOps = {};
    const arrayFilters = [{ 'method._id': id }];

    // Update currency if provided
    if (currency) {
      if (!['NGN', 'USD'].includes(currency)) {
        return errorResponse(res, 'Currency must be either NGN or USD', 400);
      }
      updateOps['paymentMethods.$[method].currency'] = currency;
    }

    // Set as default if specified
    if (isDefault !== undefined) {
      // First, unset all defaults
      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: { 'paymentMethods.$[].isDefault': false } }
      );
      // Then set this one as default
      updateOps['paymentMethods.$[method].isDefault'] = true;
    }

    // Apply updates using direct MongoDB update with arrayFilters
    if (Object.keys(updateOps).length > 0) {
      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: updateOps },
        { arrayFilters }
      );
    }

    const updatedWallet = await Wallet.findOne({ userId });
    return successResponse(res, formatPaymentMethod(updatedWallet.paymentMethods.id(id)), 'Payment method updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Delete payment method
const deletePaymentMethod = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const wallet = await getOrCreateWallet(userId);

    const paymentMethod = wallet.paymentMethods.id(id);
    if (!paymentMethod) return notFoundResponse(res, 'Payment method not found');
    if (wallet.paymentMethods.length === 1) return errorResponse(res, 'Cannot delete the only payment method', 400);

    // Check if the payment method being deleted is the default
    const isDefault = paymentMethod.isDefault;
    const remainingMethods = wallet.paymentMethods.filter(m => m._id.toString() !== id);

    // Use direct MongoDB update to remove the payment method
    await Wallet.updateOne(
      { _id: wallet._id },
      { $pull: { paymentMethods: { _id: id } } }
    );

    // If the deleted method was default and there are other methods, set the first one as default
    if (isDefault && remainingMethods.length > 0) {
      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: { 'paymentMethods.0.isDefault': true } }
      );
    }

    return successResponse(res, null, 'Payment method deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Preview conversion (for withdrawal)
const previewConversion = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, paymentMethodId, sourceCurrency } = req.body;

    // Check if conversion is enabled
    const { ENABLE_CURRENCY_CONVERSION } = require('../utils/adminConfig');
    if (!ENABLE_CURRENCY_CONVERSION) {
      return errorResponse(res, 'Currency conversion is currently disabled', 403);
    }

    // Get wallet and payment method
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return errorResponse(res, 'Wallet not found', 404);
    }

    const paymentMethod = wallet.paymentMethods.id(paymentMethodId);
    if (!paymentMethod) {
      return errorResponse(res, 'Payment method not found', 404);
    }

    const paymentMethodCurrency = (paymentMethod.currency || 'NGN').toUpperCase();
    const sourceCurrencyUpper = (sourceCurrency || paymentMethodCurrency).toUpperCase();

    // Check if conversion is needed
    const needsConversion = sourceCurrencyUpper !== paymentMethodCurrency;

    if (!needsConversion) {
      return successResponse(res, {
        needsConversion: false,
        message: 'No conversion needed - currencies match'
      }, 'Conversion preview');
    }

    // Validate amount
    const withdrawalAmount = Number(amount);
    if (!withdrawalAmount || withdrawalAmount <= 0) {
      return errorResponse(res, 'Valid amount is required', 400);
    }

    // Validate source currency balance
    const availableBalances = wallet.availableBalances || {
      NGN: Math.max(0, (wallet.balances?.NGN || 0) - (wallet.pendingWithdrawals?.NGN || 0)),
      USD: Math.max(0, (wallet.balances?.USD || 0) - (wallet.pendingWithdrawals?.USD || 0))
    };

    const availableBalance = availableBalances[sourceCurrencyUpper] || 0;

    if (availableBalance < withdrawalAmount) {
      const currencySymbol = sourceCurrencyUpper === 'USD' ? '$' : '₦';
      return errorResponse(res, `Insufficient ${sourceCurrencyUpper} balance. Available: ${currencySymbol}${availableBalance.toFixed(sourceCurrencyUpper === 'USD' ? 4 : 0)}`);
    }

    // Calculate conversion with fee
    const { calculateConversion } = require('../utils/exchangeRates');
    const conversion = calculateConversion(withdrawalAmount, sourceCurrencyUpper, paymentMethodCurrency, true);

    if (!conversion) {
      return errorResponse(res, 'Invalid currency conversion', 400);
    }

    return successResponse(res, {
      needsConversion: true,
      fromCurrency: sourceCurrencyUpper,
      toCurrency: paymentMethodCurrency,
      sourceAmount: withdrawalAmount,
      beforeFee: conversion.beforeFee, // Amount before fee
      convertedAmount: conversion.convertedAmount, // Final amount after fee
      rate: conversion.rate,
      fee: conversion.fee,
      feePercentage: conversion.feePercentage,
      finalAmount: conversion.convertedAmount,
      message: `Your ${sourceCurrencyUpper} will be converted to ${paymentMethodCurrency} with a ${conversion.feePercentage}% fee`
    }, 'Conversion preview');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Withdraw funds (with optional currency conversion)
const withdrawFunds = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, paymentMethodId, sourceCurrency } = req.body;

    // Get wallet and payment method
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return errorResponse(res, 'Wallet not found', 404);
    }

    const paymentMethod = wallet.paymentMethods.id(paymentMethodId);
    if (!paymentMethod) {
      return errorResponse(res, 'Payment method not found', 404);
    }

    const paymentMethodCurrency = (paymentMethod.currency || 'NGN').toUpperCase();
    const sourceCurrencyUpper = (sourceCurrency || paymentMethodCurrency).toUpperCase();

    // Determine if conversion is needed
    const needsConversion = sourceCurrencyUpper !== paymentMethodCurrency;
    let withdrawalAmount = Number(amount);
    let conversionDetails = null;

    // Check if conversion is enabled (if conversion is needed)
    if (needsConversion) {
      const { ENABLE_CURRENCY_CONVERSION } = require('../utils/adminConfig');
      if (!ENABLE_CURRENCY_CONVERSION) {
        return errorResponse(res, 'Currency conversion is currently disabled. Please select a payment method that matches your wallet currency.', 403);
      }
    }

    // Prevent new withdrawals if there's already a pending withdrawal
    // This prevents double spending while keeping available balance simple
    const pendingWithdrawals = wallet.pendingWithdrawals || { NGN: 0, USD: 0 };
    const hasPendingNGN = (pendingWithdrawals.NGN || 0) > 0;
    const hasPendingUSD = (pendingWithdrawals.USD || 0) > 0;

    if (hasPendingNGN || hasPendingUSD) {
      const pendingCurrency = hasPendingNGN ? 'NGN' : 'USD';
      const pendingAmount = hasPendingNGN ? pendingWithdrawals.NGN : pendingWithdrawals.USD;
      const currencySymbol = pendingCurrency === 'USD' ? '$' : '₦';
      return errorResponse(res, `You have a pending ${pendingCurrency} withdrawal of ${currencySymbol}${pendingAmount.toFixed(pendingCurrency === 'USD' ? 4 : 0)}. Please wait for it to complete before creating a new withdrawal.`, 400);
    }

    // Validate source currency balance (full balance, not reduced by pending)
    const availableBalances = wallet.availableBalances || {
      NGN: wallet.balances?.NGN || 0,
      USD: wallet.balances?.USD || 0
    };

    const availableBalance = availableBalances[sourceCurrencyUpper] || 0;

    if (availableBalance < withdrawalAmount) {
      const currencySymbol = sourceCurrencyUpper === 'USD' ? '$' : '₦';
      return errorResponse(res, `Insufficient ${sourceCurrencyUpper} balance. Available: ${currencySymbol}${availableBalance.toFixed(sourceCurrencyUpper === 'USD' ? 4 : 0)}`);
    }

    // If conversion is needed, calculate converted amount with fee
    if (needsConversion) {
      const { calculateConversion } = require('../utils/exchangeRates');
      const conversion = calculateConversion(withdrawalAmount, sourceCurrencyUpper, paymentMethodCurrency, true);

      if (!conversion) {
        return errorResponse(res, 'Invalid currency conversion', 400);
      }

      withdrawalAmount = conversion.convertedAmount;
      conversionDetails = {
        fromCurrency: sourceCurrencyUpper,
        toCurrency: paymentMethodCurrency,
        sourceAmount: amount,
        convertedAmount: conversion.convertedAmount,
        rate: conversion.rate,
        fee: conversion.fee,
        feePercentage: conversion.feePercentage
      };
    }

    // Validate withdrawal amount (after conversion if applicable)
    validateWithdrawalInput(withdrawalAmount, paymentMethodId, paymentMethodCurrency);

    // Create withdrawal transaction (with conversion if needed)
    const { createWithdrawalTransaction } = require('./transactionController');
    const result = await createWithdrawalTransaction(
      userId,
      withdrawalAmount,
      paymentMethodId,
      paymentMethodCurrency,
      sourceCurrencyUpper,
      conversionDetails
    );

    const response = formatWithdrawalResponse(result.transaction, paymentMethod);
    if (conversionDetails) {
      response.conversion = conversionDetails;
      if (result.exchangeTransaction) {
        response.exchangeTransaction = result.exchangeTransaction;
      }
    }

    return createdResponse(res, response, 'Withdrawal request submitted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Convert balance between currencies (no FX provider; rate supplied by client)
const convertBalance = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fromCurrency, toCurrency, amount, rate } = req.body;

    if (!fromCurrency || !toCurrency) {
      return errorResponse(res, 'fromCurrency and toCurrency are required', 400);
    }

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (!['NGN', 'USD'].includes(from) || !['NGN', 'USD'].includes(to)) {
      return errorResponse(res, 'Currencies must be NGN or USD', 400);
    }
    if (from === to) {
      return errorResponse(res, 'fromCurrency and toCurrency must be different', 400);
    }

    const parsedAmount = Number(amount);
    const parsedRate = rate ? Number(rate) : null;

    if (!parsedAmount || parsedAmount <= 0) {
      return errorResponse(res, 'Amount must be greater than 0', 400);
    }
    let resolvedRate = parsedRate;
    if (!resolvedRate) {
      resolvedRate = getExchangeRate(from, to);
    }
    if (!resolvedRate || resolvedRate <= 0) {
      return errorResponse(res, 'Rate must be greater than 0', 400);
    }

    // Run conversion in a transaction to ensure atomicity
    const result = await runInTransaction(async (session) => {
      // Get wallet with session
      const wallet = await Wallet.findOne({ userId }).session(session);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const balances = wallet.balances || { NGN: 0, USD: 0 };
      const availableBalances = wallet.availableBalances || {
        NGN: balances.NGN || 0,
        USD: balances.USD || 0
      };

      // Use a small epsilon for floating-point comparison (0.0001 for USD, 0.01 for NGN)
      const epsilon = from === 'USD' ? 0.0001 : 0.01;
      const available = availableBalances[from] || 0;

      if (available < parsedAmount - epsilon) {
        throw new Error(`Insufficient ${from} balance. Available: ${available.toFixed(from === 'USD' ? 4 : 0)}`);
      }

      // Calculate converted amount
      // For USD, round to 4 decimal places to maintain precision for reverse conversions
      // For NGN, round to whole numbers (no decimals)
      let convertedAmount = parsedAmount * resolvedRate;
      if (to === 'USD') {
        convertedAmount = Math.round(convertedAmount * 10000) / 10000; // 4 decimal places
      } else {
        convertedAmount = Math.round(convertedAmount); // Whole number for NGN
      }

      // Update wallet balances
      wallet.balances[from] = Math.max(0, (wallet.balances[from] || 0) - parsedAmount);
      wallet.balances[to] = (wallet.balances[to] || 0) + convertedAmount;

      // Legacy wallet.balance field removed - only using Wallet.balances now

      // Save wallet with session
      await wallet.save({ session });

      // Create transaction record with session
      const transaction = await Transaction.create([{
        userId,
        type: 'exchange',
        amount: parsedAmount,
        currency: from,
        status: 'completed',
        description: `Converted ${from} to ${to}`,
        metadata: {
          fromCurrency: from,
          toCurrency: to,
          rate: resolvedRate,
          convertedAmount
        },
        paymentMethod: 'wallet',
        processedAt: new Date()
      }], { session });

      return { wallet, transaction: transaction[0] };
    });

    // Reload wallet to get fresh data (outside transaction)
    const updatedWallet = await Wallet.findOne({ userId });
    const paymentMethod = formatPaymentMethod(updatedWallet.getDefaultPaymentMethod());
    const walletData = formatWalletData(updatedWallet, paymentMethod);

    return successResponse(res, {
      wallet: walletData,
      conversion: { from, to, amount: parsedAmount, rate: resolvedRate, convertedAmount: parsedAmount * resolvedRate }
    }, 'Balance converted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Validate withdrawal input
const validateWithdrawalInput = (amount, paymentMethodId, currency = 'NGN') => {
  if (!amount || amount <= 0) throw new Error('Valid withdrawal amount is required');
  if (!paymentMethodId) throw new Error('Payment method is required');
  const minWithdrawal = currency === 'USD' ? 10 : 1000; // $10 for USD, ₦1000 for NGN
  const currencySymbol = currency === 'USD' ? '$' : '₦';
  //if (amount < minWithdrawal) throw new Error(`Minimum withdrawal amount is ${currencySymbol}${minWithdrawal.toLocaleString()}`);
};

// Format withdrawal response
const formatWithdrawalResponse = (transaction, paymentMethod) => {
  return {
    transaction: { id: transaction._id, amount: transaction.amount, status: transaction.status, description: transaction.description },
    paymentMethod: { id: paymentMethod._id, bankName: paymentMethod.bankName, accountNumber: `**** **** **** ${paymentMethod.accountNumber.slice(-4)}` }
  };
};

module.exports = {
  getWallet,
  convertBalance,
  addPaymentMethod,
  getPaymentMethods,
  updatePaymentMethod,
  deletePaymentMethod,
  withdrawFunds,
  previewConversion
};
