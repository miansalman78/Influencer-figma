const express = require('express');
const router = express.Router();
const { authenticate, authorizeBrand } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');
const brandPaymentMethodController = require('../controllers/brandPaymentMethodController');
const brandController = require('../controllers/brandController');

// Payment method routes MUST come before /:id so "payment-methods" is not matched as id
router.get('/payment-methods', authenticate, authorizeBrand, brandPaymentMethodController.getPaymentMethods);
router.post('/payment-methods', authenticate, authorizeBrand, brandPaymentMethodController.createPaymentMethod);
router.put('/payment-methods/:id', authenticate, authorizeBrand, validateObjectId('id'), brandPaymentMethodController.updatePaymentMethod);
router.delete('/payment-methods/:id', authenticate, authorizeBrand, validateObjectId('id'), brandPaymentMethodController.deletePaymentMethod);

// Brand listing (public) – GET /api/brands?page=1&limit=50&q=search
router.get('/', brandController.getBrands);
router.get('/:id', validateObjectId('id'), brandController.getBrandById);

module.exports = router;

