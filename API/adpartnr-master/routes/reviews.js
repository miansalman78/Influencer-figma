const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/auth');
const { validateReview, validateObjectId, validatePagination } = require('../middleware/validation');

// Public routes
router.get('/user/:userId', validateObjectId('userId'), validatePagination, reviewController.getUserReviews);
router.get('/user/:userId/average', validateObjectId('userId'), reviewController.getUserAverageRatings);
router.get('/:id', validateObjectId('id'), reviewController.getReviewById);

// Protected routes
router.post('/', authenticate, validateReview, reviewController.createReview);
router.put('/:id', authenticate, validateObjectId('id'), reviewController.updateReview);
router.delete('/:id', authenticate, validateObjectId('id'), reviewController.deleteReview);

// Review interaction routes
router.post('/:id/vote', authenticate, validateObjectId('id'), reviewController.voteReviewHelpful);
router.post('/:id/respond', authenticate, validateObjectId('id'), reviewController.respondToReview);

module.exports = router;
