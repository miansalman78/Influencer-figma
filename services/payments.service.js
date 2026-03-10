/**
 * Payments Service
 * 
 * Handles all payment processing operations:
 * - Two-step payment flow (saved payment methods)
 * - Direct pay (one-time payments without saving)
 * - PayPal payment capture
 * - Payment confirmation
 * 
 * IMPORTANT FLOW RULES:
 * 
 * TWO-STEP FLOW (Saved Payment Methods):
 * 1. Create payment intent → get intentId, clientSecret (cards) or approvalUrl (PayPal)
 * 2. For Cards (Stripe/Paystack):
 *    - If requiresAction = true → Handle 3DS authentication
 *    - Call confirmCardPayment() with intentId
 * 3. For PayPal:
 *    - Redirect user to approvalUrl
 *    - After user approval, call capturePayPalPayment() with orderId + paypalOrderId
 *    - NEVER call confirmCardPayment() for PayPal
 * 
 * DIRECT PAY (No saved payment method):
 * - Single call to directPay() with payment token from gateway SDK
 * - Payment processes immediately
 * - No payment method is saved
 * 
 * CURRENCY RULES:
 * - NGN → Paystack only
 * - USD → Stripe or PayPal
 * - PayPal → MUST use USD currency
 */

import { apiRequest } from './api';

// ============================================
// TWO-STEP PAYMENT FLOW
// ============================================

/**
 * Create payment intent (Two-step flow - Step 1)
 * 
 * This creates an order and payment intent but doesn't charge yet.
 * Use this flow when you have a saved payment method.
 * 
 * FLOW:
 * 1. Call this function → Get intentId, clientSecret (cards) or approvalUrl (PayPal)
 * 2. For Cards: Handle 3DS if needed, then call confirmCardPayment()
 * 3. For PayPal: Redirect to approvalUrl, then call capturePayPalPayment()
 * 
 * @param {Object} params - Payment intent parameters
 * @param {string} params.offerId - Offer ID (for offer purchase) - required if not proposalId
 * @param {string} params.proposalId - Proposal ID (for proposal acceptance) - required if not offerId
 * @param {string} params.paymentMethodId - Saved payment method ID
 * @param {number} params.quantity - Quantity (for offers only, default: 1)
 * @param {string} params.currency - Currency ("NGN" or "USD", optional)
 *                                  - Defaults to payment method currency or NGN
 *                                  - For PayPal, MUST be "USD"
 * @returns {Promise<Object>} Payment intent response
 * 
 * Response structure:
 * - For Cards: { intentId, clientSecret, orderId, order, requiresAction, paymentMethodType, gatewayProvider }
 * - For PayPal: { intentId (PayPal order ID), approvalUrl, orderId, order, paymentMethodType: "paypal", requiresPayment: true }
 * 
 * @example
 * // For offer purchase
 * const intent = await createPaymentIntent({
 *   offerId: 'offer123',
 *   paymentMethodId: 'pm_123',
 *   quantity: 1,
 *   currency: 'USD'
 * });
 * 
 * // For proposal acceptance
 * const intent = await createPaymentIntent({
 *   proposalId: 'proposal456',
 *   paymentMethodId: 'paypal_123',
 *   currency: 'USD' // Required for PayPal
 * });
 */
export const createPaymentIntent = async ({
  offerId,
  proposalId,
  paymentMethodId,
  quantity = 1,
  currency = null,
  deepLink = null,
}) => {
  // Validate that either offerId or proposalId is provided
  if (!offerId && !proposalId) {
    throw new Error('Either offerId or proposalId must be provided');
  }

  // Build request body
  const body = {
    paymentMethodId,
    ...(offerId && { offerId }),
    ...(proposalId && { proposalId }),
    ...(offerId && { quantity }),
    ...(currency && { currency }),
    ...(deepLink && { deepLink }),
  };

  return apiRequest('/payments/create-intent', {
    method: 'POST',
    body,
  });
};

