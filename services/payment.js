import { apiRequest } from './api';

/**
 * Payment Services
 * Handles all payment-related API calls including payment methods, payment processing, and gateway integrations
 */

// ============================================
// Payment Method Management (Brand)
// ============================================

/**
 * Get all payment methods for brand
 * @param {string} currency - Optional: Filter by currency ("NGN" or "USD")
 * @returns {Promise} Payment methods list
 */
export const getBrandPaymentMethods = async (currency = null) => {
  const url = currency 
    ? `/brands/payment-methods?currency=${currency}`
    : `/brands/payment-methods`;
  return apiRequest(url, {
    method: 'GET',
  });
};

/**
 * Create a new payment method (card, bank account, or PayPal)
 * @param {Object} paymentMethodData - Payment method data
 * @returns {Promise} Created payment method
 */
export const createPaymentMethod = async (paymentMethodData) => {
  return apiRequest('/brands/payment-methods', {
    method: 'POST',
    body: paymentMethodData,
  });
};

/**
 * Update payment method (e.g., set as default, update nickname)
 * @param {string} paymentMethodId - Payment method ID
 * @param {Object} updateData - Update data
 * @returns {Promise} Updated payment method
 */
export const updatePaymentMethod = async (paymentMethodId, updateData) => {
  return apiRequest(`/brands/payment-methods/${paymentMethodId}`, {
    method: 'PUT',
    body: updateData,
  });
};

/**
 * Delete payment method
 * @param {string} paymentMethodId - Payment method ID
 * @returns {Promise} Success response
 */
export const deletePaymentMethod = async (paymentMethodId) => {
  return apiRequest(`/brands/payment-methods/${paymentMethodId}`, {
    method: 'DELETE',
  });
};

// ============================================
// Payment Processing
// ============================================

/**
 * Create payment intent (Two-step flow - Step 1)
 * @param {Object} data - Payment intent data
 * @param {string} data.offerId - Offer ID (for offer purchase)
 * @param {string} data.proposalId - Proposal ID (for proposal acceptance)
 * @param {string} data.paymentMethodId - Payment method ID
 * @param {number} data.quantity - Quantity (for offers only, default: 1)
 * @param {string} data.currency - Currency ("NGN" or "USD", optional)
 * @returns {Promise} Payment intent response with intentId, clientSecret, etc.
 */
export const createPaymentIntent = async (data) => {
  return apiRequest('/payments/create-intent', {
    method: 'POST',
    body: data,
  });
};

/**
 * Confirm payment (Two-step flow - Step 2, for card payments only)
 * @param {string} intentId - Payment intent ID
 * @returns {Promise} Payment confirmation response
 */
export const confirmPayment = async (intentId) => {
  return apiRequest('/payments/confirm', {
    method: 'POST',
    body: { intentId },
  });
};

/**
 * Direct pay - Process payment immediately without saving payment method
 * @param {Object} data - Direct pay data
 * @param {string} data.offerId - Offer ID (for offer purchase)
 * @param {string} data.proposalId - Proposal ID (for proposal acceptance)
 * @param {string} data.paymentToken - Payment token from gateway SDK (pm_xxx, AUTH_xxx, flw-t1nf-xxx)
 * @param {string} data.gatewayProvider - Gateway provider ("stripe", "paystack", "flutterwave")
 * @param {string} data.currency - Currency ("NGN" or "USD", optional)
 * @param {number} data.quantity - Quantity (for offers only, optional, default: 1)
 * @returns {Promise} Payment response
 */
export const directPay = async (data) => {
  return apiRequest('/payments/direct-pay', {
    method: 'POST',
    body: data,
  });
};

// ============================================
// PayPal Integration
// ============================================

/**
 * Capture PayPal payment (after user approval)
 * @param {string} orderId - Order ID
 * @param {string} paypalOrderId - PayPal order ID (token from redirect)
 * @returns {Promise} Payment capture response
 */
