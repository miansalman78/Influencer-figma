const mongoose = require('mongoose');
const BrandPaymentMethod = require('../models/BrandPaymentMethod');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const Proposal = require('../models/Proposal');
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const PaymentIntent = require('../models/PaymentIntent');
const { successResponse, errorResponse, createdResponse } = require('../utils/response');
const { createPaymentIntent } = require('../utils/paymentIntentHelpers');
const { confirmPaymentIntent } = require('../utils/paymentConfirmHelpers');
const { createPayPalOrder } = require('../utils/paypalHelpers');
const { runInTransaction } = require('../utils/transactionWrapper');
const { createNotification } = require('../utils/notificationHelpers');

// Create payment intent (unified for offers and proposals)
const createPaymentIntentEndpoint = async (req, res) => {
  try {
    const { offerId, proposalId, paymentMethodId, quantity = 1 } = req.body;
    const brandId = req.user._id;

    if (!offerId && !proposalId) {
      return errorResponse(res, 'Either offerId or proposalId is required', 400);
    }

    if (!paymentMethodId) {
      return errorResponse(res, 'Payment method ID is required', 400);
    }

    const paymentMethod = await findPaymentMethodById(paymentMethodId, brandId);
    if (!paymentMethod) {
      return errorResponse(res, 'Payment method not found', 404);
    }

    // For offers, check by finding existing order with specific offerId
    let existingOrder;
    let existingPaymentIntent;

    if (offerId) {
      existingOrder = await Order.findOne({
        offerId: offerId,
        brandId: brandId,
        'payment.status': 'pending'
      }).sort({ createdAt: -1 });

      if (existingOrder) {
        existingPaymentIntent = await PaymentIntent.findOne({
          orderId: existingOrder._id,
          status: { $in: ['pending', 'requires_action'] }
        });
      }
    } else if (proposalId) {
      // For proposals, check by proposalId
      existingOrder = await Order.findOne({
        proposalId: proposalId,
        brandId: brandId,
        'payment.status': 'pending'
      }).sort({ createdAt: -1 });

      if (existingOrder) {
        existingPaymentIntent = await PaymentIntent.findOne({
          orderId: existingOrder._id,
          status: { $in: ['pending', 'requires_action'] }
        });
      }
    }

    // Only reuse existing intent when gateway matches selected payment method (avoid "PayPal flow" error when user switches to Paystack/Stripe)
    const existingGateway = existingPaymentIntent?.gatewayProvider || existingPaymentIntent?.gateway;
    const requestedIsPayPal = paymentMethod.type === 'paypal';
    const requestedCardGateway = !requestedIsPayPal ? (paymentMethod.cardDetails?.gatewayProvider || paymentMethod.gatewayProvider || 'paystack') : null;
    if (existingPaymentIntent && (
      (requestedIsPayPal && existingGateway !== 'paypal') ||
      (!requestedIsPayPal && existingGateway === 'paypal') ||
      (!requestedIsPayPal && requestedCardGateway && existingGateway && existingGateway !== requestedCardGateway)
    )) {
      await PaymentIntent.findByIdAndDelete(existingPaymentIntent._id);
      existingPaymentIntent = null;
    }

    if (existingOrder && existingPaymentIntent) {
      // Return existing order and intent (gateway already matches)
      if (paymentMethod.type === 'paypal') {
        // Check if approval URL exists
        let approvalUrl = existingPaymentIntent.paypalApprovalUrl;

        // If approval URL is missing, try to get it from PayPal
        if (!approvalUrl) {
          // Try to use paypalOrderId first, then intentId
          const paypalOrderIdToFetch = existingPaymentIntent.paypalOrderId || existingPaymentIntent.intentId;

          if (paypalOrderIdToFetch) {
            try {
              const { getPayPalOrder } = require('../utils/paypalHelpers');
              const paypalOrder = await getPayPalOrder(paypalOrderIdToFetch);
              approvalUrl = paypalOrder.links?.find(link => link.rel === 'approve')?.href;
              if (approvalUrl) {
                existingPaymentIntent.paypalApprovalUrl = approvalUrl;
                await existingPaymentIntent.save();
              }
            } catch (error) {
              // Stale or expired PayPal order ID — create a new one below (approvalUrl stays null)
              const isNotFound = error?.message?.includes('does not exist') || error?.response?.status === 404;
              if (!isNotFound) console.error('Failed to fetch PayPal approval URL:', error);
              approvalUrl = null;
            }
          }
        }

        // If we still don't have an approval URL, we need to create a new PayPal order
        if (!approvalUrl) {
          // Delete the existing payment intent and create a new one
          await PaymentIntent.findByIdAndDelete(existingPaymentIntent._id);
          existingPaymentIntent = null;
          // Continue to create a new PayPal order below
        } else {
          // We have a valid approval URL, return the existing intent
          const orderData = existingOrder.toObject ? existingOrder.toObject() : existingOrder;

          return successResponse(res, {
            order: orderData,
            intentId: existingPaymentIntent.intentId,
            approvalUrl: approvalUrl,
            paymentMethodType: 'paypal',
            gatewayProvider: 'paypal',
            requiresPayment: true
          }, 'Payment intent already exists');
        }
      } else {
        // For card payments (Stripe/Paystack)
        // If it's Paystack/Flutterwave and it's stuck in requires_action without a URL,
        // we treat it as 'pending' so the frontend calls confirm() to get a fresh URL.
        const gatewayProvider = paymentMethod.cardDetails?.gatewayProvider || 'paystack';
        let needsAction = existingPaymentIntent.status === 'requires_action';

        if (needsAction && (gatewayProvider === 'paystack' || gatewayProvider === 'flutterwave')) {
          needsAction = false;
        }

        return successResponse(res, {
          intentId: existingPaymentIntent.intentId,
          clientSecret: existingPaymentIntent.clientSecret,
          paymentReference: existingPaymentIntent.paymentReference,
          orderId: existingOrder._id,
          order: existingOrder,
          requiresAction: needsAction,
          gatewayProvider
        }, 'Payment intent already exists');
      }
    }

    let order;
    let totalAmount;
    let currency;
    let description;

    if (offerId) {
      const offer = await findOfferById(offerId);
      if (!offer) {
        return errorResponse(res, 'Offer not found', 404);
      }

      const requestedCurrency = req.body.currency;
      const availableCurrencies = [];
      if (offer.rate?.ngn) availableCurrencies.push('NGN');
      if (offer.rate?.usd) availableCurrencies.push('USD');

      const selectedCurrency = (requestedCurrency || paymentMethod.currency || availableCurrencies[0] || 'NGN').toUpperCase();
      if (!['NGN', 'USD'].includes(selectedCurrency)) {
        return errorResponse(res, 'Invalid currency. Must be NGN or USD', 400);
      }

      if (paymentMethod.currency && paymentMethod.currency.toUpperCase() !== selectedCurrency) {
        return errorResponse(res, `Payment method currency (${paymentMethod.currency}) does not match selected currency (${selectedCurrency})`, 400);
      }

      // Get rate based on selected currency (no conversion)
      let rate = null;
      if (selectedCurrency === 'NGN' && offer.rate?.ngn) {
        rate = offer.rate.ngn;
      } else if (selectedCurrency === 'USD' && offer.rate?.usd) {
        rate = offer.rate.usd;
      }

      if (!rate) {
        return errorResponse(res, 'Offer does not have a valid rate for the selected currency', 400);
      }

      currency = selectedCurrency;
      totalAmount = rate * quantity;
      description = `Payment for offer: ${offer.title}`;
      order = await createOrderFromOffer(offer, brandId, quantity, totalAmount, currency);
    } else {
      const proposal = await findProposalById(proposalId);
      if (!proposal) {
        return errorResponse(res, 'Proposal not found', 404);
      }
      if (proposal.status !== 'pending') {
        return errorResponse(res, 'Proposal has already been reviewed', 400);
      }
      const proposalCurrency = proposal.currency || proposal.campaignId?.currency || 'NGN';
      const normalizedCurrency = proposalCurrency.toUpperCase();
      if (paymentMethod.currency && paymentMethod.currency.toUpperCase() !== normalizedCurrency) {
        return errorResponse(res, `Payment method currency (${paymentMethod.currency}) does not match campaign currency (${normalizedCurrency})`, 400);
      }
      totalAmount = proposal.compensation.amount || 0;
      currency = normalizedCurrency;
      description = `Payment for proposal acceptance`;
      order = await createOrderFromProposal(proposal, brandId, totalAmount, currency);
    }

    // Handle PayPal payments (only for USD)
    if (paymentMethod.type === 'paypal') {
      // PayPal only supports USD, so currency must be USD
      if (currency !== 'USD') {
        return errorResponse(res, 'PayPal payments only support USD currency. Please select USD or use a different payment method.', 400);
      }

      const paypalAmount = totalAmount;
      const paypalCurrency = 'USD';

      console.log('PayPal Payment:', {
        amount: paypalAmount,
        currency: paypalCurrency
      });

      // Ensure order has _id before proceeding
      if (!order || !order._id) {
        console.error('Order missing _id:', order);
        return errorResponse(res, 'Failed to create order. Please try again.', 500);
      }

      // Ensure paymentMethod has _id
      if (!paymentMethod || !paymentMethod._id) {
        console.error('Payment method missing _id:', paymentMethod);
        return errorResponse(res, 'Payment method not found or invalid', 404);
      }

      // Create PayPal order (FRONTEND_URL must be set for return/cancel URLs)
      const frontendUrl = (process.env.FRONTEND_URL || 'https://adpartnr-frontend.onrender.com').replace(/\/+$/, '');
      const returnUrl = `${frontendUrl}/payments/paypal/success?orderId=${order._id}`;
      const cancelUrl = `${frontendUrl}/checkout/${offerId || 'proposal'}`;

      let paypalOrder;
      try {
        paypalOrder = await createPayPalOrder(
          paypalAmount,
          paypalCurrency,
          description,
          returnUrl,
          cancelUrl
        );
      } catch (error) {
        console.error('PayPal order creation error:', error);
        return errorResponse(res, error.message || 'Failed to create PayPal order', 500);
      }

      // Get approval URL (should be included in response now)
      const approvalUrl = paypalOrder?.approvalUrl || paypalOrder?.links?.find(link => link.rel === 'approve')?.href;

      console.log('PayPal order response:', {
        paypalOrder,
        approvalUrl,
        orderId: paypalOrder?.orderId,
        links: paypalOrder?.links,
        hasApprovalUrl: !!approvalUrl
      });

      if (!approvalUrl) {
        console.error('PayPal order created but no approval URL:', {
          paypalOrder,
          orderId: paypalOrder?.orderId,
          links: paypalOrder?.links
        });
        return errorResponse(res, 'PayPal order created but approval URL not available. Please check PayPal configuration.', 500);
      }

      // Store PayPal order ID in payment intent (for tracking)
      // Store original amount in NGN, but note the USD conversion for PayPal
      await PaymentIntent.create({
        intentId: paypalOrder.orderId,
        orderId: order._id,
        paymentMethodId: paymentMethod._id,
        brandId: brandId,
        amount: totalAmount,
        currency: currency,
        gatewayProvider: 'paypal',
        paymentReference: paypalOrder.orderId,
        paypalOrderId: paypalOrder.orderId,
        status: 'pending',
        paypalApprovalUrl: approvalUrl,
        // Store payment details in metadata
        metadata: {
          amount: totalAmount,
          currency: currency,
          ...(proposalId ? { proposalId: proposalId } : {})
        }
      });

      // Convert Mongoose document to plain object to avoid serialization issues
      let orderData = null;
      if (order) {
        if (typeof order.toObject === 'function') {
          orderData = order.toObject();
        } else {
          orderData = { ...order };
        }
        // Ensure _id is present as string
        if (orderData && !orderData._id && order._id) {
          orderData._id = order._id.toString();
        }
      }

      const responseData = {
        order: orderData,
        orderId: orderData?._id || order?._id?.toString() || order?._id,
        intentId: paypalOrder.orderId,
        approvalUrl: approvalUrl,
        paymentMethodType: 'paypal',
        gatewayProvider: 'paypal',
        requiresPayment: true
      };

      console.log('Sending PayPal response:', {
        hasApprovalUrl: !!responseData.approvalUrl,
        approvalUrl: responseData.approvalUrl,
        intentId: responseData.intentId,
        hasOrder: !!responseData.order,
        orderId: responseData.orderId,
        orderHasId: !!responseData.order?._id
      });

      return successResponse(res, responseData, 'PayPal order created successfully');
    }

    // Handle bank account payments
    if (paymentMethod.type === 'bank_account') {
      // For bank transfers, mark as pending
      order.payment.status = 'pending';
      await order.save();
      await createPaymentTransaction(order, paymentMethod, totalAmount, 'pending');
      return successResponse(res, {
        order,
        intentId: null,
        requiresPayment: false,
        message: 'Order created. Payment pending bank transfer confirmation.'
      }, 'Order created successfully');
    }

    // Only card payments create payment intents
    if (paymentMethod.type !== 'card') {
      return errorResponse(res, 'Unsupported payment method type', 400);
    }

    // Check if payment intent already exists for this order (double-check after order creation)
    const existingIntentForOrder = await PaymentIntent.findOne({
      orderId: order._id,
      status: { $in: ['pending', 'requires_action'] }
    });

    if (existingIntentForOrder) {
      // Return existing intent instead of creating a new one
      return successResponse(res, {
        intentId: existingIntentForOrder.intentId,
        clientSecret: existingIntentForOrder.clientSecret,
        paymentReference: existingIntentForOrder.paymentReference,
        orderId: order._id,
        order: order,
        requiresAction: existingIntentForOrder.status === 'requires_action',
        gatewayProvider: paymentMethod.cardDetails.gatewayProvider
      }, 'Payment intent already exists');
    }

    // Create payment intent (doesn't charge yet)
    const intentResult = await createPaymentIntent(
      paymentMethod,
      totalAmount,
      currency,
      description,
      req.user.email,
      brandId.toString(),
      req.user.name
    );

    // Store intent data in database
    await PaymentIntent.create({
      intentId: intentResult.intentId,
      orderId: order._id,
      paymentMethodId: paymentMethod._id,
      brandId: brandId,
      amount: totalAmount,
      currency: currency,
      gatewayProvider: paymentMethod.cardDetails.gatewayProvider,
      clientSecret: intentResult.clientSecret,
      paymentReference: intentResult.paymentReference,
      authorizationCode: intentResult.authorizationCode,
      cardToken: intentResult.cardToken,
      status: intentResult.status || 'pending',
      metadata: proposalId ? { proposalId: proposalId } : undefined
    });

    return successResponse(res, {
      intentId: intentResult.intentId,
      clientSecret: intentResult.clientSecret,
      paymentReference: intentResult.paymentReference,
      orderId: order._id,
      order: order,
      requiresAction: intentResult.status === 'requires_action',
      gatewayProvider: paymentMethod.cardDetails.gatewayProvider
    }, 'Payment intent created successfully');
  } catch (error) {
    console.error('Error in createPaymentIntentEndpoint:', error);
    // Check if error is about accessing _id on undefined
    if (error.message && error.message.includes("Cannot read properties of undefined (reading '_id')")) {
      console.error('Error accessing _id on undefined object:', {
        stack: error.stack,
        message: error.message
      });
      return errorResponse(res, 'An error occurred while processing the payment. Please ensure all required data is available.', 500);
    }
    return errorResponse(res, error.message || 'Failed to create payment intent', 500);
  }
};

