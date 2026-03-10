// Payment Intent Creation Helpers
// These functions create payment intents without charging (for two-step payment flow)

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

// Create Stripe PaymentIntent (doesn't charge yet)
const createStripePaymentIntent = async (amount, currency, paymentMethodId, customerId, description) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const amountInSmallestUnit = Math.round(amount * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInSmallestUnit,
    currency: currency.toLowerCase(),
    payment_method: paymentMethodId,
    customer: customerId,
    description: description,
    confirm: false, // Don't confirm yet - wait for user confirmation
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never'
    }
  });

  const mappedStatus = mapStripeStatus(paymentIntent.status);

  return {
    intentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    status: mappedStatus
  };
};

// Create Paystack charge object (doesn't charge yet)
const createPaystackChargeIntent = async (amount, currency, authorizationCode, email) => {
  // Paystack doesn't have a separate "intent" - we'll create a reference
  // and charge it later in confirm step
  const reference = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    intentId: reference,
    paymentReference: reference,
    authorizationCode: authorizationCode,
    amount: amount, // Store base amount (will convert to kobo during confirmation)
    currency: currency,
    email: email,
    status: 'pending'
  };
};

// Create Flutterwave charge intent (doesn't charge yet)
const createFlutterwaveChargeIntent = async (amount, currency, cardToken, email) => {
  // Flutterwave doesn't have a separate "intent" - we'll create a reference
  // and charge it later in confirm step
  const txRef = `flw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    intentId: txRef,
    paymentReference: txRef,
    cardToken: cardToken,
    amount: amount,
    currency: currency,
    email: email,
    status: 'pending'
  };
};

// Create payment intent based on gateway
const createPaymentIntent = async (paymentMethod, amount, currency, description, email, userId, userName, customerId = null) => {
  if (paymentMethod.type !== 'card') {
    throw new Error('Payment intent creation only supported for card payments');
  }

  const { gatewayProvider, gatewayToken, gatewayCustomerId } = paymentMethod.cardDetails;
  const finalCustomerId = customerId || gatewayCustomerId;

  switch (gatewayProvider) {
    case 'stripe':
      if (!gatewayToken.startsWith('pm_')) {
        throw new Error('Invalid Stripe PaymentMethod ID');
      }
      // Get or create customer
      const { getOrCreateStripeCustomer } = require('./paymentGateways');
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      let stripeCustomerId = await getOrCreateStripeCustomer(
        stripe,
        email,
        userId.toString(),
        finalCustomerId,
        userName
      );

      // Attach PaymentMethod to customer if needed (wrapped in try-catch to handle account mismatches)
      let pm;
      try {
        pm = await stripe.paymentMethods.retrieve(gatewayToken);
      } catch (error) {
        if (error.type === 'StripeInvalidRequestError' && error.code === 'resource_missing') {
          throw new Error('The saved payment method is not available in this Stripe account. Please remove and re-add your card in the Payment Methods section.');
        }
        throw error;
      }
      if (pm.customer) {
        // Already attached - use that customer
        stripeCustomerId = typeof pm.customer === 'string' ? pm.customer : pm.customer.id;
      } else {
        // Attach to customer
        await stripe.paymentMethods.attach(gatewayToken, {
          customer: stripeCustomerId
        });
      }

      return await createStripePaymentIntent(amount, currency, gatewayToken, stripeCustomerId, description);

    case 'paystack':
      return await createPaystackChargeIntent(amount, currency, gatewayToken, email);

    case 'flutterwave':
      return await createFlutterwaveChargeIntent(amount, currency, gatewayToken, email);

    default:
      throw new Error('Unsupported payment gateway');
  }
};

module.exports = {
  createPaymentIntent,
  createStripePaymentIntent,
  createPaystackChargeIntent,
  createFlutterwaveChargeIntent
};

