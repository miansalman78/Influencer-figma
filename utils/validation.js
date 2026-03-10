/**
 * Input Validation Utilities
 * 
 * Provides common validation functions for form inputs and user data.
 * 
 * Usage:
 * import { validateEmail, validateAmount, validateWithdrawAmount } from '../utils/validation';
 * 
 * const emailError = validateEmail(email);
 * if (emailError) {
 *   Alert.alert('Validation Error', emailError);
 * }
 */

/**
 * Validate email address
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return 'Email is required';
  }
  
  const trimmed = email.trim();
  if (!trimmed) {
    return 'Email is required';
  }
  
  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return 'Please enter a valid email address';
  }
  
  if (trimmed.length > 255) {
    return 'Email address is too long';
  }
  
  return null; // Valid
};

/**
 * Validate password
 */
export const validatePassword = (password, options = {}) => {
  const {
    minLength = 8,
    requireUpperCase = true,
    requireLowerCase = true,
    requireNumbers = true,
    requireSpecialChars = false,
  } = options;
  
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`;
  }
  
  if (requireUpperCase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  
  if (requireLowerCase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  
  if (requireNumbers && !/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  
  if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  
  return null; // Valid
};

/**
 * Validate amount (for payments, withdrawals, etc.)
 */
export const validateAmount = (amount, options = {}) => {
  const {
    min = 0,
    max = Infinity,
    allowZero = false,
    currency = 'USD',
  } = options;
  
  if (amount === null || amount === undefined || amount === '') {
    return { valid: false, error: 'Amount is required' };
  }
  
  // Convert to number
  const numAmount = typeof amount === 'string' ? parseFloat(amount.trim()) : Number(amount);
  
  // Check if it's a valid number
  if (isNaN(numAmount)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }
  
  // Check for Infinity
  if (!isFinite(numAmount)) {
    return { valid: false, error: 'Amount must be a finite number' };
  }
  
  // Check for negative numbers
  if (numAmount < 0) {
    return { valid: false, error: 'Amount cannot be negative' };
  }
  
  // Check for zero
  if (!allowZero && numAmount === 0) {
    return { valid: false, error: 'Amount must be greater than zero' };
  }
  
  // Check minimum
  if (numAmount < min) {
    const currencySymbol = currency === 'USD' ? '$' : '₦';
    return {
      valid: false,
      error: `Minimum amount is ${currencySymbol}${min.toLocaleString()}`,
    };
  }
  
  // Check maximum
  if (numAmount > max) {
    const currencySymbol = currency === 'USD' ? '$' : '₦';
    return {
      valid: false,
      error: `Maximum amount is ${currencySymbol}${max.toLocaleString()}`,
    };
  }
  
  // Check for too many decimal places (max 2 for currency)
  const decimalPlaces = (numAmount.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    return { valid: false, error: 'Amount cannot have more than 2 decimal places' };
  }
  
  return { valid: true, amount: numAmount };
};

/**
 * Validate withdrawal amount with currency-specific rules
 */
export const validateWithdrawAmount = (amount, walletBalance, currency = 'USD') => {
  // First validate as a general amount
  const minAmount = currency === 'USD' ? 10 : 1000;
  const validation = validateAmount(amount, {
    min: minAmount,
    allowZero: false,
    currency,
  });
  
  if (!validation.valid) {
    return validation;
  }
  
  const numAmount = validation.amount;
  
  // Check if amount exceeds balance
  if (walletBalance !== null && walletBalance !== undefined) {
    const balance = typeof walletBalance === 'number' ? walletBalance : parseFloat(walletBalance);
    if (!isNaN(balance) && numAmount > balance) {
      return { valid: false, error: 'Insufficient balance' };
    }
  }
  
  return validation;
};

/**
 * Validate phone number (basic validation)
 */
export const validatePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return 'Phone number is required';
  }
  
  const trimmed = phone.trim();
  if (!trimmed) {
    return 'Phone number is required';
  }
  
  // Remove common formatting characters
  const digitsOnly = trimmed.replace(/[\s\-\(\)\+]/g, '');
  
  // Check if it contains only digits (and optional + at start)
  if (!/^\+?[0-9]{10,15}$/.test(digitsOnly)) {
    return 'Please enter a valid phone number';
  }
  
  return null; // Valid
};

/**
 * Validate required field
 */
export const validateRequired = (value, fieldName = 'Field') => {
  if (value === null || value === undefined || value === '') {
    return `${fieldName} is required`;
  }
  
  if (typeof value === 'string' && value.trim() === '') {
    return `${fieldName} is required`;
  }
  
  return null; // Valid
};

/**
 * Validate URL
 */
export const validateURL = (url) => {
  if (!url || typeof url !== 'string') {
    return 'URL is required';
  }
  
  const trimmed = url.trim();
  if (!trimmed) {
    return 'URL is required';
  }
  
  try {
    new URL(trimmed);
    return null; // Valid
  } catch (error) {
    return 'Please enter a valid URL';
  }
};

/**
 * Sanitize string input (remove potentially dangerous characters)
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') {
    return input;
  }
  
  // Remove null bytes and control characters
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
};

/**
 * Validate and sanitize text input
 */
export const validateAndSanitizeText = (text, options = {}) => {
  const {
    maxLength = Infinity,
    minLength = 0,
    fieldName = 'Text',
    allowSpecialChars = true,
  } = options;
  
  if (!text || typeof text !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }
  
  const sanitized = sanitizeString(text);
  
  if (sanitized.length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }
  
  if (sanitized.length > maxLength) {
    return { valid: false, error: `${fieldName} must be no more than ${maxLength} characters` };
  }
  
  if (!allowSpecialChars && /[<>{}[\]\\]/.test(sanitized)) {
    return { valid: false, error: `${fieldName} contains invalid characters` };
  }
  
  return { valid: true, value: sanitized };
};