// Confirm payment intent
const confirmPayment = async (req, res) => {
  try {
    const { intentId, paymentReference, paystackReference } = req.body;

    if (!intentId) {
      return errorResponse(res, 'Intent ID is required', 400);
    }

    // Get payment intent from database (allow any status except cancelled/failed)
    const paymentIntentDoc = await PaymentIntent.findOne({
      intentId,
      status: { $in: ['pending', 'requires_action', 'succeeded'] }
    });
    if (!paymentIntentDoc) {
      return errorResponse(res, 'Payment intent not found or expired', 404);
    }

    if (paymentIntentDoc.isExpired) {
      await paymentIntentDoc.markFailed();
      return errorResponse(res, 'Payment intent has expired', 400);
    }

    const order = await Order.findById(paymentIntentDoc.orderId);
    if (!order) {
      return errorResponse(res, 'Order not found', 404);
    }

    const paymentMethod = await BrandPaymentMethod.findById(paymentIntentDoc.paymentMethodId);
    if (!paymentMethod) {
      return errorResponse(res, 'Payment method not found', 404);
    }

    // PayPal payments should use the capture endpoint, not this confirm endpoint
    if (paymentIntentDoc.gatewayProvider === 'paypal') {
      return errorResponse(res, 'PayPal payments should be captured using /api/payments/paypal/capture endpoint after user approval', 400);
    }

    // For Stripe, check if payment was already confirmed by frontend (after 3DS)
    if (paymentIntentDoc.gatewayProvider === 'stripe') {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const stripeIntent = await stripe.paymentIntents.retrieve(intentId);

      // If already succeeded from frontend 3DS confirmation, update our records
      if (stripeIntent.status === 'succeeded' && paymentIntentDoc.status !== 'succeeded') {
        // Check if transaction already exists for this order
        let transaction;
        if (order.payment.transactionId) {
          transaction = await Transaction.findById(order.payment.transactionId);
          if (!transaction) {
            // Transaction ID exists but transaction not found, create a new one
            transaction = await createPaymentTransaction(
              order,
              paymentMethod,
              paymentIntentDoc.amount,
              'completed',
              stripeIntent.id
            );
          }
        } else {
          // Check if a completed transaction already exists for this order
          const existingTransaction = await Transaction.findOne({
            'metadata.orderId': order._id,
            type: 'payment',
            status: 'completed'
          });

          if (existingTransaction) {
            transaction = existingTransaction;
          } else {
            // Create new transaction
            transaction = await createPaymentTransaction(
              order,
              paymentMethod,
              paymentIntentDoc.amount,
              'completed',
              stripeIntent.id
            );
          }
        }

        // Update order only if not already updated
        if (order.payment.status !== 'completed') {
          order.payment.status = 'completed';
          order.payment.paidAt = new Date();
          order.payment.transactionId = transaction._id;
          await order.save();
        } else if (!order.payment.transactionId) {
          // Status is completed but transactionId is missing, update it
          order.payment.transactionId = transaction._id;
          await order.save();
        }

        await paymentIntentDoc.markConfirmed(stripeIntent.id);
        await updatePaymentMethodLastUsed(paymentMethod);

        if (order.proposalId && order.proposalId.toString() !== '000000000000000000000000') {
          await handleProposalAcceptance(order.proposalId, order.brandId);
        }

        if (order.creatorId) {
          await createNotification({
            userId: order.creatorId,
            type: 'order_paid',
            title: 'Order paid',
            body: `Payment received for order "${order.title}". You can now submit deliverables.`,
            data: { orderId: order._id },
            actorId: order.brandId,
            dedupeData: { orderId: order._id },
          });
        }

        return successResponse(res, {
          order,
          transaction,
          payment: { status: 'succeeded', gatewayReference: stripeIntent.id }
        }, 'Payment confirmed successfully');
      }
    }

    // Paystack: User completed 3DS in WebView - verify transaction and complete
    let confirmResult;
    if (paymentIntentDoc.gatewayProvider === 'paystack' && paystackReference) {
      const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
      const verifyResponse = await paystack.transaction.verify(paystackReference);
      const vData = verifyResponse.data;
      if (!vData || vData.status !== 'success') {
        return errorResponse(res, 'Paystack verification failed or transaction not successful', 400);
      }
      confirmResult = { success: true, gatewayReference: vData.reference };
    }

    if (!confirmResult) {
      // Prepare intent data for confirmation
      // Convert amount to smallest currency unit for Paystack (kobo)
      const intentData = {
        amount: paymentIntentDoc.gatewayProvider === 'paystack'
          ? paymentIntentDoc.amount * 100 // Convert to kobo for Paystack
          : paymentIntentDoc.amount, // Base currency for Flutterwave
        currency: paymentIntentDoc.currency,
        email: req.user.email,
        authorizationCode: paymentIntentDoc.authorizationCode,
        cardToken: paymentIntentDoc.cardToken
      };

      // Confirm payment intent
      confirmResult = await confirmPaymentIntent(
        intentId,
        intentData,
        paymentIntentDoc.gatewayProvider
      );
    }

    // Check if Paystack requires 3DS/OTP redirect
    if (confirmResult.status === 'requires_action' && paymentIntentDoc.gatewayProvider === 'paystack' && confirmResult.authorizationUrl) {
      await paymentIntentDoc.markRequiresAction();
      return successResponse(res, {
        requiresAction: true,
        authorizationUrl: confirmResult.authorizationUrl,
        intentId: intentId,
        orderId: order._id,
        paystackReference: confirmResult.paystackReference
      }, 'Payment requires 3DS authentication');
    }

    // Check if payment requires 3DS action (Stripe)
    if (confirmResult.status === 'requires_action' && paymentIntentDoc.gatewayProvider === 'stripe') {
      // Update payment intent status
      await paymentIntentDoc.markRequiresAction();

      // Return clientSecret for frontend 3DS handling
      return successResponse(res, {
        requiresAction: true,
        clientSecret: confirmResult.data?.client_secret || paymentIntentDoc.clientSecret,
        intentId: intentId,
        orderId: order._id
      }, 'Payment requires 3D Secure authentication');
    }

    if (confirmResult.success) {
      // Run database updates in transaction to ensure atomicity
      const result = await runInTransaction(async (session) => {
        // Reload order with session
        const orderWithSession = await Order.findById(order._id).session(session);
        if (!orderWithSession) {
          throw new Error('Order not found');
        }

        // Check if transaction already exists for this order
        let transaction;
        if (orderWithSession.payment.transactionId) {
          // Transaction already exists, fetch it
          transaction = await Transaction.findById(orderWithSession.payment.transactionId).session(session);
          if (!transaction) {
            // Transaction ID exists but transaction not found, create a new one
            const transactions = await Transaction.create([{
              userId: orderWithSession.brandId,
              type: 'payment',
              amount: paymentIntentDoc.amount,
              currency: paymentIntentDoc.currency || 'NGN',
              status: 'completed',
              description: `Payment for order ${orderWithSession._id}`,
              paymentMethod: paymentMethod.type === 'paypal' ? 'paypal' :
                (paymentMethod.cardDetails?.gatewayProvider?.toLowerCase() || 'paystack'),
              metadata: {
                orderId: orderWithSession._id,
                paymentMethodId: paymentMethod._id,
                paymentMethodType: paymentMethod.type,
                gatewayReference: confirmResult.gatewayReference,
                gatewayProvider: paymentIntentDoc.gatewayProvider
              },
              processedAt: new Date()
            }], { session });
            transaction = transactions[0];
          }
        } else {
          // Check if a completed transaction already exists for this order
          const existingTransaction = await Transaction.findOne({
            'metadata.orderId': orderWithSession._id,
            type: 'payment',
            status: 'completed'
          }).session(session);

          if (existingTransaction) {
            transaction = existingTransaction;
          } else {
            // Create new transaction
            const transactions = await Transaction.create([{
              userId: orderWithSession.brandId,
              type: 'payment',
              amount: paymentIntentDoc.amount,
              currency: paymentIntentDoc.currency || 'NGN',
              status: 'completed',
              description: `Payment for order ${orderWithSession._id}`,
              paymentMethod: paymentMethod.type === 'paypal' ? 'paypal' :
                (paymentMethod.cardDetails?.gatewayProvider?.toLowerCase() || 'paystack'),
              metadata: {
                orderId: orderWithSession._id,
                paymentMethodId: paymentMethod._id,
                paymentMethodType: paymentMethod.type,
                gatewayReference: confirmResult.gatewayReference,
                gatewayProvider: paymentIntentDoc.gatewayProvider
              },
              processedAt: new Date()
            }], { session });
            transaction = transactions[0];
          }
        }

        // Update order with session
        if (orderWithSession.payment.status !== 'completed') {
          orderWithSession.payment.status = 'completed';
          orderWithSession.payment.paidAt = new Date();
          orderWithSession.payment.transactionId = transaction._id;
          // Keep newly paid orders in 'pending' until creator starts work
          orderWithSession.status = 'pending';
          await orderWithSession.save({ session });
        } else if (!orderWithSession.payment.transactionId) {
          // Status is completed but transactionId is missing, update it
          orderWithSession.payment.transactionId = transaction._id;
          await orderWithSession.save({ session });
        }

        // Update payment intent with session
        const paymentIntentWithSession = await PaymentIntent.findById(paymentIntentDoc._id).session(session);
        if (paymentIntentWithSession) {
          paymentIntentWithSession.status = 'succeeded';
          paymentIntentWithSession.gatewayReference = confirmResult.gatewayReference;
          paymentIntentWithSession.confirmedAt = new Date();
          await paymentIntentWithSession.save({ session });
        }

        // Update payment method last used (outside transaction - less critical)
        await updatePaymentMethodLastUsed(paymentMethod);

        return { order: orderWithSession, transaction };
      });

      // Update order object for response
      order.payment.status = 'completed';
      order.payment.paidAt = new Date();
      order.payment.transactionId = result.transaction._id;
      order.status = 'in_progress';

      // Handle proposal acceptance if applicable
      if (order.proposalId && order.proposalId.toString() !== '000000000000000000000000') {
        await handleProposalAcceptance(order.proposalId, order.brandId);
      }

      if (order.creatorId) {
        await createNotification({
          userId: order.creatorId,
          type: 'order_paid',
          title: 'Order paid',
          body: `Payment received for order "${order.title}". You can now submit deliverables.`,
          data: { orderId: order._id },
          actorId: order.brandId,
          dedupeData: { orderId: order._id },
        });
      }

      return successResponse(res, {
        order,
        transaction: result.transaction,
        payment: confirmResult
      }, 'Payment confirmed successfully');
    } else {
      // Payment failed
      await createPaymentTransaction(
        order,
        paymentMethod,
        paymentIntentDoc.amount,
        'failed',
        confirmResult.gatewayReference
      );

      await paymentIntentDoc.markFailed();

      return errorResponse(res, confirmResult.data?.message || 'Payment failed', 400);
    }
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to confirm payment', 500);
  }
};

