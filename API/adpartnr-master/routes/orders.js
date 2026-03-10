const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');
const { validateObjectId, validatePagination } = require('../middleware/validation');

// Get active orders (both brand and creator)
router.get('/active', authenticate, validatePagination, orderController.getActiveOrders);

// Get all orders (including completed)
router.get('/', authenticate, validatePagination, orderController.getOrders);

// Get order by ID
router.get('/:id', authenticate, validateObjectId('id'), orderController.getOrderById);

// Submit deliverables (creator only)
router.post('/:id/submit', authenticate, validateObjectId('id'), orderController.submitDeliverables);

// Approve deliverables (brand only)
router.post('/:id/approve', authenticate, validateObjectId('id'), orderController.approveDeliverables);

// Request revisions (brand only)
router.post('/:id/revisions', authenticate, validateObjectId('id'), orderController.requestRevisions);

// Update order (status, endDate, dueDate, brief, etc.)
router.put('/:id', authenticate, validateObjectId('id'), orderController.updateOrder);

module.exports = router;

