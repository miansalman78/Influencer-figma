const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const { authenticate } = require('../middleware/auth');

router.post('/send', authenticate, connectionController.sendConnect);
router.get('/', authenticate, connectionController.listConnections);
router.get('/check', authenticate, connectionController.checkConnection);
router.delete('/', authenticate, connectionController.disconnect);

module.exports = router;