// Purchase offer (convenience endpoint)
const purchaseOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { paymentMethodId, quantity = 1 } = req.body;

    // Call create intent with offerId
    req.body.offerId = offerId;
    req.body.paymentMethodId = paymentMethodId;
    req.body.quantity = quantity;

    return await createPaymentIntentEndpoint(req, res);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Accept proposal with payment (convenience endpoint)
const acceptProposalWithPayment = async (req, res) => {
  try {
    const proposalId = req.params.id; // Route parameter is 'id', not 'proposalId'
    const { paymentMethodId } = req.body;
    const brandId = req.user._id;

    const proposal = await findProposalById(proposalId);
    if (!proposal) {
      return errorResponse(res, 'Proposal not found', 404);
    }

    const campaign = await Campaign.findById(proposal.campaignId);
    if (!campaign) {
      return errorResponse(res, 'Campaign not found', 404);
    }

    const campaignBrandId = (campaign.brandId && campaign.brandId._id)
      ? campaign.brandId._id.toString()
      : campaign.brandId.toString();

    if (campaignBrandId !== brandId.toString()) {
      return errorResponse(res, 'Not authorized to accept this proposal', 403);
    }

    if (proposal.status !== 'pending') {
      return errorResponse(res, 'Proposal has already been reviewed', 400);
    }

    // Call create intent with proposalId
    req.body.proposalId = proposalId;
    req.body.paymentMethodId = paymentMethodId;

    return await createPaymentIntentEndpoint(req, res);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const findOfferById = async (offerId) => {
  return await Offer.findById(offerId).populate('creatorId', 'name email');
};

const findProposalById = async (proposalId) => {
  return await Proposal.findById(proposalId)
    .populate('campaignId')
    .populate('creatorId', 'name email');
};

const findPaymentMethodById = async (paymentMethodId, brandId) => {
  return await BrandPaymentMethod.findOne({ _id: paymentMethodId, brandId, isActive: true });
};

const createOrderFromOffer = async (offer, brandId, quantity, totalAmount, currency) => {
  const creatorId = offer.creatorId?._id || offer.creatorId;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (offer.deliveryDays || 7));
  const placeholderId = new mongoose.Types.ObjectId('000000000000000000000000');

  console.log('Creating order from offer:', {
    offerId: offer._id,
    brandId: brandId,
    creatorId: creatorId,
    quantity: quantity,
    totalAmount: totalAmount,
    currency: currency
  });

  try {
    const order = await Order.create({
      campaignId: placeholderId,
      proposalId: placeholderId,
      offerId: offer._id,
      brandId,
      creatorId,
      title: offer.title || `Order for ${offer.serviceType}`,
      brief: offer.description || offer.details || (offer.title ? `Order for ${offer.title}` : '') || '',
      compensation: {
        type: 'fixed',
        amount: totalAmount,
        description: `Payment for ${offer.title}`
      },
      timeline: {
        startDate: new Date(),
        dueDate: dueDate
      },
      deliverables: [{
        type: offer.serviceType,
        quantity: quantity,
        platform: offer.platform?.[0] || 'instagram',
        description: offer.description
      }],
      status: 'pending',
      payment: {
        amount: totalAmount,
        currency: currency || 'NGN',
        status: 'pending'
      },
      creatorPaid: {
        status: 'pending'
      }
    });

    if (!order || !order._id) {
      console.error('Order creation returned invalid order:', order);
      throw new Error('Failed to create order - invalid order returned');
    }

    console.log('Order created successfully:', { orderId: order._id, brandId: order.brandId });
    return order;
  } catch (error) {
    console.error('Error creating order from offer:', error);
    throw error;
  }
};

const createOrderFromProposal = async (proposal, brandId, totalAmount, currency) => {
  const campaign = proposal.campaignId;
  const creatorId = proposal.creatorId?._id || proposal.creatorId;
  const campaignId = campaign?._id || campaign;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (proposal.estimatedDeliveryDays || 7));

  console.log('Creating order from proposal:', {
    proposalId: proposal._id,
    campaignId: campaignId,
    brandId: brandId,
    creatorId: creatorId,
    totalAmount: totalAmount
  });

  try {
    const order = await Order.create({
      campaignId: campaignId,
      proposalId: proposal._id,
      brandId: brandId,
      creatorId: creatorId,
      title: campaign?.name || `Order from proposal`,
      deliverables: proposal.proposedDeliverables || [],
      compensation: {
        type: proposal.compensation?.type || 'fixed_price',
        amount: totalAmount,
        description: proposal.compensation?.description || `Payment for proposal acceptance`
      },
      timeline: {
        startDate: new Date(),
        dueDate: dueDate
      },
      status: 'pending',
      payment: {
        amount: totalAmount,
        currency: currency || 'NGN',
        status: 'pending'
      },
      brief: campaign?.description || proposal.message
    });

    if (!order || !order._id) {
      console.error('Order creation returned invalid order:', order);
      throw new Error('Failed to create order - invalid order returned');
    }

    console.log('Order created successfully from proposal:', { orderId: order._id, brandId: order.brandId });
    return order;
  } catch (error) {
    console.error('Error creating order from proposal:', error);
    throw error;
  }
};

