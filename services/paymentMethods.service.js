/**
 * Payment Methods Service
 * 
 * Handles all payment method management operations for brands:
 * - Fetching saved payment methods
 * - Adding new payment methods (Stripe, Paystack, PayPal)
 * - Updating payment methods (set default, nickname)
 * - Deleting payment methods
 * 
 * IMPORTANT CURRENCY RULES:
 * - NGN currency → Paystack payment methods only
 * - USD currency → Stripe + PayPal payment methods only
 * - PayPal payment methods MUST use USD currency
 */

import { apiRequest } from './api';

// ============================================
// FETCH PAYMENT METHODS
// ============================================

/**
 * Fetch all saved payment methods for the authenticated brand
 * 
 * @param {string|null} currency - Optional: Filter by currency ("NGN" or "USD")
 *                                 - NGN → Returns Paystack payment methods
 *                                 - USD → Returns Stripe + PayPal payment methods
 *                                 - null → Returns all payment methods
 * @returns {Promise<Object>} Response with payment methods array
 * 
 * @example
 * // Get all payment methods
 * const allMethods = await fetchPaymentMethods();
 * 
 * // Get only NGN payment methods (Paystack)
 * const ngnMethods = await fetchPaymentMethods('NGN');
 * 
 * // Get only USD payment methods (Stripe + PayPal)
 * const usdMethods = await fetchPaymentMethods('USD');
 */
export const fetchPaymentMethods = async (currency = null) => {
  const url = currency 
    ? `/brands/payment-methods?currency=${currency}`
    : `/brands/payment-methods`;
  
  return apiRequest(url, {
    method: 'GET',
  });
};

// ============================================
// ADD PAYMENT METHODS
// ============================================

/**
 * Add a Stripe card payment method
 * 
 * Flow:
 * 1. User enters card details in mobile app
 * 2. Stripe SDK tokenizes card → returns pm_xxx (PaymentMethod ID)
 * 3. Call this function with the tokenized PaymentMethod ID
 * 4. Backend verifies and saves the card
 * 
 * @param {Object} params - Stripe card parameters
 * @param {string} params.paymentMethodId - Stripe PaymentMethod ID (pm_xxx) from Stripe SDK
 * @param {string} params.gatewayCustomerId - Stripe Customer ID (cus_xxx) - optional, backend can create
 * @param {boolean} params.isDefault - Set as default payment method (default: false)
 * @param {string} params.nickname - Optional nickname for the card
 * @returns {Promise<Object>} Created payment method
 * 
 * @example
 * // After Stripe SDK tokenization
 * const stripePaymentMethod = await stripe.createPaymentMethod({...});
 * const savedCard = await addStripeCard({
 *   paymentMethodId: stripePaymentMethod.id, // pm_xxx
 *   isDefault: true
 * });
 */
export const addStripeCard = async ({
  paymentMethodId, // pm_xxx from Stripe SDK
  gatewayCustomerId = null,
  isDefault = false,
  nickname = null,
  billingDetails = null, // Optional billing details from Stripe payment method
}) => {
  // First, tokenize the Stripe card to get card details
  const tokenizeResponse = await apiRequest('/payments/tokenize-stripe', {
    method: 'POST',
    body: { paymentMethodId },
  });

  // Extract card details from tokenization response
  const cardData = tokenizeResponse.data?.card || {};
  const gatewayToken = tokenizeResponse.data?.gatewayToken || paymentMethodId;
  const customerId = tokenizeResponse.data?.gatewayCustomerId || gatewayCustomerId;

  // Build payment method payload
  const payload = {
    type: 'card',
    currency: 'USD', // Stripe only supports USD
    cardDetails: {
      last4: cardData.last4,
      brand: cardData.brand,
      expiryMonth: cardData.exp_month,
      expiryYear: cardData.exp_year,
      cardholderName: cardData.name || 'Cardholder',
      billingAddress: billingDetails || {
        street: '',
        city: '',
        state: '',
        country: 'US',
        zipCode: '',
      },
      gatewayToken: gatewayToken,
      gatewayProvider: 'stripe',
      ...(customerId && { gatewayCustomerId: customerId }),
    },
    isDefault,
    ...(nickname && { nickname }),
  };

  return apiRequest('/brands/payment-methods', {
    method: 'POST',
    body: payload,
  });
};

/**
 * Add a Paystack card payment method
 * 
 * Flow:
 * 1. User completes Paystack checkout (using Paystack SDK or web checkout)
 * 2. Paystack returns AUTH_xxx (authorization code)
 * 3. Call this function with the authorization code
 * 4. Backend saves the card for future use
 * 
 * @param {Object} params - Paystack card parameters
 * @param {string} params.authorizationCode - Paystack authorization code (AUTH_xxx) from Paystack checkout
 * @param {boolean} params.isDefault - Set as default payment method (default: false)
 * @param {string} params.nickname - Optional nickname for the card
 * @returns {Promise<Object>} Created payment method
 * 
 * @example
 * // After Paystack checkout returns authorization
 * const authCode = paystackResponse.authorization.authorization_code; // AUTH_xxx
 * const savedCard = await addPaystackCard({
 *   authorizationCode: authCode,
 *   isDefault: true
 * });
 */
