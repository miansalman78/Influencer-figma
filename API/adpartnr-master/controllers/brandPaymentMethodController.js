const BrandPaymentMethod = require('../models/BrandPaymentMethod');
const User = require('../models/User');
const { successResponse, errorResponse, createdResponse, notFoundResponse } = require('../utils/response');
const { sanitizeString } = require('../utils/helpers');
const { getOrCreateStripeCustomer } = require('../utils/paymentGateways');

// Get all payment methods for a brand
const getPaymentMethods = async (req, res) => {
  try {
    const brandId = req.user._id;
    const { currency } = req.query;
    const query = { brandId, isActive: true };
    if (currency) query.currency = currency;
    const paymentMethods = await BrandPaymentMethod.find(query).sort({ isDefault: -1, createdAt: -1 });
    return successResponse(res, { paymentMethods }, 'Payment methods retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Create new payment method
const createPaymentMethod = async (req, res) => {
  try {
    const brandId = req.user._id;
    const paymentMethodData = sanitizePaymentMethodData(req.body, brandId);

    // For Stripe cards, ensure PaymentMethod is attached to a customer immediately
    // This prevents "previously used without being attached" errors
    if (paymentMethodData.type === 'card' &&
      paymentMethodData.cardDetails?.gatewayProvider === 'stripe' &&
      paymentMethodData.cardDetails?.gatewayToken?.startsWith('pm_')) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      // Get or create customer
      const customerId = await getOrCreateStripeCustomer(
        stripe,
        req.user.email,
        brandId.toString(),
        paymentMethodData.cardDetails.gatewayCustomerId,
        req.user.name
      );

      // Attach PaymentMethod to customer
      try {
        const pm = await stripe.paymentMethods.retrieve(paymentMethodData.cardDetails.gatewayToken);
        if (!pm.customer) {
          await stripe.paymentMethods.attach(paymentMethodData.cardDetails.gatewayToken, {
            customer: customerId
          });
        }
        // Store customer ID for future use
        paymentMethodData.cardDetails.gatewayCustomerId = customerId;
      } catch (attachError) {
        if (attachError.message && attachError.message.includes('previously used')) {
          return errorResponse(res, 'This payment method cannot be used. Please add a new card.', 400);
        }
        throw attachError;
      }
    }

    const paymentMethod = await BrandPaymentMethod.create(paymentMethodData);
    await setDefaultIfNeeded(paymentMethod);
    return createdResponse(res, paymentMethod, 'Payment method added successfully');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

// Update payment method
const updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = req.user._id;
    const paymentMethod = await findPaymentMethodById(id, brandId);
    if (!paymentMethod) {
      return notFoundResponse(res, 'Payment method not found');
    }
    const updateData = sanitizeUpdateData(req.body);
    Object.assign(paymentMethod, updateData);
    await paymentMethod.save();
    if (updateData.isDefault) {
      await unsetOtherDefaults(brandId, paymentMethod.currency, id);
    }
    return successResponse(res, paymentMethod, 'Payment method updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

// Delete payment method
const deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = req.user._id;
    const paymentMethod = await findPaymentMethodById(id, brandId);
    if (!paymentMethod) {
      return notFoundResponse(res, 'Payment method not found');
    }
    paymentMethod.isActive = false;
    await paymentMethod.save();
    return successResponse(res, null, 'Payment method deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const findPaymentMethodById = async (id, brandId) => {
  return await BrandPaymentMethod.findOne({ _id: id, brandId, isActive: true });
};

const sanitizePaymentMethodData = (data, brandId) => {
  const sanitized = {
    brandId,
    type: data.type,
    currency: data.currency || 'NGN',
    isDefault: data.isDefault || false,
    nickname: data.nickname ? sanitizeString(data.nickname) : null,
    notes: data.notes ? sanitizeString(data.notes) : null
  };

  if (data.type === 'bank_account') {
    sanitized.bankAccount = {
      bankName: sanitizeString(data.bankAccount.bankName),
      accountNumber: data.bankAccount.accountNumber.trim(),
      accountName: sanitizeString(data.bankAccount.accountName),
      bankCode: data.bankAccount.bankCode?.trim(),
      routingNumber: data.bankAccount.routingNumber?.trim(),
      swiftCode: data.bankAccount.swiftCode?.trim(),
      accountType: data.bankAccount.accountType || 'checking'
    };
  }

  if (data.type === 'card') {
    sanitized.cardDetails = {
      last4: (data.cardDetails?.last4 || '****').trim(),
      brand: data.cardDetails?.brand || 'other',
      expiryMonth: parseInt(data.cardDetails?.expiryMonth || 1),
      expiryYear: parseInt(data.cardDetails?.expiryYear || new Date().getFullYear()),
      cardholderName: sanitizeString(data.cardDetails?.cardholderName || 'Cardholder'),
      billingAddress: {
        street: sanitizeString(data.cardDetails?.billingAddress?.street || ''),
        city: sanitizeString(data.cardDetails?.billingAddress?.city || ''),
        state: sanitizeString(data.cardDetails?.billingAddress?.state || ''),
        country: sanitizeString(data.cardDetails?.billingAddress?.country || 'NG'),
        zipCode: (data.cardDetails?.billingAddress?.zipCode || '').trim()
      },
      gatewayToken: (data.cardDetails?.gatewayToken || '').trim(),
      gatewayProvider: data.cardDetails.gatewayProvider,
      gatewayCustomerId: data.cardDetails.gatewayCustomerId?.trim(),
      requiresCvv: data.cardDetails.requiresCvv || false
    };
  }

  if (data.type === 'paypal') {
    sanitized.paypalAccount = {
      email: data.paypalAccount.email.toLowerCase().trim()
    };
  }

  return sanitized;
};

const sanitizeUpdateData = (data) => {
  const sanitized = {};
  if (data.isDefault !== undefined) sanitized.isDefault = data.isDefault;
  if (data.nickname !== undefined) sanitized.nickname = data.nickname ? sanitizeString(data.nickname) : null;
  if (data.notes !== undefined) sanitized.notes = data.notes ? sanitizeString(data.notes) : null;
  if (data.isActive !== undefined) sanitized.isActive = data.isActive;
  return sanitized;
};

const setDefaultIfNeeded = async (paymentMethod) => {
  if (paymentMethod.isDefault) {
    await unsetOtherDefaults(paymentMethod.brandId, paymentMethod.currency, paymentMethod._id);
  }
};

const unsetOtherDefaults = async (brandId, currency, excludeId) => {
  await BrandPaymentMethod.updateMany(
    { brandId, currency, isDefault: true, _id: { $ne: excludeId } },
    { $set: { isDefault: false } }
  );
};

module.exports = {
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod
};