const handleProposalAcceptance = async (proposalId, brandId) => {
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
    // Set serviceType if not already set (infer from first deliverable if available)
    if (!campaign.serviceType && proposal.proposedDeliverables && proposal.proposedDeliverables.length > 0) {
      const firstDeliverable = proposal.proposedDeliverables[0];
      if (firstDeliverable.type) {
        campaign.serviceType = firstDeliverable.type;
      }
    }
    await campaign.save();
  }
};

const createPaymentTransaction = async (order, paymentMethod, amount, status, gatewayReference = null) => {
  // Determine the payment method string for the transaction
  let paymentMethodString = 'paystack'; // default
  if (paymentMethod.type === 'paypal') {
    paymentMethodString = 'paypal';
  } else if (paymentMethod.type === 'card' && paymentMethod.cardDetails?.gatewayProvider) {
    // Map gateway provider to payment method
    const gatewayProvider = paymentMethod.cardDetails.gatewayProvider.toLowerCase();
    if (gatewayProvider === 'stripe') {
      paymentMethodString = 'stripe';
    } else if (gatewayProvider === 'flutterwave') {
      paymentMethodString = 'flutterwave';
    } else if (gatewayProvider === 'paystack') {
      paymentMethodString = 'paystack';
    } else {
      paymentMethodString = 'card';
    }
  } else if (paymentMethod.type === 'bank_account') {
    paymentMethodString = 'bank_transfer';
  }

  const transactionData = {
    userId: order.brandId,
    type: 'payment',
    amount,
    currency: order.payment?.currency || 'NGN',
    status,
    description: `Payment for order ${order._id}`,
    paymentMethod: paymentMethodString,
    metadata: {
      orderId: order._id,
      paymentMethodId: paymentMethod._id,
      paymentMethodType: paymentMethod.type
    }
  };

  if (gatewayReference) {
    transactionData.metadata.gatewayReference = gatewayReference;
    transactionData.metadata.gatewayProvider = paymentMethod.cardDetails?.gatewayProvider || paymentMethod.type;
  }

  return await Transaction.create(transactionData);
};

