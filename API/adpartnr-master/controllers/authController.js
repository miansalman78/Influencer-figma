const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { successResponse, errorResponse, createdResponse, unauthorizedResponse } = require('../utils/response');
const { sanitizeString, isValidEmail } = require('../utils/helpers');

// Register user
const register = async (req, res) => {
  try {
    // Handle both JSON and FormData
    const { name, email, password, role, creatorRole, location, services, bio, phone, website, category } = req.body;

    const userExists = await checkUserExists(email);
    if (userExists) {
      return errorResponse(res, 'User already exists with this email', 409);
    }

    // Parse location if it's a string (from FormData)
    let locationData = location;
    if (typeof location === 'string') {
      try {
        locationData = JSON.parse(location);
      } catch (e) {
        locationData = null;
      }
    }

    // Parse services if it's a string or array
    let servicesArray = services;
    if (typeof services === 'string') {
      try {
        servicesArray = JSON.parse(services);
      } catch (e) {
        servicesArray = Array.isArray(services) ? services : [];
      }
    }

    const userData = {
      name,
      email,
      password,
      role,
      creatorRole,
      location: locationData,
      services: servicesArray,
      bio,
      phone,
      website
    };

    // Handle profile image upload if provided
    // req.file is already processed by multer and contains Cloudinary URL in req.file.path
    if (req.file && req.file.path) {
      userData.profileImage = req.file.path; // Cloudinary secure URL
    }

    const user = await createUser(userData);
    const token = generateToken(user._id);

    return createdResponse(res, {
      user: sanitizeUserData(user),
      token
    }, 'User registered successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return unauthorizedResponse(res, 'Invalid credentials');
    }

    // Check if user is OAuth-only (no password)
    if (user.oauthProvider && !user.password) {
      return unauthorizedResponse(res, 'This account uses OAuth login. Please use Google or Apple sign-in.');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return unauthorizedResponse(res, 'Invalid credentials');
    }

    await user.updateLastActive();
    const token = generateToken(user._id);

    return successResponse(res, {
      user: sanitizeUserData(user),
      token
    }, 'Login successful');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user._id);
    return successResponse(res, sanitizeUserData(user), 'Profile retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const updateData = sanitizeUpdateData(req.body);

    const user = await updateUserById(userId, updateData);
    return successResponse(res, sanitizeUserData(user), 'Profile updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Connect social media
const connectSocial = async (req, res) => {
  try {
    const { platform, username, followers, engagement } = req.body;
    const userId = req.user._id;

    const user = await updateSocialAccount(userId, platform, { username, followers, engagement });
    return successResponse(res, sanitizeUserData(user), 'Social account connected successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update FCM token (pass null or empty string to clear token on logout so same device doesn't get notifications for the previous user).
// When setting a non-null token: clear this exact token from EVERY user first, then assign to current user.
// That way the same device is only ever associated with one account (fixes duplicate notifications when switching accounts on same device).
const updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user._id;
    const value = fcmToken === '' || fcmToken === null || fcmToken === undefined ? null : String(fcmToken).trim() || null;

    if (value) {
      // Clear this device token from every user (including current) so only one account can have it after we set it below
      await User.updateMany(
        { fcmToken: value },
        { $set: { fcmToken: null } }
      );
    }

    await User.findByIdAndUpdate(userId, { fcmToken: value });
    return successResponse(res, null, value ? 'FCM token updated successfully' : 'FCM token cleared');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const checkUserExists = async (email) => {
  return await User.findOne({ email: email.toLowerCase() });
};

const createUser = async (userData) => {
  const userDataToSave = {
    name: sanitizeString(userData.name),
    email: userData.email.toLowerCase(),
    password: userData.password,
    role: userData.role,
    creatorRole: userData.creatorRole,
    location: userData.location ? sanitizeLocationData(userData.location) : undefined
  };

  // Add optional fields
  if (userData.services && Array.isArray(userData.services) && userData.services.length > 0) {
    userDataToSave.services = userData.services;
  }
  if (userData.bio) {
    userDataToSave.bio = sanitizeString(userData.bio);
  }
  if (userData.phone) {
    userDataToSave.phone = sanitizeString(userData.phone);
  }
  if (userData.website) {
    userDataToSave.website = sanitizeString(userData.website);
  }
  if (userData.profileImage) {
    userDataToSave.profileImage = userData.profileImage;
  }

  const user = new User(userDataToSave);
  return await user.save();
};

const findUserByEmail = async (email) => {
  return await User.findOne({ email: email.toLowerCase() }).select('+password');
};

const findUserById = async (userId) => {
  return await User.findById(userId);
};

const updateUserById = async (userId, updateData) => {
  return await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true });
};

const updateSocialAccount = async (userId, platform, accountData) => {
  const updateQuery = {};
  updateQuery[`socialAccounts.${platform}`] = {
    username: accountData.username,
    followers: accountData.followers || 0,
    engagement: accountData.engagement || 0,
    verified: false,
    connectedAt: new Date()
  };

  return await User.findByIdAndUpdate(userId, updateQuery, { new: true });
};

const sanitizeUserData = (user) => {
  const userObj = user.toObject();
  delete userObj.password;
  return userObj;
};

const sanitizeUpdateData = (data) => {
  const allowedFields = ['name', 'bio', 'phone', 'website', 'location'];
  const sanitized = {};

  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'location') {
        sanitized[field] = sanitizeLocationData(data[field]);
      } else {
        sanitized[field] = sanitizeString(data[field]);
      }
    }
  });

  return sanitized;
};

