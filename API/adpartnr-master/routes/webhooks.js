const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook endpoints (no authentication - verified by signature)
// IMPORTANT: These endpoints should be publicly accessible but protected by signature verification

// Stripe webhook
router.post('/stripe', express.raw({ type: 'application/json' }), webhookController.handleStripeWebhook);

// Paystack webhook
router.post('/paystack', express.json(), webhookController.handlePaystackWebhook);

// Flutterwave webhook
router.post('/flutterwave', express.json(), webhookController.handleFlutterwaveWebhook);

// PayPal webhook
router.post('/paypal', express.json(), webhookController.handlePayPalWebhook);

module.exports = router;