const updatePaymentMethodLastUsed = async (paymentMethod) => {
  paymentMethod.lastUsedAt = new Date();
  await paymentMethod.save();
};

// Gateway helpers (kept for backward compatibility)
const getOrCreateStripeCustomerForUser = async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const userId = req.user._id;
    const email = req.user.email;
    const { getOrCreateStripeCustomer } = require('../utils/paymentGateways');

    const customerId = await getOrCreateStripeCustomer(
      stripe,
      email,
      userId.toString(),
      null,
      req.user.name
    );

    return successResponse(res, { customerId }, 'Stripe customer created');
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to create Stripe customer', 500);
  }
};

/**
 * Initialize Paystack transaction - returns authorization_url for WebView
 * Used for Add Card flow and recommended by Paystack for mobile WebView (avoids blank page from inline.js)
 */
const initializePaystackTransaction = async (req, res) => {
  try {
    const { email, amount = 10000 } = req.body; // 10000 kobo = 100 NGN for card auth
    const userEmail = email || req.user?.email;
    if (!userEmail) {
      return errorResponse(res, 'Email is required', 400);
    }

    const baseUrl = process.env.API_BASE_URL || process.env.BASE_URL || 'https://adpartnr.onrender.com';
    const callbackBase = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
    const callbackUrl = `${callbackBase}/api/payments/paystack/callback`;

    const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
    const response = await paystack.transaction.initialize({
      email: userEmail,
      amount: Number(amount) || 10000,
      currency: 'NGN',
      callback_url: callbackUrl,
      metadata: {
        cancel_action: callbackUrl,
        purpose: 'add_card'
      }
    });

    if (!response.status || !response.data?.authorization_url) {
      return errorResponse(res, response.message || 'Failed to initialize Paystack transaction', 400);
    }

    return successResponse(res, {
      authorization_url: response.data.authorization_url,
      access_code: response.data.access_code,
      reference: response.data.reference
    }, 'Authorization URL created');
  } catch (error) {
    console.error('[Paystack] Initialize error:', error);
    return errorResponse(res, error.message || 'Failed to initialize Paystack transaction', 500);
  }
};

/**
 * Paystack callback - page Paystack redirects to after payment
 * Returns minimal HTML; frontend WebView detects URL and extracts reference
 */
const paystackCallback = async (req, res) => {
  const reference = req.query.reference || req.query.trxref;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Successful</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;}
