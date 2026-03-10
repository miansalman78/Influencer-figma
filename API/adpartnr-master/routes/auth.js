const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const {
  validateUserSignup,
  validateUserLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword
} = require('../middleware/validation');
const { uploadProfile } = require('../config/cloudinary');

// Public routes
router.post('/signup', uploadProfile.single('profileImage'), validateUserSignup, authController.register);
router.post('/login', validateUserLogin, authController.login);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, authController.resetPassword);

// OAuth routes
const oauthController = require('../controllers/oauthController');
router.post('/google', oauthController.googleAuth);
router.get('/google/callback', oauthController.googleCallback);
router.post('/apple', oauthController.appleAuth);
router.get('/apple/callback', oauthController.appleCallback);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.get('/me', authenticate, authController.getProfile); // Alias for /profile
router.put('/profile', authenticate, authController.updateProfile);
router.post('/social-connect', authenticate, authController.connectSocial);
router.put('/fcm-token', authenticate, authController.updateFcmToken);
router.put('/change-password', authenticate, validateChangePassword, authController.changePassword);

module.exports = router;