const sanitizeLocationData = (location) => {
  if (!location || typeof location !== 'object') return location;

  const sanitized = {};
  if (location.city) sanitized.city = sanitizeString(location.city);
  if (location.state) sanitized.state = sanitizeString(location.state);
  if (location.country) sanitized.country = sanitizeString(location.country);
  if (location.coordinates) {
    sanitized.coordinates = {
      latitude: location.coordinates.latitude,
      longitude: location.coordinates.longitude
    };
  }

  return sanitized;
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await findUserByEmail(email);
    if (!user) {
      return successResponse(res, null, 'If email exists, password reset link has been sent');
    }
    await processPasswordReset(user, email);
    return successResponse(res, null, 'Password reset link sent to your email');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await findUserByResetToken(token);
    if (!user) {
      return errorResponse(res, 'Invalid or expired reset token', 400);
    }
    await updatePasswordWithReset(user, password);
    return successResponse(res, null, 'Password reset successfully');
  } catch (error) {
    if (error.message.includes('save()')) {
      return errorResponse(res, 'An error occurred. Please try again.', 500);
    }
    return errorResponse(res, error.message, 500);
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const isValid = await validateOldPassword(req.user._id, oldPassword);
    if (!isValid) {
      return errorResponse(res, 'Current password is incorrect', 400);
    }
    await updatePassword(req.user._id, newPassword);
    return successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Helper functions
const processPasswordReset = async (user, email) => {
  const resetToken = user.generatePasswordResetToken();
  await user.save();
  const resetUrl = getResetUrl(resetToken);
  await sendPasswordResetEmail(email, resetToken, resetUrl);
};

const getResetUrl = (token) => {
  return `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
};

const hashResetToken = (token) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
};

const findUserByResetToken = async (token) => {
  const hashedToken = hashResetToken(token);
  return await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  }).select('+password');
};

const updatePasswordWithReset = async (user, password) => {
  user.password = password;
  user.clearPasswordResetToken();
  await user.save();
};

const validateOldPassword = async (userId, oldPassword) => {
  const user = await User.findById(userId).select('+password');
  return await user.comparePassword(oldPassword);
};

const updatePassword = async (userId, newPassword) => {
  const user = await User.findById(userId).select('+password');
  user.password = newPassword;
  await user.save();
};

const sendPasswordResetEmail = async (email, token, url) => {
  const { sendPasswordResetEmail: sendEmail } = require('../utils/emailService');
  return await sendEmail(email, token, url);
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  connectSocial,
  forgotPassword,
  resetPassword,
  changePassword,
  updateFcmToken,
  sanitizeUserData
};
