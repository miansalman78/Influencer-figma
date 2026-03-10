const express = require('express');
const router = express.Router();
const creatorRolesController = require('../controllers/creatorRolesController');

// Get creator roles (public endpoint)
router.get('/', creatorRolesController.getCreatorRoles);

module.exports = router;

