const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { authenticate, authorizeBrand, optionalAuth } = require('../middleware/auth');
const { validateCampaign, validateObjectId, validatePagination } = require('../middleware/validation');

// Public routes - Browse campaigns (for creators)
router.get('/', optionalAuth, validatePagination, campaignController.getCampaigns);

// Protected routes - Brand campaign management
router.post('/', authenticate, authorizeBrand, validateCampaign, campaignController.createCampaign);
router.get('/me/campaigns', authenticate, authorizeBrand, validatePagination, campaignController.getMyCampaigns);

// Campaign save/bookmark routes (for creators) - MUST come before /:id routes
router.get('/saved', authenticate, validatePagination, campaignController.getSavedCampaigns);
router.post('/:id/save', authenticate, validateObjectId('id'), campaignController.saveCampaign);
router.delete('/:id/save', authenticate, validateObjectId('id'), campaignController.unsaveCampaign);

// Campaign application routes (legacy - use proposals instead) - MUST come before /:id routes
router.post('/:id/apply', authenticate, validateObjectId('id'), campaignController.applyToCampaign);
router.get('/:id/applicants', authenticate, authorizeBrand, validateObjectId('id'), campaignController.getCampaignApplicants);
router.post('/:campaignId/hire/:creatorId', authenticate, authorizeBrand, validateObjectId('campaignId'), validateObjectId('creatorId'), campaignController.hireCreator);

// Campaign CRUD routes with :id parameter - Specific routes first, then generic
router.get('/:id', optionalAuth, validateObjectId('id'), campaignController.getCampaignById);
router.put('/:id/publish', authenticate, authorizeBrand, validateObjectId('id'), campaignController.publishCampaign);
router.put('/:id', authenticate, authorizeBrand, validateObjectId('id'), campaignController.updateCampaign);
router.delete('/:id', authenticate, authorizeBrand, validateObjectId('id'), campaignController.deleteCampaign);

module.exports = router;
