const crypto = require('crypto');
const User = require('../models/User');

// Generate reset token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash reset token
const hashResetToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Find user by reset token
const findUserByResetToken = async (hashedToken) => {
  return await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });
};

// Clear reset token from user
const clearResetToken = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    passwordResetToken: undefined,
    passwordResetExpires: undefined
  });
};

module.exports = {
  generateResetToken,
  hashResetToken,
  findUserByResetToken,
  clearResetToken
};