/**
 * Confirm card payment (Two-step flow - Step 2, for cards only)
 * 
 * IMPORTANT: 
 * - Use this ONLY for card payments (Stripe, Paystack)
 * - NEVER use this for PayPal payments
 * - For PayPal, use capturePayPalPayment() instead
 * 
 * FLOW:
 * 1. Call createPaymentIntent() first
 * 2. If requiresAction = true → Handle 3DS authentication on frontend
 * 3. After 3DS completion (or if not required), call this function
 * 4. Payment is charged and order is completed
 * 
 * @param {string} intentId - Payment intent ID from createPaymentIntent()
 * @returns {Promise<Object>} Payment confirmation response
 * 
 * Response structure:
 * - Success: { order, transaction, payment }
 * - 3DS Required: { requiresAction: true, clientSecret, intentId }
 * 
 * @example
 * // After creating intent
 * const intent = await createPaymentIntent({...});
 * 
 * // If 3DS is required
 * if (intent.data.requiresAction) {
 *   // Handle 3DS authentication using intent.data.clientSecret
 *   // After 3DS completion, call confirmCardPayment again
 * }
 * 
 * // Confirm payment
 * const result = await confirmCardPayment(intent.data.intentId);
 */
export const confirmCardPayment = async (intentId, paystackReference = null) => {
  const body = { intentId };
  if (paystackReference) body.paystackReference = paystackReference;
  return apiRequest('/payments/confirm', {
    method: 'POST',
    body,
  });
};

/**
 * Capture PayPal payment (Two-step flow - Step 2, for PayPal only)
 * 
 * IMPORTANT:
 * - Use this ONLY for PayPal payments
 * - NEVER use confirmCardPayment() for PayPal
 * - Currency MUST be USD for PayPal payments
 * 
 * FLOW:
 * 1. Call createPaymentIntent() with PayPal payment method → Get approvalUrl
 * 2. Redirect user to approvalUrl (open in WebView or browser)
 * 3. User approves payment on PayPal
 * 4. PayPal redirects back with orderId and token (paypalOrderId)
 * 5. Call this function with orderId and paypalOrderId
 * 6. Payment is captured and order is completed
 * 
 * @param {string} orderId - Order ID from createPaymentIntent() response
 * @param {string} paypalOrderId - PayPal order ID (token from redirect URL)
 *                                 This is the intentId from createPaymentIntent() response
 * @returns {Promise<Object>} Payment capture response
 * 
 * Response structure:
 * - Success: { order, transaction, payment }
 * 
 * @example
 * // Step 1: Create intent
 * const intent = await createPaymentIntent({
 *   offerId: 'offer123',
 *   paymentMethodId: 'paypal_123',
 *   currency: 'USD' // Required for PayPal
 * });
 * 
 * // Step 2: Redirect to approvalUrl
 * // Open intent.data.approvalUrl in WebView
 * 
 * // Step 3: After user approval, PayPal redirects with orderId and token
 * // Extract from redirect URL: ?orderId=xxx&token=yyy
 * 
 * // Step 4: Capture payment
 * const result = await capturePayPalPayment(
 *   intent.data.orderId,        // From step 1 or redirect URL
 *   intent.data.intentId         // PayPal order ID, also in redirect URL as 'token'
 * );
 */
export const capturePayPalPayment = async (orderId, paypalOrderId) => {
  return apiRequest('/payments/paypal/capture', {
    method: 'POST',
    body: { orderId, paypalOrderId },
  });
};

// ============================================
// DIRECT PAY (ONE-TIME PAYMENT)
// ============================================

/**
 * Direct pay - Process payment immediately without saving payment method
 * 
 * Use this flow when:
 * - User doesn't want to save payment method
 * - One-time payment only
 * - Payment token comes directly from gateway SDK
 * 
 * FLOW:
 * 1. User enters card details in mobile app
 * 2. Gateway SDK tokenizes card → returns payment token
 * 3. Call this function with the token
 * 4. Payment processes immediately
 * 5. Order and transaction are created automatically
 * 
 * IMPORTANT:
 * - Payment token must come from gateway SDK (Stripe, Paystack)
 * - No payment method is saved
 * - Payment processes in single step (no two-step flow)
 * 
 * @param {Object} params - Direct pay parameters
 * @param {string} params.offerId - Offer ID (for offer purchase) - required if not proposalId
 * @param {string} params.proposalId - Proposal ID (for proposal acceptance) - required if not offerId
 * @param {string} params.paymentToken - Payment token from gateway SDK
 *                                      - Stripe: pm_xxx (PaymentMethod ID)
 *                                      - Paystack: AUTH_xxx (authorization code)
 * @param {string} params.gatewayProvider - Gateway provider ("stripe" or "paystack")
 * @param {string} params.currency - Currency ("NGN" or "USD", optional, defaults to NGN)
 * @param {number} params.quantity - Quantity (for offers only, optional, default: 1)
 * @returns {Promise<Object>} Payment response
 * 
 * Response structure:
 * - Success: { order, transaction, payment }
 * 
 * @example
 * // After Stripe SDK tokenization
 * const stripePaymentMethod = await stripe.createPaymentMethod({...});
 * 
 * const result = await directPay({
 *   offerId: 'offer123',
 *   paymentToken: stripePaymentMethod.id, // pm_xxx
 *   gatewayProvider: 'stripe',
 *   currency: 'USD',
 *   quantity: 1
 * });
 * 
 * @example
 * // After Paystack checkout
 * const authCode = paystackResponse.authorization.authorization_code; // AUTH_xxx
 * 
 * const result = await directPay({
 *   proposalId: 'proposal456',
 *   paymentToken: authCode,
 *   gatewayProvider: 'paystack',
 *   currency: 'NGN'
 * });
 */
