const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const onboardingController = require('../controllers/onboardingController');

// Stricter rate limit for unauthenticated scrape endpoint (per IP)
const scrapeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many scrape requests. Please try again later.' }
});

router.post('/scrape-followers', scrapeLimiter, onboardingController.scrapeFollowers);

module.exports = router;