export const addPaystackCard = async ({
  authorizationCode, // AUTH_xxx from Paystack checkout
  isDefault = false,
  nickname = null,
}) => {
  // Build payment method payload
  // Note: Card details will be fetched by backend from Paystack using authorization code
  const payload = {
    type: 'card',
    currency: 'NGN', // Paystack only supports NGN
    cardDetails: {
      gatewayToken: authorizationCode, // AUTH_xxx
      gatewayProvider: 'paystack',
    },
    isDefault,
    ...(nickname && { nickname }),
  };

  return apiRequest('/brands/payment-methods', {
    method: 'POST',
    body: payload,
  });
};

/**
 * Add a PayPal payment method
 * 
 * Flow:
 * 1. User provides PayPal email address
 * 2. Call this function with the email
 * 3. Backend saves the PayPal account (no verification needed upfront)
 * 4. Payment verification happens during actual payment flow
 * 
 * IMPORTANT:
 * - PayPal payment methods MUST use USD currency
 * - PayPal is only available for USD payments
 * - No card details needed - only email address
 * 
 * @param {Object} params - PayPal account parameters
 * @param {string} params.email - PayPal account email address
 * @param {boolean} params.isDefault - Set as default payment method (default: false)
 * @param {string} params.nickname - Optional nickname for the PayPal account
 * @returns {Promise<Object>} Created payment method
 * 
 * @example
 * const paypalMethod = await addPayPalAccount({
 *   email: 'user@example.com',
 *   isDefault: false,
 *   nickname: 'My PayPal'
 * });
 */
export const addPayPalAccount = async ({
  email,
  isDefault = false,
  nickname = null,
}) => {
  // Build payment method payload
  const payload = {
    type: 'paypal',
    currency: 'USD', // PayPal ONLY supports USD - this is mandatory
    paypalAccount: {
      email: email.trim().toLowerCase(),
    },
    isDefault,
    ...(nickname && { nickname }),
  };

  return apiRequest('/brands/payment-methods', {
    method: 'POST',
    body: payload,
  });
};

// ============================================
// UPDATE PAYMENT METHOD
// ============================================

/**
 * Update payment method (set as default, update nickname)
 * 
 * @param {string} paymentMethodId - Payment method ID
 * @param {Object} updateData - Update data
 * @param {boolean} updateData.isDefault - Set as default payment method
 * @param {string} updateData.nickname - Update nickname
 * @returns {Promise<Object>} Updated payment method
 * 
 * @example
 * await updatePaymentMethod('payment_method_id', {
 *   isDefault: true,
 *   nickname: 'My Business Card'
 * });
 */
export const updatePaymentMethod = async (paymentMethodId, updateData) => {
  return apiRequest(`/brands/payment-methods/${paymentMethodId}`, {
    method: 'PUT',
    body: updateData,
  });
};

// ============================================
// DELETE PAYMENT METHOD
// ============================================

/**
 * Delete a payment method
 * 
 * @param {string} paymentMethodId - Payment method ID
 * @returns {Promise<Object>} Success response
 * 
 * @example
 * await deletePaymentMethod('payment_method_id');
 */
export const deletePaymentMethod = async (paymentMethodId) => {
  return apiRequest(`/brands/payment-methods/${paymentMethodId}`, {
    method: 'DELETE',
  });
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Filter payment methods by currency
 * 
 * This is a client-side helper to filter payment methods after fetching.
 * You can also use the currency query parameter in fetchPaymentMethods().
 * 
 * @param {Array} paymentMethods - Array of payment methods
 * @param {string} currency - Currency to filter by ("NGN" or "USD")
 * @returns {Array} Filtered payment methods
 * 
 * @example
 * const allMethods = await fetchPaymentMethods();
 * const ngnMethods = filterPaymentMethodsByCurrency(allMethods.data.paymentMethods, 'NGN');
 */
export const filterPaymentMethodsByCurrency = (paymentMethods, currency) => {
  if (!Array.isArray(paymentMethods)) return [];
  
  return paymentMethods.filter(method => {
    if (currency === 'NGN') {
      // NGN → Only Paystack
      return method.currency === 'NGN' && 
             method.cardDetails?.gatewayProvider === 'paystack';
    } else if (currency === 'USD') {
      // USD → Stripe or PayPal
      return method.currency === 'USD' && (
        method.cardDetails?.gatewayProvider === 'stripe' ||
        method.type === 'paypal'
      );
    }
    return false;
  });
};

/**
 * Get default payment method
 * 
 * @param {Array} paymentMethods - Array of payment methods
 * @returns {Object|null} Default payment method or null
 * 
 * @example
 * const methods = await fetchPaymentMethods();
 * const defaultMethod = getDefaultPaymentMethod(methods.data.paymentMethods);
 */
export const getDefaultPaymentMethod = (paymentMethods) => {
  if (!Array.isArray(paymentMethods)) return null;
  return paymentMethods.find(method => method.isDefault) || null;
};





