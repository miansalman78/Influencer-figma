const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

// PUBLIC – no authenticate middleware. Not access-token bounded.
// Use everywhere: before login, signup, location pickers, etc.
router.get('/countries', locationController.getCountries);
router.get('/countries/:countryCode/states', locationController.getStates);
router.get('/countries/:countryCode/states/:stateCode/cities', locationController.getCities);

module.exports = router;

