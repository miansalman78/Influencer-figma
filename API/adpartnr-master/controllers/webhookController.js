const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const PaymentIntent = require('../models/PaymentIntent');
const { successResponse, errorResponse } = require('../utils/response');
// Helper function for proposal acceptance
const handleProposalAcceptance = async (proposalId, brandId) => {
  const Proposal = require('../models/Proposal');
  const Campaign = require('../models/Campaign');
  
  const proposal = await Proposal.findById(proposalId).populate('campaignId');
  if (!proposal || proposal.status !== 'pending') {
    return;
  }
  
  proposal.status = 'accepted';
  proposal.reviewedAt = new Date();
  proposal.reviewedBy = brandId;
  await proposal.save();
  
  const campaign = proposal.campaignId;
  const creatorId = proposal.creatorId?._id || proposal.creatorId;
  if (campaign && typeof campaign.hireCreator === 'function') {
    await campaign.hireCreator(creatorId);
  }
  
  if (campaign && (campaign.status === 'open' || campaign.status === 'accepting_bids')) {
    campaign.status = 'in_progress';
    await campaign.save();
  }
};

// Stripe webhook handler
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handleStripePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handleStripePaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await handleStripeRefund(event.data.object);
        break;
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
    
    return res.json({ received: true });
  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Paystack webhook handler
