// Payment Confirmation Helpers
// These functions confirm and charge payment intents

// Map Stripe PaymentIntent status to our model's status enum
const mapStripeStatus = (stripeStatus) => {
  const statusMap = {
    'requires_payment_method': 'pending',
    'requires_confirmation': 'pending',
    'requires_action': 'requires_action',
    'processing': 'pending',
    'requires_capture': 'pending',
    'canceled': 'cancelled',
    'succeeded': 'succeeded'
  };
  return statusMap[stripeStatus] || 'pending';
};

// Confirm Stripe PaymentIntent
const confirmStripePaymentIntent = async (intentId) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  // Retrieve the payment intent first to check its current status
  let paymentIntent = await stripe.paymentIntents.retrieve(intentId);

  // If already succeeded, return success
  if (paymentIntent.status === 'succeeded') {
    return {
      success: true,
      status: 'succeeded',
      data: paymentIntent,
      gatewayReference: paymentIntent.id
    };
  }

  // If requires action, don't confirm yet - let frontend handle 3DS
  if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
    return {
      success: false,
      status: 'requires_action',
      data: paymentIntent,
      gatewayReference: paymentIntent.id
    };
  }

  // Otherwise, confirm the payment intent
  paymentIntent = await stripe.paymentIntents.confirm(intentId);
  const mappedStatus = mapStripeStatus(paymentIntent.status);

  return {
    success: paymentIntent.status === 'succeeded',
    status: mappedStatus,
    data: paymentIntent,
    gatewayReference: paymentIntent.id
  };
};

// Confirm Paystack charge
// When card requires 3DS/OTP, Paystack returns data.paused=true and data.authorization_url
const confirmPaystackCharge = async (intentData) => {
  const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);

  // Convert amount to kobo (smallest currency unit)
  const amountInKobo = Math.round(intentData.amount * 100);

  const response = await paystack.transaction.charge({
    amount: amountInKobo,
    currency: intentData.currency,
    email: intentData.email,
    authorization_code: intentData.authorizationCode
  });

  const data = response.data || {};

  // Card requires 3DS/OTP - redirect user to authorization_url
  if (data.paused && data.authorization_url) {
    return {
      success: false,
      status: 'requires_action',
      authorizationUrl: data.authorization_url,
      paystackReference: data.reference,
      data: data
    };
  }

  return {
    success: response.status,
    status: response.status ? 'succeeded' : 'failed',
    data: response.data,
    gatewayReference: data.reference
  };
};

// Confirm Flutterwave charge
const confirmFlutterwaveCharge = async (intentData) => {
  const Flutterwave = require('flutterwave-node-v3');
  const flw = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
  );

  const response = await flw.Charge.card({
    card_number: intentData.cardToken,
    cvv: '',
    expiry_month: '',
    expiry_year: '',
    currency: intentData.currency,
    amount: intentData.amount,
    email: intentData.email,
    tx_ref: intentData.paymentReference
  });

  return {
    success: response.status === 'success',
    status: response.status === 'success' ? 'succeeded' : 'failed',
    data: response.data,
    gatewayReference: response.data.id || intentData.paymentReference
  };
};

// Confirm payment intent based on gateway
const confirmPaymentIntent = async (intentId, intentData, gatewayProvider) => {
  switch (gatewayProvider) {
    case 'stripe':
      return await confirmStripePaymentIntent(intentId);

    case 'paystack':
      return await confirmPaystackCharge(intentData);

    case 'flutterwave':
      return await confirmFlutterwaveCharge(intentData);

    default:
      throw new Error('Unsupported payment gateway');
  }
};

module.exports = {
  confirmPaymentIntent,
  confirmStripePaymentIntent,
  confirmPaystackCharge,
  confirmFlutterwaveCharge
};

