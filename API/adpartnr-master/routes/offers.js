const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const paymentController = require('../controllers/paymentController');
const { uploadOfferMedia } = require('../config/cloudinary');
const { authenticate, authorizeCreator, authorizeBrand, optionalAuth } = require('../middleware/auth');
const { validateOffer, validateObjectId, validatePagination } = require('../middleware/validation');

// Parse JSON string fields from multipart/form-data (mobile sends nested objects as JSON strings)
const parseOfferFormBody = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') return next();
  const fields = ['rate', 'platform', 'location', 'tags', 'media', 'existingMedia'];
  for (const field of fields) {
    const value = req.body[field];
    if (typeof value === 'string' && value.trim()) {
      try {
        req.body[field] = JSON.parse(value);
      } catch (e) {
        if (field === 'platform' && /^[\w]+$/.test(value)) {
          req.body[field] = [value];
        }
      }
    }
  }
  next();
};

// Public routes (optionalAuth: when brand is logged in, they see custom offers sent to them)
router.get('/', optionalAuth, validatePagination, offerController.getOffers);
router.get('/featured', optionalAuth, validatePagination, offerController.getFeaturedOffers);
router.get('/search', optionalAuth, validatePagination, offerController.searchOffers);
router.get('/:id', optionalAuth, validateObjectId('id'), offerController.getOfferById);

// Protected routes (Creator only)
router.post('/', authenticate, authorizeCreator, uploadOfferMedia.array('media', 5), parseOfferFormBody, validateOffer, offerController.createOffer);
router.put('/:id', authenticate, authorizeCreator, validateObjectId('id'), uploadOfferMedia.array('media', 5), parseOfferFormBody, offerController.updateOffer);
router.put('/:id/publish', authenticate, authorizeCreator, validateObjectId('id'), offerController.publishOffer);
router.delete('/:id', authenticate, authorizeCreator, validateObjectId('id'), offerController.deleteOffer);
router.post('/custom', authenticate, authorizeCreator, uploadOfferMedia.array('media', 5), parseOfferFormBody, validateOffer, offerController.createCustomOffer);
router.get('/user/my-offers', authenticate, authorizeCreator, validatePagination, offerController.getUserOffers);
router.post('/send-to-brand', authenticate, authorizeCreator, offerController.sendOfferToBrand);

// Payment routes (Brand only)
router.post('/:offerId/purchase', authenticate, authorizeBrand, validateObjectId('offerId'), paymentController.purchaseOffer);

module.exports = router;