export const capturePayPalPayment = async (orderId, paypalOrderId) => {
  return apiRequest('/payments/paypal/capture', {
    method: 'POST',
    body: { orderId, paypalOrderId },
  });
};

// ============================================
// Convenience Endpoints
// ============================================

/**
 * Purchase offer (convenience endpoint - internally calls create-intent)
 * @param {string} offerId - Offer ID
 * @param {string} paymentMethodId - Payment method ID
 * @param {number} quantity - Quantity (default: 1)
 * @param {string} currency - Currency ("NGN" or "USD", optional)
 * @returns {Promise} Payment intent response
 */
export const purchaseOffer = async (offerId, paymentMethodId, quantity = 1, currency = null) => {
  const body = { paymentMethodId, quantity };
  if (currency) body.currency = currency;
  
  return apiRequest(`/offers/${offerId}/purchase`, {
    method: 'POST',
    body,
  });
};

/**
 * Accept proposal with payment (convenience endpoint)
 * @param {string} proposalId - Proposal ID
 * @param {string} paymentMethodId - Payment method ID
 * @param {string} currency - Currency ("NGN" or "USD", optional)
 * @returns {Promise} Payment intent response
 */
export const acceptProposalWithPayment = async (proposalId, paymentMethodId, currency = null) => {
  const body = { paymentMethodId };
  if (currency) body.currency = currency;
  
  return apiRequest(`/proposals/${proposalId}/accept`, {
    method: 'POST',
    body,
  });
};

// ============================================
// Payment Gateway Helpers
// ============================================

/**
 * Tokenize Stripe card (verify and attach to customer)
 * @param {string} paymentMethodId - Stripe PaymentMethod ID (pm_xxx)
 * @returns {Promise} Tokenized card data
 */
export const tokenizeStripeCard = async (paymentMethodId) => {
  return apiRequest('/payments/tokenize-stripe', {
    method: 'POST',
    body: { paymentMethodId },
  });
};

/**
 * Initialize Paystack transaction - get authorization_url for WebView
 * Use this for Add Card flow (recommended by Paystack for mobile WebView - avoids blank page)
 * @param {Object} params - { email?, amount? } amount in kobo (default 10000 = 100 NGN)
 * @returns {Promise} { authorization_url, reference, access_code }
 */
export const initializePaystackTransaction = async ({ email, amount = 10000 } = {}) => {
  return apiRequest('/payments/paystack/initialize', {
    method: 'POST',
    body: { email, amount },
  });
};

/**
 * Verify Paystack transaction and get authorization code
 * @param {string} reference - Transaction reference
 * @returns {Promise} Transaction verification response with authorization
 */
export const verifyPaystackTransaction = async (reference) => {
  return apiRequest(`/payments/verify-paystack?reference=${reference}`, {
    method: 'GET',
  });
};

/**
 * Tokenize Flutterwave card from transaction
 * @param {string} transactionId - Transaction ID
 * @param {string} txRef - Transaction reference
 * @returns {Promise} Tokenized card data
 */
export const tokenizeFlutterwaveCard = async (transactionId, txRef) => {
  return apiRequest('/payments/tokenize-flutterwave', {
    method: 'POST',
    body: { transactionId, txRef },
  });
};

/**
 * Create or get Stripe customer
 * @returns {Promise} Customer ID
 */
export const createStripeCustomer = async () => {
  return apiRequest('/payments/stripe/customer', {
    method: 'POST',
  });
};

// ============================================
// Payment Tracking
// ============================================

/**
 * Get payment details by payment ID
 * @param {string} paymentId - Payment ID
 * @returns {Promise} Payment details
 */
export const getPaymentDetails = async (paymentId) => {
  return apiRequest(`/payments/${paymentId}`, {
    method: 'GET',
  });
};

/**
 * Get brand payment history
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @param {string} params.status - Payment status filter
 * @returns {Promise} Payment history list
 */
export const getBrandPayments = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);
  if (params.status) queryParams.append('status', params.status);
  
  const url = `/payments/brand/payments${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  return apiRequest(url, {
    method: 'GET',
  });
};

