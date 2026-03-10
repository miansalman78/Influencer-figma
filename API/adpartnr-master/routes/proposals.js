const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const paymentController = require('../controllers/paymentController');
const { authenticate, authorizeCreator, authorizeBrand } = require('../middleware/auth');
const { validateObjectId, validatePagination } = require('../middleware/validation');

// Create proposal/bid (creator only)
router.post('/campaign/:campaignId', authenticate, authorizeCreator, validateObjectId('campaignId'), proposalController.createProposal);

// Get campaign proposals (brand only)
router.get('/campaign/:campaignId', authenticate, authorizeBrand, validateObjectId('campaignId'), validatePagination, proposalController.getCampaignProposals);

// Get my proposals (creator only)
router.get('/me', authenticate, authorizeCreator, validatePagination, proposalController.getMyProposals);

// Get proposal by ID
router.get('/:id', authenticate, validateObjectId('id'), proposalController.getProposalById);

// Withdraw proposal (creator only)
router.post('/:id/withdraw', authenticate, authorizeCreator, validateObjectId('id'), proposalController.withdrawProposal);

// Accept proposal with payment (brand only) - uses new payment flow
router.post('/:id/accept', authenticate, authorizeBrand, validateObjectId('id'), paymentController.acceptProposalWithPayment);

// Reject proposal (brand only)
router.post('/:id/reject', authenticate, authorizeBrand, validateObjectId('id'), proposalController.rejectProposal);

module.exports = router;