export const directPay = async ({
  offerId,
  proposalId,
  paymentToken,
  gatewayProvider, // "stripe" or "paystack"
  currency = null,
  quantity = 1,
}) => {
  // Validate that either offerId or proposalId is provided
  if (!offerId && !proposalId) {
    throw new Error('Either offerId or proposalId must be provided');
  }

  // Validate gateway provider (Stripe USD; Paystack/Flutterwave NGN)
  if (!['stripe', 'paystack', 'flutterwave'].includes(gatewayProvider)) {
    throw new Error('gatewayProvider must be "stripe", "paystack", or "flutterwave"');
  }

  // Build request body
  const body = {
    paymentToken,
    gatewayProvider,
    ...(offerId && { offerId }),
    ...(proposalId && { proposalId }),
    ...(offerId && { quantity }),
    ...(currency && { currency }),
  };

  return apiRequest('/payments/direct-pay', {
    method: 'POST',
    body,
  });
};

// ============================================
// CONVENIENCE ENDPOINTS
// ============================================

/**
 * Purchase offer (convenience endpoint)
 * 
 * This is a convenience wrapper that internally calls createPaymentIntent().
 * Use this for simpler offer purchase flow.
 * 
 * @param {string} offerId - Offer ID
 * @param {string} paymentMethodId - Saved payment method ID
 * @param {number} quantity - Quantity (default: 1)
 * @param {string} currency - Currency ("NGN" or "USD", optional)
 * @returns {Promise<Object>} Payment intent response (same as createPaymentIntent)
 * 
 * @example
 * const intent = await purchaseOffer('offer123', 'pm_123', 1, 'USD');
 * // Then follow two-step flow: confirmCardPayment() or capturePayPalPayment()
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
 * 
 * This is a convenience wrapper that internally calls createPaymentIntent().
 * Use this for simpler proposal acceptance flow.
 * 
 * IMPORTANT:
 * - For PayPal, currency MUST be "USD"
 * - Proposals typically use NGN, but PayPal requires USD
 * 
 * @param {string} proposalId - Proposal ID
 * @param {string} paymentMethodId - Saved payment method ID
 * @param {string} currency - Currency ("NGN" or "USD", optional)
 *                           - For PayPal, MUST be "USD"
 * @returns {Promise<Object>} Payment intent response (same as createPaymentIntent)
 * 
 * @example
 * const intent = await acceptProposalWithPayment('proposal456', 'paypal_123', 'USD');
 * // Then follow PayPal flow: redirect to approvalUrl, then capturePayPalPayment()
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
// PAYMENT TRACKING
// ============================================

/**
 * Get payment details by payment ID
 * 
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} Payment details
 * 
 * @example
 * const payment = await getPaymentDetails('payment123');
 */
export const getPaymentDetails = async (paymentId) => {
  return apiRequest(`/payments/${paymentId}`, {
    method: 'GET',
  });
};

