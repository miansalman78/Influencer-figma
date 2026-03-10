const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const socialOAuthController = require('../controllers/socialOAuthController');
const testFacebookController = require('../controllers/social/testFacebookController');

// OAuth flow endpoints
// Support both GET (web) and POST (mobile with deepLink) for initiateOAuth
router.get('/connect/:platform', authenticate, socialOAuthController.initiateOAuth);
router.post('/connect/:platform', authenticate, socialOAuthController.initiateOAuth);
router.get('/callback/:platform', socialOAuthController.handleOAuthCallback);
router.post('/sync/:platform', authenticate, socialOAuthController.syncSocialMetrics);

// Facebook page selection
router.get('/facebook/pages', authenticate, socialOAuthController.listFacebookPages);
router.post('/facebook/select-page', authenticate, socialOAuthController.selectFacebookPage);

// Profile URL for connected accounts
router.get('/profile-url/:platform', authenticate, socialOAuthController.getProfileUrl);

// Minimal hardcoded Facebook Business Login test (no auth, no scopes)
// This is purely for debugging with a specific config_id.
router.get('/test/facebook', testFacebookController.getTestFacebookAuthUrl);
router.get('/test/facebook/callback', testFacebookController.handleTestFacebookCallback);

// Meta required endpoints for Live apps (Facebook/Instagram)
// These endpoints are required by Meta and must return { status: "ok" }
router.post('/deauthorize', socialOAuthController.handleDeauthorize);
router.post('/data-deletion', socialOAuthController.handleDataDeletion);

module.exports = router;