.box{text-align:center;padding:24px;} .ok{color:#22c55e;font-size:48px;margin-bottom:16px;}
p{color:#64748b;margin:8px 0;}</style></head>
<body><div class="box"><div class="ok">✓</div><h2>Payment Successful</h2>
<p>You can close this window.</p></div></body></html>
  `);
};

const verifyPaystackTransaction = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return errorResponse(res, 'Transaction reference is required', 400);
    }

    const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
    const response = await paystack.transaction.verify(reference);

    if (response.status && response.data.authorization) {
      return successResponse(res, {
        authorization: response.data.authorization,
        customer: response.data.customer
      }, 'Transaction verified successfully');
    } else {
      return errorResponse(res, 'Transaction verification failed', 400);
    }
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to verify transaction', 500);
  }
};

const tokenizeStripeCard = async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    if (!paymentMethodId) {
      return errorResponse(res, 'PaymentMethod ID is required', 400);
    }

    if (!paymentMethodId.startsWith('pm_')) {
      return errorResponse(res, 'Invalid PaymentMethod ID format', 400);
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const userId = req.user._id;
    const email = req.user.email;
    const userName = req.user.name;

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!paymentMethod || paymentMethod.type !== 'card') {
      return errorResponse(res, 'Invalid PaymentMethod or not a card', 400);
    }

    const { getOrCreateStripeCustomer } = require('../utils/paymentGateways');
    const customerId = await getOrCreateStripeCustomer(
      stripe,
      email,
      userId.toString(),
      null,
      userName
    );

    let attachedCustomerId = customerId;
    if (paymentMethod.customer) {
      attachedCustomerId = typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : paymentMethod.customer.id;
    } else {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });
    }

    const card = paymentMethod.card;
    const brandMap = {
      'visa': 'visa',
      'mastercard': 'mastercard',
      'amex': 'amex',
      'discover': 'discover',
      'diners': 'other',
      'jcb': 'other',
      'unionpay': 'other',
      'unknown': 'other'
    };
    const brand = brandMap[card.brand?.toLowerCase()] || 'other';

    return successResponse(res, {
      paymentMethodId: paymentMethodId,
      gatewayToken: paymentMethodId,
      gatewayProvider: 'stripe',
      gatewayCustomerId: attachedCustomerId,
      card: {
        last4: card.last4,
        brand: brand,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        funding: card.funding
      },
      requiresCvv: false
    }, 'Card tokenized successfully');
  } catch (error) {
    if (error.message && error.message.includes('previously used')) {
      return errorResponse(res, 'This payment method was previously used and cannot be reused. Please add a new card.', 400);
    }
    return errorResponse(res, error.message || 'Failed to tokenize card', 500);
  }
};

const tokenizeFlutterwaveCard = async (req, res) => {
  try {
    const { transactionId, txRef } = req.body;
    if (!transactionId && !txRef) {
      return errorResponse(res, 'Transaction ID or reference is required', 400);
    }

    const Flutterwave = require('flutterwave-node-v3');
    const flw = new Flutterwave(
      process.env.FLUTTERWAVE_PUBLIC_KEY,
      process.env.FLUTTERWAVE_SECRET_KEY
    );

    const transactionResponse = await flw.Transaction.verify({ id: transactionId || txRef });

    if (transactionResponse.status === 'success' && transactionResponse.data.card) {
      const cardToken = transactionResponse.data.card.token || transactionResponse.data.card.first_6digits + 'xxxxxx' + transactionResponse.data.card.last_4digits;

      return successResponse(res, {
        token: cardToken,
        card: transactionResponse.data.card
      }, 'Card tokenized successfully');
    } else {
      return errorResponse(res, 'Failed to tokenize card', 400);
    }
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to tokenize card', 500);
  }
};

// Capture PayPal payment
const capturePayPalPayment = async (req, res) => {
  try {
    const { orderId, paypalOrderId } = req.body;

    if (!paypalOrderId) {
      return errorResponse(res, 'PayPal order ID is required', 400);
    }

    if (!orderId) {
      return errorResponse(res, 'Order ID is required', 400);
    }

    // Get payment intent
    const paymentIntentDoc = await PaymentIntent.findOne({
      intentId: paypalOrderId,
      gatewayProvider: 'paypal'
    });

    if (!paymentIntentDoc) {
      return errorResponse(res, 'Payment intent not found', 404);
    }

    // Verify order belongs to user
    // First try to find by the orderId from request
    let order = await Order.findById(orderId);

    // If order not found by orderId, try to find by paymentIntent's orderId
    if (!order && paymentIntentDoc.orderId) {
      order = await Order.findById(paymentIntentDoc.orderId);
      console.log('Order not found by request orderId, trying paymentIntent orderId:', {
        requestOrderId: orderId,
        paymentIntentOrderId: paymentIntentDoc.orderId,
        found: !!order
      });
    }

    if (!order) {
      console.error('Order not found for PayPal capture:', {
        requestOrderId: orderId,
        paymentIntentOrderId: paymentIntentDoc.orderId,
        paymentIntentId: paymentIntentDoc._id,
        paypalOrderId: paypalOrderId
      });
      return errorResponse(res, 'Order not found. Please contact support.', 404);
    }

    if (order.brandId.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'Not authorized to capture this payment', 403);
    }

    // Capture PayPal order
    const { capturePayPalOrder } = require('../utils/paypalHelpers');
    const captureResult = await capturePayPalOrder(paypalOrderId);

    // Get payment method
    const paymentMethod = await BrandPaymentMethod.findById(paymentIntentDoc.paymentMethodId);
    if (!paymentMethod) {
      return errorResponse(res, 'Payment method not found', 404);
    }

    if (captureResult.success) {
      // Run database updates in transaction to ensure atomicity
      const result = await runInTransaction(async (session) => {
        // Reload order with session
        const orderWithSession = await Order.findById(order._id).session(session);
        if (!orderWithSession) {
          throw new Error('Order not found');
        }

        // Check if transaction already exists for this order
        let transaction;
        if (orderWithSession.payment.transactionId) {
          // Transaction already exists, fetch it
          transaction = await Transaction.findById(orderWithSession.payment.transactionId).session(session);
          if (!transaction) {
            // Transaction ID exists but transaction not found, create a new one
            const transactions = await Transaction.create([{
              userId: orderWithSession.brandId,
              type: 'payment',
              amount: paymentIntentDoc.amount,
              currency: paymentIntentDoc.currency || 'NGN',
              status: 'completed',
              description: `Payment for order ${orderWithSession._id}`,
              paymentMethod: 'paypal',
              metadata: {
                orderId: orderWithSession._id,
                paymentMethodId: paymentMethod._id,
                paymentMethodType: paymentMethod.type,
                gatewayReference: captureResult.captureId || paypalOrderId,
                gatewayProvider: 'paypal'
              },
              processedAt: new Date()
            }], { session });
            transaction = transactions[0];
          }
        } else {
          // Check if a completed transaction already exists for this order
          const existingTransaction = await Transaction.findOne({
            'metadata.orderId': orderWithSession._id,
            type: 'payment',
            status: 'completed'
          }).session(session);

          if (existingTransaction) {
            transaction = existingTransaction;
          } else {
            // Create new transaction
            const transactions = await Transaction.create([{
              userId: orderWithSession.brandId,
              type: 'payment',
              amount: paymentIntentDoc.amount,
              currency: paymentIntentDoc.currency || 'NGN',
              status: 'completed',
              description: `Payment for order ${orderWithSession._id}`,
              paymentMethod: 'paypal',
              metadata: {
                orderId: orderWithSession._id,
                paymentMethodId: paymentMethod._id,
                paymentMethodType: paymentMethod.type,
                gatewayReference: captureResult.captureId || paypalOrderId,
                gatewayProvider: 'paypal'
              },
              processedAt: new Date()
            }], { session });
            transaction = transactions[0];
          }
        }

        // Update order with session
        if (orderWithSession.payment.status !== 'completed') {
          orderWithSession.payment.status = 'completed';
          orderWithSession.payment.paidAt = new Date();
          orderWithSession.payment.transactionId = transaction._id;
          orderWithSession.status = 'in_progress';
          await orderWithSession.save({ session });
        } else if (!orderWithSession.payment.transactionId) {
          // Status is completed but transactionId is missing, update it
          orderWithSession.payment.transactionId = transaction._id;
          await orderWithSession.save({ session });
        }

        // Update payment intent with session
        const paymentIntentWithSession = await PaymentIntent.findById(paymentIntentDoc._id).session(session);
        if (paymentIntentWithSession) {
          paymentIntentWithSession.status = 'succeeded';
          paymentIntentWithSession.gatewayReference = captureResult.captureId || paypalOrderId;
          paymentIntentWithSession.confirmedAt = new Date();
          await paymentIntentWithSession.save({ session });
        }

        // Update payment method last used (outside transaction - less critical)
        await updatePaymentMethodLastUsed(paymentMethod);

        return { order: orderWithSession, transaction };
      });

      // Update order and transaction for response
      order = result.order;
      const transaction = result.transaction;

      // Handle proposal acceptance if applicable
      if (order.proposalId && order.proposalId.toString() !== '000000000000000000000000') {
        await handleProposalAcceptance(order.proposalId, order.brandId);
      }

      if (order.creatorId) {
        await createNotification({
          userId: order.creatorId,
          type: 'order_paid',
          title: 'Order paid',
          body: `Payment received for order "${order.title}". You can now submit deliverables.`,
          data: { orderId: order._id?.toString?.() || String(order._id) },
          actorId: order.brandId,
          dedupeData: { orderId: order._id },
        });
      }

      return successResponse(res, {
        order,
        transaction,
        payment: captureResult
      }, 'PayPal payment captured successfully');
    } else {
      // Payment failed
      await createPaymentTransaction(
        order,
        paymentMethod,
        paymentIntentDoc.amount,
        'failed',
        paypalOrderId
      );

      await paymentIntentDoc.markFailed();

      return errorResponse(res, 'PayPal payment capture failed', 400);
    }
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to capture PayPal payment', 500);
  }
};

// Direct pay endpoint (one-time payment without saving card)
const directPay = async (req, res) => {
  try {
    const { offerId, proposalId, paymentToken, gatewayProvider, currency, quantity = 1 } = req.body;
    const brandId = req.user._id;

    if (!offerId && !proposalId) {
      return errorResponse(res, 'Either offerId or proposalId is required', 400);
    }

    if (!paymentToken) {
      return errorResponse(res, 'Payment token is required', 400);
    }

    if (!gatewayProvider) {
      return errorResponse(res, 'Gateway provider is required (stripe, paystack, or flutterwave)', 400);
    }

    if (!['stripe', 'paystack', 'flutterwave'].includes(gatewayProvider.toLowerCase())) {
      return errorResponse(res, 'Invalid gateway provider. Must be stripe, paystack, or flutterwave', 400);
    }

    let order;
    let totalAmount;
    let orderCurrency;
    let description;

    if (offerId) {
      const offer = await findOfferById(offerId);
      if (!offer) {
        return errorResponse(res, 'Offer not found', 404);
      }

      const selectedCurrency = (currency || 'NGN').toUpperCase();
      if (!['NGN', 'USD'].includes(selectedCurrency)) {
        return errorResponse(res, 'Invalid currency. Must be NGN or USD', 400);
      }

      let rate = null;
      if (selectedCurrency === 'NGN' && offer.rate?.ngn) {
        rate = offer.rate.ngn;
      } else if (selectedCurrency === 'USD' && offer.rate?.usd) {
        rate = offer.rate.usd;
      }

      if (!rate) {
        return errorResponse(res, 'Offer does not have a valid rate for the selected currency', 400);
      }

      orderCurrency = selectedCurrency;
      totalAmount = rate * quantity;
      description = `Payment for offer: ${offer.title}`;
      order = await createOrderFromOffer(offer, brandId, quantity, totalAmount, orderCurrency);
    } else {
      const proposal = await findProposalById(proposalId);
      if (!proposal) {
        return errorResponse(res, 'Proposal not found', 404);
      }
      if (proposal.status !== 'pending') {
        return errorResponse(res, 'Proposal has already been reviewed', 400);
      }
      const proposalCurrency = proposal.currency || proposal.campaignId?.currency || 'NGN';
      totalAmount = proposal.compensation.amount || 0;
      orderCurrency = proposalCurrency.toUpperCase();
      description = `Payment for proposal acceptance`;
      order = await createOrderFromProposal(proposal, brandId, totalAmount, orderCurrency);
    }

    if (!order || !order._id) {
      return errorResponse(res, 'Failed to create order', 500);
    }

    const { chargeCardStripe, chargeCardPaystack, chargeCardFlutterwave } = require('../utils/paymentGateways');
    const userEmail = req.user.email;
    const userName = req.user.name;

    let paymentResult;
    try {
      switch (gatewayProvider.toLowerCase()) {
        case 'stripe':
          paymentResult = await chargeCardStripe(
            totalAmount,
            orderCurrency,
            paymentToken,
            description,
            userEmail,
            brandId.toString(),
            null,
            userName
          );
          break;
        case 'paystack':
          paymentResult = await chargeCardPaystack(
            totalAmount,
            orderCurrency,
            paymentToken,
            userEmail
          );
          break;
        case 'flutterwave':
          paymentResult = await chargeCardFlutterwave(
            totalAmount,
            orderCurrency,
            paymentToken,
            userEmail
          );
          break;
        default:
          return errorResponse(res, 'Unsupported gateway provider', 400);
      }
    } catch (paymentError) {
      order.payment.status = 'failed';
      await order.save();
      return errorResponse(res, `Payment failed: ${paymentError.message}`, 400);
    }

    if (!paymentResult.success) {
      order.payment.status = 'failed';
      await order.save();
      return errorResponse(res, `Payment failed: ${paymentResult.message || 'Unknown error'}`, 400);
    }

    const gatewayReference = paymentResult.data?.id ||
      paymentResult.data?.reference ||
      paymentResult.data?.tx_ref ||
      null;

    // Run database updates in transaction to ensure atomicity
    // Note: Payment gateway call happens outside transaction (can't be rolled back)
    const result = await runInTransaction(async (session) => {
      // Reload order with session
      const orderWithSession = await Order.findById(order._id).session(session);
      if (!orderWithSession) {
        throw new Error('Order not found');
      }

      // Create transaction with session
      const transactions = await Transaction.create([{
        userId: brandId,
        type: 'payment',
        amount: totalAmount,
        currency: orderCurrency,
        status: 'completed',
        description: description,
        paymentMethod: gatewayProvider.toLowerCase(),
        metadata: {
          orderId: orderWithSession._id,
          gatewayReference: gatewayReference,
          gatewayProvider: gatewayProvider.toLowerCase(),
          isDirectPay: true
        },
        processedAt: new Date()
      }], { session });

      const transaction = transactions[0];

      // Update order with session
      orderWithSession.payment.status = 'completed';
      orderWithSession.payment.paidAt = new Date();
      orderWithSession.payment.transactionId = transaction._id;
      // Keep newly paid orders in 'pending' until creator starts work
      orderWithSession.status = 'pending';
      await orderWithSession.save({ session });

      return { order: orderWithSession, transaction };
    });

    // Use the results from the transaction
    const { order: updatedOrder, transaction } = result;

    if (proposalId) {
      await handleProposalAcceptance(proposalId, brandId);
    }

    return successResponse(res, {
      order: updatedOrder.toObject ? updatedOrder.toObject() : updatedOrder,
      transaction: transaction.toObject ? transaction.toObject() : transaction,
      payment: {
        success: true,
        gatewayReference: gatewayReference,
        gatewayProvider: gatewayProvider.toLowerCase()
      }
    }, 'Payment processed successfully');
  } catch (error) {
    console.error('Direct pay error:', error);
    return errorResponse(res, error.message || 'Payment processing failed', 500);
  }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const brandId = req.user._id;

    const transaction = await Transaction.findById(paymentId)
      .populate('metadata.orderId', 'title compensation status')
      .populate('metadata.brandId', 'name email');

    if (!transaction) {
      return errorResponse(res, 'Payment not found', 404);
    }

    if (transaction.type !== 'payment') {
      return errorResponse(res, 'Transaction is not a payment', 400);
    }

    if (transaction.userId.toString() !== brandId.toString()) {
      return errorResponse(res, 'Not authorized to view this payment', 403);
    }

    return successResponse(res, transaction, 'Payment retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get all payments for a brand
const getBrandPayments = async (req, res) => {
  try {
    const brandId = req.user._id;
    const { page, limit, status, gatewayProvider } = req.query;

    const query = {
      userId: brandId,
      type: 'payment'
    };

    if (status) {
      query.status = status;
    }

    if (gatewayProvider) {
      query.paymentMethod = gatewayProvider.toLowerCase();
    }

    const transactionQuery = Transaction.find(query)
      .populate('metadata.orderId', 'title compensation status')
      .sort({ createdAt: -1 });

    const { applyPagination } = require('../utils/pagination');
    const { data, pagination } = await applyPagination(transactionQuery, page, limit);

    return successResponse(res, { payments: data, pagination }, 'Payments retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Refund a payment
const refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason, amount } = req.body;
    const brandId = req.user._id;

    const transaction = await Transaction.findById(paymentId)
      .populate('metadata.orderId');

    if (!transaction) {
      return errorResponse(res, 'Payment not found', 404);
    }

    if (transaction.type !== 'payment') {
      return errorResponse(res, 'Transaction is not a payment', 400);
    }

    if (transaction.userId.toString() !== brandId.toString()) {
      return errorResponse(res, 'Not authorized to refund this payment', 403);
    }

    if (transaction.status !== 'completed') {
      return errorResponse(res, 'Only completed payments can be refunded', 400);
    }

    const order = transaction.metadata.orderId;
    if (!order) {
      return errorResponse(res, 'Order not found for this payment', 404);
    }

    const refundAmount = amount || transaction.amount;
    if (refundAmount > transaction.amount) {
      return errorResponse(res, 'Refund amount cannot exceed payment amount', 400);
    }

    const gatewayProvider = transaction.metadata.gatewayProvider || transaction.paymentMethod;
    const gatewayReference = transaction.metadata.gatewayReference;

    if (!gatewayReference) {
      return errorResponse(res, 'Payment gateway reference not found', 400);
    }

    let refundResult;
    try {
      switch (gatewayProvider) {
        case 'stripe':
          refundResult = await refundStripePayment(gatewayReference, refundAmount, transaction.currency);
          break;
        case 'paystack':
          refundResult = await refundPaystackPayment(gatewayReference, refundAmount, transaction.currency);
          break;
        case 'flutterwave':
          refundResult = await refundFlutterwavePayment(gatewayReference, refundAmount, transaction.currency);
          break;
        case 'paypal':
          refundResult = await refundPayPalPayment(gatewayReference, refundAmount, transaction.currency);
          break;
        default:
          return errorResponse(res, 'Unsupported payment gateway for refund', 400);
      }
    } catch (refundError) {
      return errorResponse(res, `Refund failed: ${refundError.message}`, 400);
    }

    if (!refundResult.success) {
      return errorResponse(res, `Refund failed: ${refundResult.message || 'Unknown error'}`, 400);
    }

    const refundTransaction = await Transaction.create({
      userId: brandId,
      type: 'refund',
      amount: refundAmount,
      currency: transaction.currency,
      status: 'completed',
      description: reason || `Refund for payment ${paymentId}`,
      paymentMethod: gatewayProvider,
      metadata: {
        orderId: order._id,
        gatewayReference: refundResult.refundId || gatewayReference,
        gatewayProvider: gatewayProvider,
        originalTransactionId: transaction._id,
        reason: reason
      },
      processedAt: new Date()
    });

    if (refundAmount === transaction.amount) {
      order.payment.status = 'refunded';
    } else {
      order.payment.status = 'partial';
    }
    await order.save();

    return successResponse(res, {
      refund: refundTransaction,
      originalPayment: transaction,
      order: order
    }, 'Refund processed successfully');
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to process refund', 500);
  }
};

// Refund helpers
const refundStripePayment = async (gatewayReference, amount, currency) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const amountInCents = Math.round(amount * 100);

  try {
    // gatewayReference could be PaymentIntent ID (pi_xxx) or Charge ID (ch_xxx)
    let refundParams = {
      amount: amountInCents,
      reason: 'requested_by_customer'
    };

    if (gatewayReference.startsWith('pi_')) {
      // PaymentIntent ID - get the charge ID from the payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(gatewayReference);
      if (paymentIntent.latest_charge) {
        refundParams.charge = paymentIntent.latest_charge;
      } else if (paymentIntent.charges?.data?.[0]?.id) {
        refundParams.charge = paymentIntent.charges.data[0].id;
      } else {
        // Try to refund using payment_intent parameter
        refundParams.payment_intent = gatewayReference;
      }
    } else if (gatewayReference.startsWith('ch_')) {
      // Charge ID - use directly
      refundParams.charge = gatewayReference;
    } else {
      // Try as charge ID
      refundParams.charge = gatewayReference;
    }

    const refund = await stripe.refunds.create(refundParams);

    return {
      success: refund.status === 'succeeded' || refund.status === 'pending',
      refundId: refund.id,
      status: refund.status
    };
  } catch (error) {
    throw new Error(error.message || 'Stripe refund failed');
  }
};

const refundPaystackPayment = async (reference, amount, currency) => {
  const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
  const amountInKobo = Math.round(amount * 100);

  try {
    const refund = await paystack.refund.create({
      transaction: reference,
      amount: amountInKobo,
      currency: currency
    });

    return {
      success: refund.status === 'success',
      refundId: refund.data.id,
      status: refund.status
    };
  } catch (error) {
    throw new Error(error.message || 'Paystack refund failed');
  }
};

const refundFlutterwavePayment = async (transactionId, amount, currency) => {
  const Flutterwave = require('flutterwave-node-v3');
  const flw = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
  );

  try {
    const refund = await flw.Refund.create({
      id: transactionId,
      amount: amount
    });

    return {
      success: refund.status === 'success',
      refundId: refund.data.id,
      status: refund.status
    };
  } catch (error) {
    throw new Error(error.message || 'Flutterwave refund failed');
  }
};

const refundPayPalPayment = async (captureId, amount, currency) => {
  const { getPayPalAccessToken } = require('../utils/paypalHelpers');
  const axios = require('axios');
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  const baseURL = mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const accessToken = await getPayPalAccessToken();

  try {
    const refund = await axios.post(
      `${baseURL}/v2/payments/captures/${captureId}/refund`,
      {
        amount: {
          value: amount.toString(),
          currency_code: currency
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return {
      success: refund.data.status === 'COMPLETED' || refund.data.status === 'PENDING',
      refundId: refund.data.id,
      status: refund.data.status
    };
  } catch (error) {
    throw new Error(error.response?.data?.message || error.message || 'PayPal refund failed');
  }
};

module.exports = {
  createPaymentIntentEndpoint,
  confirmPayment,
  purchaseOffer,
  acceptProposalWithPayment,
  capturePayPalPayment,
  directPay,
  getPaymentById,
  getBrandPayments,
  refundPayment,
  getOrCreateStripeCustomerForUser,
  verifyPaystackTransaction,
  initializePaystackTransaction,
  paystackCallback,
  tokenizeStripeCard,
  tokenizeFlutterwaveCard
};
