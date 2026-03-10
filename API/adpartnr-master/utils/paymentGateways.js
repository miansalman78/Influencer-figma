// Payment Gateway Integration Utilities

// Initialize Paystack
const initializePaystack = () => {
  if (typeof window !== 'undefined' && window.PaystackPop) {
    return window.PaystackPop.setup({
      key: process.env.REACT_APP_PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY,
      // This will be set dynamically per transaction
    });
  }
  return null;
};

// Tokenize card with Paystack
const tokenizeCardWithPaystack = async (cardData) => {
  // This should be called from frontend using Paystack's inline.js
  // Backend will receive the token from frontend
  return {
    provider: 'paystack',
    method: 'tokenize'
  };
};

// Tokenize card with Flutterwave
const tokenizeCardWithFlutterwave = async (cardData) => {
  // This should be called from frontend using Flutterwave's inline.js
  // Backend will receive the token from frontend
  return {
    provider: 'flutterwave',
    method: 'tokenize'
  };
};

// Tokenize card with Stripe
const tokenizeCardWithStripe = async (cardData) => {
  // This should be called from frontend using Stripe.js
  // Backend will receive the token from frontend
  return {
    provider: 'stripe',
    method: 'tokenize'
  };
};

// Charge card using stored token (Paystack)
const chargeCardPaystack = async (amount, currency, token, email) => {
  const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);

  try {
    let response;

    // Distinguish between authorization_code (recurring/stored card) and reference (one-time verification)
    // Paystack authorization codes ALWAYS start with 'AUTH_'
    if (token && token.startsWith('AUTH_')) {
      // It's an authorization code for recurring/stored card charge
      response = await paystack.transaction.charge({
        amount: Math.round(amount * 100), // Convert to kobo
        currency: currency,
        email: email,
        authorization_code: token
      });
    } else {
      // It's a transaction reference from a one-time payment (Direct Pay)
      // We verify that it was successful and matched the expected amount
      response = await paystack.transaction.verify(token);

      // For verification, we manually check success and amount
      if (response.status && response.data?.status === 'success') {
        // Validation: amount in Paystack response is in kobo
        const receivedAmount = response.data.amount / 100;
        if (Math.abs(receivedAmount - amount) > 0.01) {
          throw new Error(`Amount mismatch: expected ${amount}, got ${receivedAmount}`);
        }
      } else {
        return {
          success: false,
          message: response.data?.gateway_response || 'Payment verification failed'
        };
      }
    }

    return {
      success: response.status,
      data: response.data,
      message: response.message
    };
  } catch (error) {
    throw new Error(error.message || 'Payment failed');
  }
};

// Charge card using stored token (Flutterwave)
const chargeCardFlutterwave = async (amount, currency, token, email) => {
  const Flutterwave = require('flutterwave-node-v3');
  const flw = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
  );

  try {
    const response = await flw.Charge.card({
      card_number: token, // In Flutterwave, this is the token
      cvv: '', // Not needed for stored cards
      expiry_month: '',
      expiry_year: '',
      currency: currency,
      amount: amount,
      email: email,
      tx_ref: `tx_${Date.now()}`
    });

    return {
      success: response.status === 'success',
      data: response.data,
      message: response.message
    };
  } catch (error) {
    throw new Error(error.message || 'Payment failed');
  }
};

// Get or create Stripe customer for a user
const getOrCreateStripeCustomer = async (stripe, email, userId, existingCustomerId = null, userName = null) => {
  // If customer ID is provided and exists, use it
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (customer && !customer.deleted) {
        return customer.id;
      }
    } catch (error) {
      // Customer doesn't exist, create new one
    }
  }

  // Create new customer
  // TODO: Store customer ID in User model or BrandPaymentMethod for reuse
  const customerData = {
    email: email,
    metadata: {
      userId: userId ? userId.toString() : 'unknown'
    }
  };

  // Add name if provided
  if (userName) {
    customerData.name = userName;
  }

  const customer = await stripe.customers.create(customerData);
  return customer.id;
};

// Charge card using stored token (Stripe)
const chargeCardStripe = async (amount, currency, token, description, email, userId, gatewayCustomerId = null, userName = null) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  try {
    // For NGN, Stripe requires amount in kobo (smallest currency unit)
    const amountInSmallestUnit = Math.round(amount * 100);

    // Get or create Stripe customer (use existing customer ID if provided)
    let customerId = await getOrCreateStripeCustomer(stripe, email, userId, gatewayCustomerId, userName);

    // Stripe tokens (tok_xxx) can only be used once
    // We should be using PaymentMethod IDs (pm_xxx) which can be reused
    let paymentMethodId = token;

    if (token.startsWith('tok_')) {
      // Token provided - convert to PaymentMethod and attach to customer
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: { token: token }
      });

      // Attach to customer so it can be reused
      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customerId
      });

      paymentMethodId = paymentMethod.id;
    } else if (token.startsWith('pm_')) {
      // PaymentMethod ID - check if already attached to a customer
      let pm;
      try {
        pm = await stripe.paymentMethods.retrieve(token);
      } catch (error) {
        // PaymentMethod might be consumed/invalid
        throw new Error('This payment method cannot be used. Please add a new card.');
      }

      if (pm.customer) {
        // Already attached to a customer - use that customer instead
        // This prevents "attached to different customer" errors
        const attachedCustomerId = typeof pm.customer === 'string' ? pm.customer : pm.customer.id;
        customerId = attachedCustomerId; // Update to use the existing customer
      } else {
        // Not attached - attach to customer BEFORE using it
        // This is critical: PaymentMethods must be attached before use, or they become "consumed"
        try {
          await stripe.paymentMethods.attach(token, {
            customer: customerId
          });
        } catch (attachError) {
          // If attach fails, the PaymentMethod might be consumed
          if (attachError.message && attachError.message.includes('previously used')) {
            throw new Error('This payment method was previously used and cannot be reused. Please add a new card.');
          }
          throw attachError;
        }
      }
    }

    // Create PaymentIntent with PaymentMethod ID (reusable when attached to customer)
    const paymentIntentData = {
      amount: amountInSmallestUnit,
      currency: currency.toLowerCase(),
      payment_method: paymentMethodId,
      customer: customerId,
      confirm: true,
      description: description,
      // Disable redirect-based payment methods since we're using direct card payments
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    };

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    return {
      success: paymentIntent.status === 'succeeded',
      data: paymentIntent,
      message: 'Payment successful'
    };
  } catch (error) {
    throw new Error(error.message || 'Payment failed');
  }
};

// Charge card using stored payment method
const chargeStoredCard = async (paymentMethod, amount, currency, description, email, userId, userName = null) => {
  if (paymentMethod.type !== 'card') {
    throw new Error('Payment method is not a card');
  }

  const { gatewayProvider, gatewayToken, gatewayCustomerId } = paymentMethod.cardDetails;

  switch (gatewayProvider) {
    case 'paystack':
      return await chargeCardPaystack(amount, currency, gatewayToken, email);
    case 'flutterwave':
      return await chargeCardFlutterwave(amount, currency, gatewayToken, email);
    case 'stripe':
      return await chargeCardStripe(amount, currency, gatewayToken, description, email, userId, gatewayCustomerId, userName);
    default:
      throw new Error('Unsupported payment gateway');
  }
};

module.exports = {
  tokenizeCardWithPaystack,
  tokenizeCardWithFlutterwave,
  tokenizeCardWithStripe,
  chargeStoredCard,
  chargeCardPaystack,
  chargeCardFlutterwave,
  chargeCardStripe,
  getOrCreateStripeCustomer,
};

