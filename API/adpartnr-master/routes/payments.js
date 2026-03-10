const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate, authorizeBrand } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');

// Public routes (Paystack redirects user here - no auth)
router.get('/paystack/callback', paymentController.paystackCallback);

// All other payment routes are protected
router.use(authenticate);

// Payment intent endpoints (two-step payment flow)
router.post('/create-intent', authorizeBrand, paymentController.createPaymentIntentEndpoint);
router.post('/confirm', authorizeBrand, paymentController.confirmPayment);

// Direct pay endpoint (one-time payment without saving card)
router.post('/direct-pay', authorizeBrand, paymentController.directPay);

// PayPal endpoints
router.post('/paypal/capture', authenticate, paymentController.capturePayPalPayment);

// Payment gateway helpers (must be before generic routes)
router.post('/stripe/customer', authorizeBrand, paymentController.getOrCreateStripeCustomerForUser);
router.post('/tokenize-stripe', authorizeBrand, paymentController.tokenizeStripeCard);
router.get('/verify-paystack', paymentController.verifyPaystackTransaction);
router.post('/paystack/initialize', authorizeBrand, paymentController.initializePaystackTransaction);
router.post('/tokenize-flutterwave', authorizeBrand, paymentController.tokenizeFlutterwaveCard);

// Payment tracking and refund (must be last to avoid route conflicts)
router.get('/brand/payments', authorizeBrand, paymentController.getBrandPayments);
router.get('/:paymentId', authorizeBrand, validateObjectId('paymentId'), paymentController.getPaymentById);
router.post('/:paymentId/refund', authorizeBrand, validateObjectId('paymentId'), paymentController.refundPayment);

module.exports = router;
