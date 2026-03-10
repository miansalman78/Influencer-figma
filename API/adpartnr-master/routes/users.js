const express = require('express');
const router = express.Router();
const { validatePagination } = require('../middleware/validation');
const creatorController = require('../controllers/creatorController');

// Get all creators (public - for content discovery)
router.get('/creators', validatePagination, creatorController.getCreators);

module.exports = router;