const handlePaystackWebhook = async (req, res) => {
  const hash = req.headers['x-paystack-signature'];
  const crypto = require('crypto');
  const secret = process.env.PAYSTACK_SECRET_KEY;
  
  const hashCheck = crypto.createHmac('sha512', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (hash !== hashCheck) {
    console.error('Paystack webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }
  
  try {
    const event = req.body;
    
    switch (event.event) {
      case 'charge.success':
        await handlePaystackPaymentSuccess(event.data);
        break;
      case 'charge.failed':
        await handlePaystackPaymentFailed(event.data);
        break;
      case 'refund.processed':
        await handlePaystackRefund(event.data);
        break;
      default:
        console.log(`Unhandled Paystack event type: ${event.event}`);
    }
    
    return res.json({ received: true });
  } catch (error) {
    console.error('Error processing Paystack webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Flutterwave webhook handler
const handleFlutterwaveWebhook = async (req, res) => {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  const signature = req.headers['verif-hash'];
  
  if (signature !== secretHash) {
    console.error('Flutterwave webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }
  
  try {
    const event = req.body;
    
    switch (event.event) {
      case 'charge.completed':
        await handleFlutterwavePaymentSuccess(event.data);
        break;
      case 'charge.failed':
        await handleFlutterwavePaymentFailed(event.data);
        break;
      case 'refund.completed':
        await handleFlutterwaveRefund(event.data);
        break;
      default:
        console.log(`Unhandled Flutterwave event type: ${event.event}`);
    }
    
    return res.json({ received: true });
  } catch (error) {
    console.error('Error processing Flutterwave webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// PayPal webhook handler
const handlePayPalWebhook = async (req, res) => {
  // PayPal webhook verification is more complex - simplified for now
  try {
    const event = req.body;
    const eventType = event.event_type;
    
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePayPalPaymentSuccess(event.resource);
        break;
      case 'PAYMENT.CAPTURE.DENIED':
        await handlePayPalPaymentFailed(event.resource);
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
        await handlePayPalRefund(event.resource);
        break;
      default:
        console.log(`Unhandled PayPal event type: ${eventType}`);
    }
    
    return res.json({ received: true });
  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Stripe payment success handler
const handleStripePaymentSuccess = async (paymentIntent) => {
  const intentId = paymentIntent.id;
  const paymentIntentDoc = await PaymentIntent.findOne({ intentId });
  
  if (!paymentIntentDoc) {
    console.log(`PaymentIntent not found for Stripe payment: ${intentId}`);
    return;
  }
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) {
    console.log(`Order not found: ${paymentIntentDoc.orderId}`);
    return;
  }
  
  if (order.payment.status === 'completed') {
    console.log(`Order ${order._id} already marked as completed`);
    return;
  }
  
  let transaction = await Transaction.findOne({
    'metadata.orderId': order._id,
    'metadata.gatewayReference': intentId,
    status: 'completed'
  });
  
  if (!transaction) {
    transaction = await Transaction.create({
      userId: order.brandId,
      type: 'payment',
      amount: paymentIntent.amount / 100, // Convert from cents
      currency: paymentIntent.currency.toUpperCase(),
      status: 'completed',
      description: `Payment for order ${order._id}`,
      paymentMethod: 'stripe',
      metadata: {
        orderId: order._id,
        gatewayReference: intentId,
        gatewayProvider: 'stripe'
      },
      processedAt: new Date()
    });
  }
  
  order.payment.status = 'completed';
  order.payment.paidAt = new Date();
  order.payment.transactionId = transaction._id;
  await order.save();
  
  await paymentIntentDoc.markConfirmed(intentId);
  
  if (order.proposalId && order.proposalId.toString() !== '000000000000000000000000') {
    await handleProposalAcceptance(order.proposalId.toString(), order.brandId);
  }
};

// Stripe payment failed handler
const handleStripePaymentFailed = async (paymentIntent) => {
  const intentId = paymentIntent.id;
  const paymentIntentDoc = await PaymentIntent.findOne({ intentId });
  
  if (!paymentIntentDoc) return;
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  if (order.payment.status === 'failed') return;
  
  order.payment.status = 'failed';
  await order.save();
  
  await paymentIntentDoc.markFailed();
};

// Stripe refund handler
const handleStripeRefund = async (charge) => {
  const paymentIntentId = charge.payment_intent;
  const paymentIntentDoc = await PaymentIntent.findOne({ intentId: paymentIntentId });
  
  if (!paymentIntentDoc) return;
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  await Transaction.create({
    userId: order.brandId,
    type: 'refund',
    amount: charge.amount_refunded / 100,
    currency: charge.currency.toUpperCase(),
    status: 'completed',
    description: `Refund for order ${order._id}`,
    paymentMethod: 'stripe',
    metadata: {
      orderId: order._id,
      gatewayReference: charge.id,
      gatewayProvider: 'stripe',
      originalTransactionId: charge.id
    },
    processedAt: new Date()
  });
};

// Paystack payment success handler
const handlePaystackPaymentSuccess = async (data) => {
  const reference = data.reference;
  const paymentIntentDoc = await PaymentIntent.findOne({ 
    $or: [
      { intentId: reference },
      { paymentReference: reference }
    ]
  });
  
  if (!paymentIntentDoc) {
    console.log(`PaymentIntent not found for Paystack payment: ${reference}`);
    return;
  }
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  if (order.payment.status === 'completed') return;
  
  let transaction = await Transaction.findOne({
    'metadata.orderId': order._id,
    'metadata.gatewayReference': reference,
    status: 'completed'
  });
  
  if (!transaction) {
    transaction = await Transaction.create({
      userId: order.brandId,
      type: 'payment',
      amount: data.amount / 100, // Convert from kobo
      currency: data.currency.toUpperCase(),
      status: 'completed',
      description: `Payment for order ${order._id}`,
      paymentMethod: 'paystack',
      metadata: {
        orderId: order._id,
        gatewayReference: reference,
        gatewayProvider: 'paystack'
      },
      processedAt: new Date()
    });
  }
  
  order.payment.status = 'completed';
  order.payment.paidAt = new Date();
  order.payment.transactionId = transaction._id;
  await order.save();
  
  await paymentIntentDoc.markConfirmed(reference);
  
  if (order.proposalId && order.proposalId.toString() !== '000000000000000000000000') {
    await handleProposalAcceptance(order.proposalId.toString(), order.brandId);
  }
};

// Paystack payment failed handler
const handlePaystackPaymentFailed = async (data) => {
  const reference = data.reference;
  const paymentIntentDoc = await PaymentIntent.findOne({ 
    $or: [
      { intentId: reference },
      { paymentReference: reference }
    ]
  });
  
  if (!paymentIntentDoc) return;
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  if (order.payment.status === 'failed') return;
  
  order.payment.status = 'failed';
  await order.save();
  
  await paymentIntentDoc.markFailed();
};

// Paystack refund handler
const handlePaystackRefund = async (data) => {
  const transactionRef = data.transaction.reference;
  const transaction = await Transaction.findOne({
    'metadata.gatewayReference': transactionRef
  });
  
  if (!transaction) return;
  
  const order = await Order.findById(transaction.metadata.orderId);
  if (!order) return;
  
  await Transaction.create({
    userId: order.brandId,
    type: 'refund',
    amount: data.amount / 100,
    currency: data.currency.toUpperCase(),
    status: 'completed',
    description: `Refund for order ${order._id}`,
    paymentMethod: 'paystack',
    metadata: {
      orderId: order._id,
      gatewayReference: data.transaction.reference,
      gatewayProvider: 'paystack',
      originalTransactionId: transaction._id
    },
    processedAt: new Date()
  });
};

// Flutterwave payment success handler
const handleFlutterwavePaymentSuccess = async (data) => {
  const txRef = data.tx_ref;
  const paymentIntentDoc = await PaymentIntent.findOne({ 
    $or: [
      { intentId: txRef },
      { paymentReference: txRef }
    ]
  });
  
  if (!paymentIntentDoc) {
    console.log(`PaymentIntent not found for Flutterwave payment: ${txRef}`);
    return;
  }
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  if (order.payment.status === 'completed') return;
  
  let transaction = await Transaction.findOne({
    'metadata.orderId': order._id,
    'metadata.gatewayReference': txRef,
    status: 'completed'
  });
  
  if (!transaction) {
    transaction = await Transaction.create({
      userId: order.brandId,
      type: 'payment',
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      status: 'completed',
      description: `Payment for order ${order._id}`,
      paymentMethod: 'flutterwave',
      metadata: {
        orderId: order._id,
        gatewayReference: txRef,
        gatewayProvider: 'flutterwave'
      },
      processedAt: new Date()
    });
  }
  
  order.payment.status = 'completed';
  order.payment.paidAt = new Date();
  order.payment.transactionId = transaction._id;
  await order.save();
  
  await paymentIntentDoc.markConfirmed(txRef);
  
  if (order.proposalId && order.proposalId.toString() !== '000000000000000000000000') {
    await handleProposalAcceptance(order.proposalId.toString(), order.brandId);
  }
};

// Flutterwave payment failed handler
const handleFlutterwavePaymentFailed = async (data) => {
  const txRef = data.tx_ref;
  const paymentIntentDoc = await PaymentIntent.findOne({ 
    $or: [
      { intentId: txRef },
      { paymentReference: txRef }
    ]
  });
  
  if (!paymentIntentDoc) return;
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  if (order.payment.status === 'failed') return;
  
  order.payment.status = 'failed';
  await order.save();
  
  await paymentIntentDoc.markFailed();
};

// Flutterwave refund handler
const handleFlutterwaveRefund = async (data) => {
  const transactionRef = data.tx_ref;
  const transaction = await Transaction.findOne({
    'metadata.gatewayReference': transactionRef
  });
  
  if (!transaction) return;
  
  const order = await Order.findById(transaction.metadata.orderId);
  if (!order) return;
  
  await Transaction.create({
    userId: order.brandId,
    type: 'refund',
    amount: data.amount,
    currency: data.currency.toUpperCase(),
    status: 'completed',
    description: `Refund for order ${order._id}`,
    paymentMethod: 'flutterwave',
    metadata: {
      orderId: order._id,
      gatewayReference: transactionRef,
      gatewayProvider: 'flutterwave',
      originalTransactionId: transaction._id
    },
    processedAt: new Date()
  });
};

// PayPal payment success handler
const handlePayPalPaymentSuccess = async (resource) => {
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const paymentIntentDoc = await PaymentIntent.findOne({ 
    $or: [
      { paypalOrderId: orderId },
      { intentId: orderId }
    ]
  });
  
  if (!paymentIntentDoc) {
    console.log(`PaymentIntent not found for PayPal payment: ${orderId}`);
    return;
  }
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  if (order.payment.status === 'completed') return;
  
  let transaction = await Transaction.findOne({
    'metadata.orderId': order._id,
    'metadata.gatewayReference': orderId,
    status: 'completed'
  });
  
  if (!transaction) {
    transaction = await Transaction.create({
      userId: order.brandId,
      type: 'payment',
      amount: parseFloat(resource.amount.value),
      currency: resource.amount.currency_code,
      status: 'completed',
      description: `Payment for order ${order._id}`,
      paymentMethod: 'paypal',
      metadata: {
        orderId: order._id,
        gatewayReference: orderId,
        gatewayProvider: 'paypal'
      },
      processedAt: new Date()
    });
  }
  
  order.payment.status = 'completed';
  order.payment.paidAt = new Date();
  order.payment.transactionId = transaction._id;
  await order.save();
  
  await paymentIntentDoc.markConfirmed(orderId);
  
  if (order.proposalId && order.proposalId.toString() !== '000000000000000000000000') {
    await handleProposalAcceptance(order.proposalId.toString(), order.brandId);
  }
};

// PayPal payment failed handler
const handlePayPalPaymentFailed = async (resource) => {
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const paymentIntentDoc = await PaymentIntent.findOne({ 
    $or: [
      { paypalOrderId: orderId },
      { intentId: orderId }
    ]
  });
  
  if (!paymentIntentDoc) return;
  
  const order = await Order.findById(paymentIntentDoc.orderId);
  if (!order) return;
  
  if (order.payment.status === 'failed') return;
  
  order.payment.status = 'failed';
  await order.save();
  
  await paymentIntentDoc.markFailed();
};

// PayPal refund handler
const handlePayPalRefund = async (resource) => {
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const transaction = await Transaction.findOne({
    'metadata.gatewayReference': orderId
  });
  
  if (!transaction) return;
  
  const order = await Order.findById(transaction.metadata.orderId);
  if (!order) return;
  
  await Transaction.create({
    userId: order.brandId,
    type: 'refund',
    amount: parseFloat(resource.amount.value),
    currency: resource.amount.currency_code,
    status: 'completed',
    description: `Refund for order ${order._id}`,
    paymentMethod: 'paypal',
    metadata: {
      orderId: order._id,
      gatewayReference: orderId,
      gatewayProvider: 'paypal',
      originalTransactionId: transaction._id
    },
    processedAt: new Date()
  });
};

module.exports = {
  handleStripeWebhook,
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
  handlePayPalWebhook
};

