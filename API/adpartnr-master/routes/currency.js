const express = require('express');
const router = express.Router();
const { getExchangeRates } = require('../controllers/currencyController');

router.get('/rates', getExchangeRates);

module.exports = router;