/**
 * Get brand payment history
 * 
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (optional)
 * @param {number} params.limit - Items per page (optional)
 * @param {string} params.status - Payment status filter (optional)
 * @returns {Promise<Object>} Payment history list
 * 
 * @example
 * const payments = await getBrandPayments({ page: 1, limit: 20, status: 'completed' });
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

// ============================================
// CHECKOUT FLOW HELPERS
// ============================================

/**
 * Complete checkout flow for offer purchase
 * 
 * This is a high-level helper that handles the complete checkout flow:
 * 1. Create payment intent
 * 2. Handle 3DS if needed (for cards)
 * 3. Confirm payment (for cards) or capture PayPal payment
 * 
 * @param {Object} params - Checkout parameters
 * @param {string} params.offerId - Offer ID
 * @param {string} params.paymentMethodId - Saved payment method ID
 * @param {number} params.quantity - Quantity (default: 1)
 * @param {string} params.currency - Currency ("NGN" or "USD")
 * @param {Function} params.handle3DS - Optional: Function to handle 3DS authentication
 *                                      Receives clientSecret and returns Promise
 * @param {Function} params.handlePayPalRedirect - Optional: Function to handle PayPal redirect
 *                                                 Receives approvalUrl and returns Promise<{orderId, paypalOrderId}>
 * @returns {Promise<Object>} Final payment result
 * 
 * @example
 * const result = await completeOfferCheckout({
 *   offerId: 'offer123',
 *   paymentMethodId: 'pm_123',
 *   quantity: 1,
 *   currency: 'USD',
 *   handle3DS: async (clientSecret) => {
 *     // Handle Stripe 3DS authentication
 *     return await stripe.handleNextAction(clientSecret);
 *   },
 *   handlePayPalRedirect: async (approvalUrl) => {
 *     // Open approvalUrl in WebView
 *     // Wait for redirect with orderId and token
 *     return { orderId: 'xxx', paypalOrderId: 'yyy' };
 *   }
 * });
 */
export const completeOfferCheckout = async ({
  offerId,
  paymentMethodId,
  quantity = 1,
  currency = null,
  handle3DS = null,
  handlePayPalRedirect = null,
}) => {
  // Step 1: Create payment intent
  const intent = await createPaymentIntent({
    offerId,
    paymentMethodId,
    quantity,
    currency,
  });

  const intentData = intent.data;

  // Step 2: Handle PayPal flow
  if (intentData.paymentMethodType === 'paypal') {
    if (!handlePayPalRedirect) {
      throw new Error('handlePayPalRedirect is required for PayPal payments');
    }

    // Redirect to PayPal
    const { orderId, paypalOrderId } = await handlePayPalRedirect(intentData.approvalUrl);

    // Capture PayPal payment
    return await capturePayPalPayment(orderId, paypalOrderId);
  }

  // Step 3: Handle card payment flow
  // Check if 3DS is required
  if (intentData.requiresAction && handle3DS) {
    // Handle 3DS authentication
    await handle3DS(intentData.clientSecret);
  }

  // Step 4: Confirm card payment
  return await confirmCardPayment(intentData.intentId);
};

/**
 * Complete checkout flow for proposal acceptance
 * 
 * Similar to completeOfferCheckout but for proposals.
 * 
 * @param {Object} params - Checkout parameters
 * @param {string} params.proposalId - Proposal ID
 * @param {string} params.paymentMethodId - Saved payment method ID
 * @param {string} params.currency - Currency ("NGN" or "USD")
 * @param {Function} params.handle3DS - Optional: Function to handle 3DS authentication
 * @param {Function} params.handlePayPalRedirect - Optional: Function to handle PayPal redirect
 * @returns {Promise<Object>} Final payment result
 * 
 * @example
 * const result = await completeProposalCheckout({
 *   proposalId: 'proposal456',
 *   paymentMethodId: 'paypal_123',
 *   currency: 'USD', // Required for PayPal
 *   handlePayPalRedirect: async (approvalUrl) => {
 *     // Handle PayPal redirect
 *     return { orderId: 'xxx', paypalOrderId: 'yyy' };
 *   }
 * });
 */
export const completeProposalCheckout = async ({
  proposalId,
  paymentMethodId,
  currency = null,
  handle3DS = null,
  handlePayPalRedirect = null,
}) => {
  // Step 1: Create payment intent
  const intent = await createPaymentIntent({
    proposalId,
    paymentMethodId,
    currency,
  });

  const intentData = intent.data;

  // Step 2: Handle PayPal flow
  if (intentData.paymentMethodType === 'paypal') {
    if (!handlePayPalRedirect) {
      throw new Error('handlePayPalRedirect is required for PayPal payments');
    }

    // Redirect to PayPal
    const { orderId, paypalOrderId } = await handlePayPalRedirect(intentData.approvalUrl);

    // Capture PayPal payment
    return await capturePayPalPayment(orderId, paypalOrderId);
  }

  // Step 3: Handle card payment flow
  // Check if 3DS is required
  if (intentData.requiresAction && handle3DS) {
    // Handle 3DS authentication
    await handle3DS(intentData.clientSecret);
  }

  // Step 4: Confirm card payment
  return await confirmCardPayment(intentData.intentId);
};









