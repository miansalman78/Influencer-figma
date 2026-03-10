const express = require('express');
const router = express.Router();
const { authenticate, authorizeCreator, authorizeBrand } = require('../middleware/auth');
const { validateObjectId, validatePagination, validateSocialMedia, validatePlatformParam } = require('../middleware/validation');
const profileController = require('../controllers/profileController');
const portfolioController = require('../controllers/portfolioController');
const socialMediaController = require('../controllers/socialMediaController');

// Profile routes
// Get own profile (authenticated user)
router.get('/profile', authenticate, profileController.getOwnProfile);

// Update profile (authenticated user)
router.put('/profile', authenticate, profileController.updateProfile);

// Social media routes (must come before /profile/:userId to avoid route conflicts)
router.get('/profile/social-media', authenticate, socialMediaController.getSocialMedia);
router.put('/profile/social-media', authenticate, validateSocialMedia, socialMediaController.updateSocialMedia);
router.delete('/profile/social-media/:platform', authenticate, validatePlatformParam, socialMediaController.deleteSocialMedia);

// Portfolio routes (must come before /profile/:userId to avoid route conflicts)
router.get('/profile/:userId/portfolio', validateObjectId('userId'), validatePagination, portfolioController.getUserPortfolio);
router.post('/profile/portfolio', authenticate, portfolioController.createPortfolioItem);
router.put('/profile/portfolio/:id', authenticate, validateObjectId('id'), portfolioController.updatePortfolioItem);
router.delete('/profile/portfolio/:id', authenticate, validateObjectId('id'), portfolioController.deletePortfolioItem);

// Get profile by userId (public) - must be last to avoid matching other routes
router.get('/profile/:userId', validateObjectId('userId'), profileController.getProfile);

// Select user role
router.post('/select-role', authenticate, (req, res) => {
  // Implementation would go here
  res.json({ message: 'Role selection endpoint' });
});

// Creator primary role selection
router.post('/creator-primary-role', authenticate, authorizeCreator, (req, res) => {
  // Implementation would go here
  res.json({ message: 'Creator primary role selection endpoint' });
});

// Creator service type selection
router.post('/creator-service-type', authenticate, authorizeCreator, (req, res) => {
  // Implementation would go here
  res.json({ message: 'Creator service type selection endpoint' });
});

// Get user dashboard data
router.get('/dashboard', authenticate, (req, res) => {
  // Implementation would go here
  res.json({ message: 'User dashboard endpoint' });
});

module.exports = router;
