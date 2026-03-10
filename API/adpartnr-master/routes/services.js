const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticate, authorizeCreator } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');

// Public routes
router.get('/role/:creatorRole', serviceController.getServicesByRole);
router.get('/all', serviceController.getAllServices);

// Protected routes
router.get('/user', authenticate, serviceController.getUserServices);
router.put('/user', authenticate, authorizeCreator, serviceController.updateUserServices);

module.exports = router;
